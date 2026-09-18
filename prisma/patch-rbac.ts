/**
 * Identity & Access demo, idempotent and non-destructive. Runs on every deploy:
 *  1. Backfills the capability model (capabilitiesJson), roleType and status on
 *     the roles that were seeded before those columns existed.
 *  2. Seeds two custom roles (a draft and one pending DPO approval) so the Role
 *     library and the Approval Queue have real states.
 *  3. Seeds role assignments with per-system provisioning grids (full / partial)
 *     and drift records (critical / minor, traceable / untraceable).
 * Everything is guarded so re-running changes nothing.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const j = (v: unknown) => JSON.stringify(v);

/** Capability sets keyed by the stable seed role id. */
const ROLE_CAPS: Record<string, { roleType: string; status: string; caps: string[] }> = {
  role_support: { roleType: "system", status: "approved", caps: ["requests.view", "inventory.review"] },
  role_engineer: { roleType: "system", status: "approved", caps: ["discovery.scan", "requests.view"] },
  role_branch: { roleType: "system", status: "approved", caps: ["requests.view", "consent.publish"] },
  role_auditor: { roleType: "system", status: "approved", caps: ["audit.view"] },
};

async function backfillRoleCaps() {
  for (const [id, v] of Object.entries(ROLE_CAPS)) {
    await prisma.rBACRole.updateMany({
      where: { id, capabilitiesJson: "[]" },
      data: { roleType: v.roleType, status: v.status, capabilitiesJson: j(v.caps) },
    });
  }
  // Any other pre-existing role with no capabilities → treat as an approved
  // system role with a minimal read capability, so nothing renders empty.
  await prisma.rBACRole.updateMany({ where: { capabilitiesJson: "[]" }, data: { roleType: "system", status: "approved", capabilitiesJson: j(["requests.view"]) } });
  console.log("patch-rbac: role capabilities backfilled.");
}

async function seedCustomRoles() {
  const rows = [
    { id: "role_custom_migration", name: "Data Migration Operator", description: "Runs one-off migrations between approved sources.", roleType: "custom", status: "draft", caps: ["discovery.scan", "sources.connect"], createdBy: "Ritu Nair", approvedBy: "—", selfApproved: false },
    { id: "role_custom_export", name: "Bulk Export Analyst", description: "Exports evidence packs for regulatory review.", roleType: "custom", status: "pending_dpo_approval", caps: ["audit.view", "audit.export"], createdBy: "Ritu Nair", approvedBy: "—", selfApproved: false },
    // Approved by the same person acting as DPO under combined governance —
    // carries the permanent self-approved marker to demo that history state.
    { id: "role_custom_support_lead", name: "Regional Support Lead", description: "Resolves escalated customer cases across a region.", roleType: "custom", status: "approved", caps: ["requests.view", "requests.execute"], createdBy: "Ritu Nair", approvedBy: "Ritu Nair", selfApproved: true },
  ];
  for (const r of rows) {
    if ((await prisma.rBACRole.count({ where: { id: r.id } })) > 0) continue;
    await prisma.rBACRole.create({
      data: {
        id: r.id, name: r.name, description: r.description, roleType: r.roleType, status: r.status,
        capabilitiesJson: j(r.caps), createdBy: r.createdBy,
        permissionsJson: j(r.caps), baselineSnapshotJson: j(r.caps), baselineCategoriesJson: j([]),
        baselineApprovedBy: r.approvedBy, selfApproved: r.selfApproved ?? false,
      },
    });
  }
  console.log("patch-rbac: custom roles ensured.");
}

