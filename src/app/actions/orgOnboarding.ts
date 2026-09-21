"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { audited } from "@/lib/engines/audit";
import type { TxClient } from "@/lib/tx";
import type { ActionResult } from "@/app/actions/requests";
import { GOVERNANCE } from "@/lib/governance";

const SIZES = ["startup", "mid_market", "enterprise"];
const GOV = [GOVERNANCE.DEDICATED, GOVERNANCE.COMBINED] as string[];

async function ensureOrg(tx: TxClient) {
  return tx.orgSettings.upsert({ where: { id: "org" }, update: {}, create: { id: "org" } });
}

/** Mirror org-level governance from the per-entity answers: combined if ANY entity
 *  is combined (the stricter routing), else dedicated. Keeps the approval flow working. */
async function mirrorOrgGovernance(tx: TxClient) {
  const entities = await tx.entity.findMany({ select: { governanceStructure: true } });
  const anyCombined = entities.some((e) => e.governanceStructure === GOVERNANCE.COMBINED);
  await tx.orgSettings.update({ where: { id: "org" }, data: { governanceStructure: anyCombined ? GOVERNANCE.COMBINED : GOVERNANCE.DEDICATED } });
}

function run(op: () => Promise<unknown>, ...paths: string[]): Promise<ActionResult> {
  return (async () => {
    try {
      await op();
      for (const p of ["/dashboard", "/get-started", ...paths]) revalidatePath(p, "layout");
      return { ok: true };
    } catch (error) { const e = error as Error; return { ok: false, error: e.message, errorKind: e.name }; }
  })();
}

/** Screen 1 — org size. */
export async function setOrgSizeAction(tier: string): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!SIZES.includes(tier)) return { ok: false, error: "Choose an organization size.", errorKind: "ValidationError" };
  return run(() => audited(
    { actor, action: "onboarding.size_set", targetType: "OrgSettings", targetId: "org", payload: { tier } },
    async (tx: TxClient) => { await ensureOrg(tx); return tx.orgSettings.update({ where: { id: "org" }, data: { sizeTier: tier } }); },
  ));
}

/** Lean path — org name + one governance answer; auto-creates the single entity. */
export async function completeLeanAction(orgName: string, governance: string): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!orgName.trim()) return { ok: false, error: "Name your organization.", errorKind: "ValidationError" };
  if (!GOV.includes(governance)) return { ok: false, error: "Answer the governance question.", errorKind: "ValidationError" };
  return run(() => audited(
    { actor, action: "onboarding.lean_completed", targetType: "OrgSettings", targetId: "org", payload: { governance } },
    async (tx: TxClient) => {
      await ensureOrg(tx);
      await tx.orgSettings.update({ where: { id: "org" }, data: { name: orgName.trim(), governanceStructure: governance, provisionBannerDismissed: false, gettingStartedDismissed: false, singleUser: true } });
      // Auto-create the one entity, named after the org, carrying the answer.
      const existing = await tx.entity.findFirst({ where: { name: orgName.trim() } });
      if (!existing) await tx.entity.create({ data: { name: orgName.trim(), kind: "legal_entity", governanceStructure: governance } });
      return null;
    },
  ), "/access/organization");
}

/** Structured Screen 4 — bulk-create entities (dedupe against existing + within input). */
export async function createEntitiesAction(names: string[]): Promise<ActionResult> {
  const { actor } = await getSession();
  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (clean.length === 0) return { ok: false, error: "Add at least one entity.", errorKind: "ValidationError" };
  return run(() => audited(
    { actor, action: "onboarding.entities_created", targetType: "Entity", targetId: "bulk", payload: { count: clean.length } },
    async (tx: TxClient) => {
      await ensureOrg(tx);
      const existing = await tx.entity.findMany({ select: { name: true } });
      const have = new Set(existing.map((e) => e.name.toLowerCase()));
      for (const name of clean) {
        if (have.has(name.toLowerCase())) continue;
        await tx.entity.create({ data: { name, kind: "legal_entity", governanceStructure: null } });
      }
      // If no org name yet (structured path doesn't ask one), adopt the first entity's.
      const org = await tx.orgSettings.findUnique({ where: { id: "org" } });
      if (!org?.name) await tx.orgSettings.update({ where: { id: "org" }, data: { name: clean[0] } });
      return null;
    },
  ));
}

