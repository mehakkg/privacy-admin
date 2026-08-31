import { db } from "@/lib/db";
import type { TxClient } from "@/lib/tx";
import { audited, type AuditActor } from "@/lib/engines/audit";
import { emit } from "@/lib/engines/notification";
import { decodeList, encodeList, encodeObject } from "@/lib/codec/json";

/**
 * RBAC BASELINE GATE (criteria 5 and 6, applied to Scenario 2)
 *
 * A role's `baselineSnapshotJson` is the CISO-approved definition of what that
 * role is allowed to reach. `permissionsJson` is what it currently grants.
 *
 * Admin owns the role EDITOR — narrowing a role, removing a permission, fixing
 * drift — because that is technical work within an approved envelope.
 *
 * Admin does NOT own the baseline. Adding a permission the baseline does not
 * contain widens the role beyond what was approved, which is a governance
 * change wearing technical clothes. `assertWithinBaseline` refuses it and the
 * UI offers an escalation instead, exactly as the retention gate does for
 * erasure.
 *
 * The asymmetry is the point: making access narrower is always allowed, making
 * it wider needs a decision from the person accountable for it.
 */

export class BaselineViolationError extends Error {
  readonly excess: string[];

  constructor(roleName: string, excess: string[]) {
    super(
      `Cannot add ${excess.join(", ")} to ${roleName}: ` +
        `${excess.length === 1 ? "it is" : "they are"} outside the CISO-approved ` +
        `baseline for this role. Widening a role beyond its baseline is a ` +
        `governance change — raise it with the CISO. Narrowing the role, or ` +
        `removing drift, can be done here.`,
    );
    this.name = "BaselineViolationError";
    this.excess = excess;
  }
}

export interface RoleDrift {
  roleId: string;
  roleName: string;
  description: string;
  current: string[];
  baseline: string[];
  /** Granted now but NOT in the baseline — unapproved widening. */
  excess: string[];
  /** In the baseline but not currently granted — narrower than approved, fine. */
  missing: string[];
  hasDrift: boolean;
  baselineApprovedBy: string;
  baselineApprovedAt: Date;
}

export function analyseRole(role: {
  id: string;
  name: string;
  description: string;
  permissionsJson: string;
  baselineSnapshotJson: string;
  baselineApprovedBy: string;
  baselineApprovedAt: Date;
}): RoleDrift {
  const current = decodeList(role.permissionsJson);
  const baseline = decodeList(role.baselineSnapshotJson);
  const excess = current.filter((p) => !baseline.includes(p));
  const missing = baseline.filter((p) => !current.includes(p));

  return {
    roleId: role.id,
    roleName: role.name,
    description: role.description,
    current,
    baseline,
    excess,
    missing,
    // Only unapproved WIDENING counts as drift worth flagging. A role narrower
    // than its baseline is not a security problem.
    hasDrift: excess.length > 0,
    baselineApprovedBy: role.baselineApprovedBy,
    baselineApprovedAt: role.baselineApprovedAt,
  };
}

export async function listRoleDrift(): Promise<RoleDrift[]> {
  const roles = await db.rBACRole.findMany({ orderBy: { name: "asc" } });
  return roles.map(analyseRole);
}

export function assertWithinBaseline(
  roleName: string,
  nextPermissions: readonly string[],
  baseline: readonly string[],
): void {
  const excess = nextPermissions.filter((p) => !baseline.includes(p));
  if (excess.length > 0) throw new BaselineViolationError(roleName, excess);
}

/**
 * Edit a role's permissions. Refuses anything outside the baseline.
 */
export async function updateRolePermissions(
  roleId: string,
  nextPermissions: string[],
  actor: AuditActor,
) {
  const role = await db.rBACRole.findUniqueOrThrow({ where: { id: roleId } });
  const baseline = decodeList(role.baselineSnapshotJson);
  const previous = decodeList(role.permissionsJson);

  assertWithinBaseline(role.name, nextPermissions, baseline);

  return audited(
    {
      actor,
      action: "rbac.role_updated",
      targetType: "RBACRole",
      targetId: roleId,
      payload: {
        role: role.name,
        previous,
        next: nextPermissions,
        removed: previous.filter((p) => !nextPermissions.includes(p)),
        added: nextPermissions.filter((p) => !previous.includes(p)),
        baseline,
      },
    },
    (tx: TxClient) =>
      tx.rBACRole.update({
        where: { id: roleId },
        data: { permissionsJson: encodeList(nextPermissions) },
      }),
  );
}

/**
 * Remove every permission a role holds beyond its baseline, in one action.
 *
 * Always permitted: this only ever narrows access back to what was approved.
 */
export async function correctDrift(roleId: string, actor: AuditActor) {
  const role = await db.rBACRole.findUniqueOrThrow({ where: { id: roleId } });
  const drift = analyseRole(role);
  const corrected = drift.current.filter((p) => drift.baseline.includes(p));

  return audited(
    {
      actor,
      action: "rbac.drift_corrected",
      targetType: "RBACRole",
      targetId: roleId,
      payload: {
        role: role.name,
        removed: drift.excess,
        remaining: corrected,
        baselineApprovedBy: role.baselineApprovedBy,
      },
    },
    (tx: TxClient) =>
      tx.rBACRole.update({
        where: { id: roleId },
        data: { permissionsJson: encodeList(corrected) },
      }),
  );
}

/**
 * Ask the CISO to widen a baseline. The only route to a wider role.
 */
export async function requestBaselineChange(
  roleId: string,
  requested: string[],
  reason: string,
  actor: AuditActor,
) {
  const role = await db.rBACRole.findUniqueOrThrow({ where: { id: roleId } });
  const baseline = decodeList(role.baselineSnapshotJson);

  const context = {
    roleId,
    role: role.name,
    currentBaseline: baseline,
    requestedAdditions: requested.filter((p) => !baseline.includes(p)),
    requestedBy: actor.label,
    reason,
  };

  const escalation = await audited(
    {
      actor,
      action: "rbac.baseline_change_requested",
      targetType: "RBACRole",
      targetId: roleId,
      payload: context,
    },
    (tx: TxClient) =>
      tx.escalation.create({
        data: {
          sourceRole: actor.role,
          targetRole: "ciso",
          reason,
          contextJson: encodeObject(context),
          status: "open",
        },
      }),
  );

  await emit(db, {
    kind: "escalation.raised",
    requestId: null,
    requestRef: `Role baseline — ${role.name}`,
    reason,
    targetRole: "ciso",
  });

  return escalation;
}