async function seedAssignments() {
  if ((await prisma.roleAssignment.count()) > 0) { console.log("patch-rbac: assignments present, skipping."); return; }
  const entMeridian = (await prisma.entity.findFirst({ where: { id: "ent_meridian" }, select: { id: true } }))?.id ?? null;
  const entNorthgate = (await prisma.entity.findFirst({ where: { id: "ent_northgate" }, select: { id: true } }))?.id ?? null;
  const now = Date.now();
  const days = (n: number) => new Date(now - n * 86_400_000);

  // Fully provisioned, no drift.
  await prisma.roleAssignment.create({
    data: {
      id: "asn_support", roleId: "role_support", userName: "Arjun Rao", entityId: entMeridian,
      scopeSystemsJson: j(["Core Banking", "CRM"]), justification: "Front-line support for retail customers.",
      baselineSnapshotJson: j(["requests.view", "inventory.review"]), status: "active",
      provisioningJson: j([{ system: "Core Banking", status: "granted" }, { system: "CRM", status: "granted" }]),
      provisioningStatus: "granted", grantedAt: days(60),
    },
  });
  // Partially provisioned (one system failed) + critical drift.
  await prisma.roleAssignment.create({
    data: {
      id: "asn_engineer", roleId: "role_engineer", userName: "Neha Gupta", entityId: entMeridian,
      scopeSystemsJson: j(["Core Banking", "Data Warehouse"]), justification: "Maintains the reporting pipeline.",
      baselineSnapshotJson: j(["discovery.scan", "requests.view"]), status: "active",
      provisioningJson: j([{ system: "Core Banking", status: "granted" }, { system: "Data Warehouse", status: "failed", detail: "Connector timed out after 30s — token may be expired." }]),
      provisioningStatus: "partial", grantedAt: days(40),
    },
  });
  // Fully provisioned + minor, untraceable drift.
  await prisma.roleAssignment.create({
    data: {
      id: "asn_branch", roleId: "role_branch", userName: "Sunita Devi", entityId: entNorthgate,
      scopeSystemsJson: j(["Branch"]), justification: "Counter services at the Northgate branch.",
      baselineSnapshotJson: j(["requests.view", "consent.publish"]), status: "active",
      provisioningJson: j([{ system: "Branch", status: "granted" }]),
      provisioningStatus: "granted", grantedAt: days(90),
    },
  });
  console.log("patch-rbac: assignments seeded.");
}

async function seedDrift() {
  if ((await prisma.driftRecord.count()) > 0) { console.log("patch-rbac: drift present, skipping."); return; }
  const now = Date.now();
  const days = (n: number) => new Date(now - n * 86_400_000);
  if ((await prisma.roleAssignment.count({ where: { id: "asn_engineer" } })) > 0) {
    // Critical: gained a high-sensitivity capability beyond baseline.
    await prisma.driftRecord.create({
      data: {
        id: "drift_engineer", assignmentId: "asn_engineer",
        baselineSnapshotJson: j(["discovery.scan", "requests.view"]),
        currentSnapshotJson: j(["discovery.scan", "requests.view", "audit.export"]),
        severity: "critical", resolution: "unresolved", traceable: true,
        changeTrace: "Added by HR system sync on " + days(7).toISOString().slice(0, 10) + " during a group-membership change.",
        detectedAt: days(2),
      },
    });
  }
  if ((await prisma.roleAssignment.count({ where: { id: "asn_branch" } })) > 0) {
    // Minor + untraceable → routes to manual investigation.
    await prisma.driftRecord.create({
      data: {
        id: "drift_branch", assignmentId: "asn_branch",
        baselineSnapshotJson: j(["requests.view", "consent.publish"]),
        currentSnapshotJson: j(["requests.view", "consent.publish", "discovery.scan"]),
        severity: "minor", resolution: "unresolved", traceable: false,
        changeTrace: null, detectedAt: days(2),
      },
    });
  }
  console.log("patch-rbac: drift seeded.");
}

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-rbac: no DATABASE_URL, skipping."); return; }
  await backfillRoleCaps();
  await seedCustomRoles();
  await seedAssignments();
  await seedDrift();
}

main()
  .catch((error) => console.error("patch-rbac failed (continuing):", error))
  .finally(async () => { await prisma.$disconnect(); });