/** Structured Screen 5 — governance per entity (map of entityId → answer). */
export async function setEntitiesGovernanceAction(answers: { entityId: string; governance: string }[]): Promise<ActionResult> {
  const { actor } = await getSession();
  if (answers.some((a) => !GOV.includes(a.governance))) return { ok: false, error: "Every entity needs an explicit answer.", errorKind: "ValidationError" };
  return run(() => audited(
    { actor, action: "onboarding.entity_governance_set", targetType: "Entity", targetId: "bulk", payload: { count: answers.length } },
    async (tx: TxClient) => {
      for (const a of answers) await tx.entity.update({ where: { id: a.entityId }, data: { governanceStructure: a.governance } });
      await mirrorOrgGovernance(tx);
      return null;
    },
  ), "/access/organization");
}

export interface BulkInvite { email: string; roleId: string; entityId?: string | null }

/** Structured Screen 6 — send bulk invites, creating RoleAssignments the SAME way
 *  the standalone Assignment Flow does (baseline snapshot + provisioning grid). */
export async function sendBulkInvitesAction(invites: BulkInvite[]): Promise<ActionResult> {
  const { actor } = await getSession();
  if (invites.length === 0) return { ok: false, error: "Add at least one invitee.", errorKind: "ValidationError" };
  if (invites.some((i) => !i.email.trim())) return { ok: false, error: "Every invitee needs an email.", errorKind: "ValidationError" };
  if (invites.some((i) => !i.roleId)) return { ok: false, error: "Every invitee must have a role — none are auto-assigned.", errorKind: "ValidationError" };
  return run(() => audited(
    { actor, action: "onboarding.invites_sent", targetType: "RoleAssignment", targetId: "bulk", payload: { count: invites.length } },
    async (tx: TxClient) => {
      await ensureOrg(tx);
      const systems = await tx.connectedSystem.findMany({ select: { name: true }, take: 1 });
      const scope = systems.map((s) => s.name);
      for (const inv of invites) {
        const role = await tx.rBACRole.findUniqueOrThrow({ where: { id: inv.roleId } });
        const grid = scope.map((system) => ({ system, status: "granted" as const }));
        await tx.roleAssignment.create({
          data: {
            roleId: inv.roleId, userName: inv.email.trim(), entityId: inv.entityId || null,
            scopeSystemsJson: JSON.stringify(scope), justification: "Onboarding bulk invite",
            baselineSnapshotJson: role.capabilitiesJson, status: "active",
            provisioningJson: JSON.stringify(grid), provisioningStatus: grid.length ? "granted" : "pending",
          },
        });
      }
      await tx.orgSettings.update({ where: { id: "org" }, data: { provisionBannerDismissed: false, gettingStartedDismissed: false } });
      return null;
    },
  ), "/access/assignments");
}

// -- Dashboard banner controls ----------------------------------------------
export async function dismissProvisionBannerAction(): Promise<ActionResult> {
  return run(async () => { await db.orgSettings.upsert({ where: { id: "org" }, update: { provisionBannerDismissed: true }, create: { id: "org", provisionBannerDismissed: true } }); });
}
export async function dismissGettingStartedAction(): Promise<ActionResult> {
  return run(async () => { await db.orgSettings.upsert({ where: { id: "org" }, update: { gettingStartedDismissed: true }, create: { id: "org", gettingStartedDismissed: true } }); });
}
export async function renameEntityAction(entityId: string, name: string): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!name.trim()) return { ok: false, error: "Name can't be empty.", errorKind: "ValidationError" };
  return run(() => audited(
    { actor, action: "entity.renamed", targetType: "Entity", targetId: entityId, payload: { name: name.trim() } },
    (tx: TxClient) => tx.entity.update({ where: { id: entityId }, data: { name: name.trim() } }),
  ));
}
