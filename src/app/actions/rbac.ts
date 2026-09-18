"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { audited } from "@/lib/engines/audit";
import type { TxClient } from "@/lib/tx";
import type { ActionResult } from "@/app/actions/requests";
import { sodConflicts } from "@/lib/rbac";
import { isCombinedGovernance } from "@/lib/governance";

const ROLES_PATH = "/access/roles";

async function run(operation: () => Promise<unknown>, ...paths: string[]): Promise<ActionResult> {
  try {
    await operation();
    for (const p of [ROLES_PATH, ...paths]) revalidatePath(p, "layout");
    return { ok: true };
  } catch (error) {
    const e = error as Error;
    return { ok: false, error: e.message, errorKind: e.name };
  }
}

/**
 * Compose (or update) a custom role from atomic capabilities. SoD is validated
 * server-side too — the composer blocks it in the UI, but the rule holds even if
 * the UI is bypassed. Saved as a draft, or submitted for DPO approval.
 */
export async function composeRoleAction(input: {
  roleId?: string | null;
  name: string;
  description: string;
  capabilityIds: string[];
  submit: boolean;
}): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!input.name.trim()) return { ok: false, error: "Name the role.", errorKind: "ValidationError" };
  if (input.capabilityIds.length === 0) return { ok: false, error: "A role needs at least one capability.", errorKind: "ValidationError" };
  const conflicts = sodConflicts(input.capabilityIds);
  if (conflicts.length > 0) {
    return { ok: false, error: `Separation-of-duties conflict: ${conflicts[0].rule.rule}`, errorKind: "SodError" };
  }
  const status = input.submit ? "pending_dpo_approval" : "draft";
  const capsJson = JSON.stringify(input.capabilityIds);
  return run(() =>
    audited(
      { actor, action: input.roleId ? "role.updated" : "role.composed", targetType: "RBACRole", targetId: input.name.trim(), payload: { status, capabilities: input.capabilityIds } },
      (tx: TxClient) =>
        input.roleId
          ? tx.rBACRole.update({ where: { id: input.roleId }, data: { name: input.name.trim(), description: input.description.trim(), capabilitiesJson: capsJson, permissionsJson: capsJson, status } })
          : tx.rBACRole.create({ data: { name: input.name.trim(), description: input.description.trim(), roleType: "custom", status, capabilitiesJson: capsJson, permissionsJson: capsJson, baselineSnapshotJson: capsJson, createdBy: actor.label, baselineApprovedBy: "—" } }),
    ),
    "/access/approval-queue",
  );
}

/**
 * Ratify a pending custom role. Normally DPO/CISO only; under combined_admin_dpo
 * governance the Admin approves in a DPO capacity, and the record is stamped
 * self_approved (system-computed, never skipped). The review step always runs.
 */
export async function approveRoleAction(roleId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  const combined = await isCombinedGovernance();
  const allowed = actor.role === "dpo" || actor.role === "ciso" || (combined && actor.role === "admin");
  if (!allowed) {
    return { ok: false, error: "Only the DPO or CISO can approve a role. Switch role to approve.", errorKind: "UnauthorisedRulingError" };
  }
  return run(() =>
    audited(
      { actor, action: "role.approved", targetType: "RBACRole", targetId: roleId, payload: { approvedBy: actor.label, selfApproved: combined } },
      (tx: TxClient) => tx.rBACRole.update({ where: { id: roleId }, data: { status: "approved", baselineApprovedBy: actor.label, baselineApprovedAt: new Date(), selfApproved: combined } }),
    ),
    "/access/approval-queue", "/governance",
  );
}

/** DPO/CISO rejects a pending role back to draft, with a reason. */
export async function rejectRoleAction(roleId: string, reason: string): Promise<ActionResult> {
  const { actor } = await getSession();
  const combined = await isCombinedGovernance();
  if (actor.role !== "dpo" && actor.role !== "ciso" && !(combined && actor.role === "admin")) {
    return { ok: false, error: "Only the DPO or CISO can reject a role. Switch role to decide.", errorKind: "UnauthorisedRulingError" };
  }
  if (!reason.trim()) return { ok: false, error: "A rejection needs a reason.", errorKind: "ValidationError" };
  return run(() =>
    audited(
      { actor, action: "role.rejected", targetType: "RBACRole", targetId: roleId, payload: { reason: reason.trim() } },
      (tx: TxClient) => tx.rBACRole.update({ where: { id: roleId }, data: { status: "draft" } }),
    ),
    "/access/approval-queue",
  );
}

/** Archive a custom role (soft — status back to draft is not archive; we delete
 *  only unassigned custom drafts). Kept minimal and safe. */
export async function archiveRoleAction(roleId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() =>
    audited(
      { actor, action: "role.archived", targetType: "RBACRole", targetId: roleId, payload: {} },
      async (tx: TxClient) => {
        const role = await tx.rBACRole.findUniqueOrThrow({ where: { id: roleId }, include: { assignments: true } });
        if (role.roleType !== "custom") throw Object.assign(new Error("System roles cannot be archived — they are governance-owned."), { name: "PolicyError" });
        if (role.assignments.length > 0) throw Object.assign(new Error("This role has active assignments; revoke them first."), { name: "StateError" });
        return tx.rBACRole.delete({ where: { id: roleId } });
      },
    ),
  );
}

/**
 * Assign an approved role to a person, scoped to systems, with a justification.
 * Snapshots the role's capabilities as the baseline, and writes a per-system
 * provisioning grid so a partial failure is never reported as success.
 */
export async function assignRoleAction(input: {
  roleId: string;
  userName: string;
  entityId?: string | null;
  scopeSystems: string[];
  justification: string;
}): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!input.userName.trim()) return { ok: false, error: "Choose who this is for.", errorKind: "ValidationError" };
  if (!input.justification.trim()) return { ok: false, error: "A justification is required — it is the evidence for the grant.", errorKind: "ValidationError" };
  if (input.scopeSystems.length === 0) return { ok: false, error: "Select at least one system for the scope.", errorKind: "ValidationError" };
  return run(() =>
    audited(
      { actor, action: "assignment.granted", targetType: "RoleAssignment", targetId: input.userName.trim(), payload: { roleId: input.roleId, scope: input.scopeSystems } },
      async (tx: TxClient) => {
        const role = await tx.rBACRole.findUniqueOrThrow({ where: { id: input.roleId } });
        if (role.status !== "approved") throw Object.assign(new Error("Only an approved role can be assigned."), { name: "StateError" });
        const grid = input.scopeSystems.map((system) => ({ system, status: "granted" as const }));
        return tx.roleAssignment.create({
          data: {
            roleId: input.roleId, userName: input.userName.trim(), entityId: input.entityId || null,
            scopeSystemsJson: JSON.stringify(input.scopeSystems), justification: input.justification.trim(),
            baselineSnapshotJson: role.capabilitiesJson, status: "active",
            provisioningJson: JSON.stringify(grid), provisioningStatus: "granted",
          },
        });
      },
    ),
    "/access/assignments",
  );
}

/** Retry a failed system on a partially-provisioned assignment. */
export async function retryProvisioningAction(assignmentId: string, system: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() =>
    audited(
      { actor, action: "assignment.retry", targetType: "RoleAssignment", targetId: assignmentId, payload: { system } },
      async (tx: TxClient) => {
        const a = await tx.roleAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
        const grid = (JSON.parse(a.provisioningJson || "[]") as { system: string; status: string; detail?: string }[]).map((g) =>
          g.system === system ? { system: g.system, status: "granted" } : g,
        );
        const status = grid.every((g) => g.status === "granted") ? "granted" : grid.some((g) => g.status === "granted") ? "partial" : "failed";
        return tx.roleAssignment.update({ where: { id: assignmentId }, data: { provisioningJson: JSON.stringify(grid), provisioningStatus: status } });
      },
    ),
    "/access/assignments",
  );
}

/**
 * Resolve a drift: correct back to baseline (revert the current capabilities to
 * the snapshot), or request retroactive approval (routes to the DPO — baseline is
 * only updated once cleared). Every drift ends in a recorded decision.
 */
export async function resolveDriftAction(driftId: string, resolution: "corrected" | "retroactively_approved"): Promise<ActionResult> {
  const { actor } = await getSession();
  const combined = await isCombinedGovernance();
  return run(() =>
    audited(
      { actor, action: resolution === "corrected" ? "drift.corrected" : "drift.retro_requested", targetType: "DriftRecord", targetId: driftId, payload: { resolution, selfApproved: resolution === "retroactively_approved" && combined } },
      async (tx: TxClient) => {
        const d = await tx.driftRecord.findUniqueOrThrow({ where: { id: driftId } });
        // Retroactive approval needs a DPO — unless the org is combined, where the
        // Admin approves in a DPO capacity and it is recorded as self-approved.
        if (resolution === "retroactively_approved" && actor.role !== "dpo" && actor.role !== "ciso" && !(combined && actor.role === "admin")) {
          throw Object.assign(new Error("Retroactive approval must be cleared by the DPO. Switch to the DPO role to approve, or choose “Correct to baseline”."), { name: "UnauthorisedRulingError" });
        }
        return tx.driftRecord.update({
          where: { id: driftId },
          data: {
            resolution, resolvedBy: actor.label, resolvedAt: new Date(),
            baselineSnapshotJson: resolution === "retroactively_approved" ? d.currentSnapshotJson : d.baselineSnapshotJson,
            selfApproved: resolution === "retroactively_approved" && combined,
          },
        });
      },
    ),
    "/access/drift",
  );
}
