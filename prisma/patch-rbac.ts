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

/**
 * Onboarding defaults for the long-lived demo: mark it already-configured so the
 * onboarding banners don't fire on the seeded dashboard, and give existing
 * entities a governance answer (they predate the per-entity field) so the
 * non-dismissible incomplete-state banner stays quiet. A genuinely fresh org
 * (no entities / null governance) still triggers the safety net.
 */
async function seedOnboardingDefaults() {
  await prisma.orgSettings.upsert({
    where: { id: "org" },
    update: {},
    create: { id: "org", governanceStructure: "dedicated_dpo" },
  });
  const org = await prisma.orgSettings.findUnique({ where: { id: "org" } });
  if (org && !org.name) {
    await prisma.orgSettings.update({ where: { id: "org" }, data: { name: "Meridian Financial Services", sizeTier: "mid_market", provisionBannerDismissed: true } });
  }
  // Existing entities predate per-entity governance — default them so the demo
  // reads as fully configured. Fresh onboarding sets these explicitly.
  await prisma.entity.updateMany({ where: { governanceStructure: null }, data: { governanceStructure: "dedicated_dpo" } });

  // Settings → Users demo: show Active / Deactivated / Invited. Run once (guarded
  // on whether any non-active account status already exists), mapped off the
  // seeded employment states so it's deterministic without inventing users.
  const nonActive = await prisma.internalUser.count({ where: { accountStatus: { in: ["invited", "deactivated"] } } });
  if (nonActive === 0) {
    await prisma.internalUser.updateMany({ where: { employmentStatus: "offboarded" }, data: { accountStatus: "deactivated" } });
    await prisma.internalUser.updateMany({ where: { employmentStatus: "on_notice" }, data: { accountStatus: "invited" } });
  }
  console.log("patch-rbac: onboarding defaults ensured.");
}

/**
 * Demo notifications for the header bell — including the specific gap this closes:
 * a repeat integration-sync failure surfaced as Critical. Seeded once (guarded on
 * whether the admin role already has any notifications).
 */
async function seedNotifications() {
  if ((await prisma.notification.count({ where: { targetRole: "admin" } })) > 0) return;
  const src = (await prisma.discoverySource.findFirst({ where: { scanStatus: "failed" }, select: { id: true, name: true } }))
    ?? (await prisma.discoverySource.findFirst({ select: { id: true, name: true } }));
  const now = Date.now();
  const mins = (m: number) => new Date(now - m * 60_000);
  await prisma.notification.createMany({
    data: [
      {
        targetRole: "admin", triggerEvent: "integration.sync_failed", category: "integration_sync_failure",
        title: `Repeat sync failure — ${src?.name ?? "Marketing Automation"}`,
        body: `${src?.name ?? "Marketing Automation"} has now failed 2 consecutive syncs (TIMED_OUT). This needs attention — data from it is going stale.`,
        linkedHref: src ? `/discovery/sources/${src.id}` : "/discovery/sources", severity: "critical", createdAt: mins(8),
      },
      {
        targetRole: "admin", triggerEvent: "drift.detected", category: "drift_detected",
        title: "Access drifted from its approved baseline",
        body: "Data Engineer · Neha Gupta gained a capability beyond baseline. Review and correct or re-approve.",
        linkedHref: "/access/drift", severity: "warning", createdAt: mins(40),
      },
      {
        targetRole: "admin", triggerEvent: "general.activity", category: "general_activity",
        title: "Weekly drift scan completed",
        body: "The scheduled least-privilege scan finished. 1 new drift found.",
        linkedHref: "/access/drift", severity: "info", createdAt: mins(180),
      },
    ],
  });
  console.log("patch-rbac: demo notifications seeded.");
}

/** Demo for Insights (dormant accounts) + Assessments (certification campaigns). */
async function seedInsightsAssessments() {
  // Dormant accounts: make a couple of seeded accounts look dormant, one a
  // service account (long threshold) and one human, both past threshold.
  if ((await prisma.systemAccount.count({ where: { accountType: "service" } })) === 0) {
    const accts = await prisma.systemAccount.findMany({ take: 3, orderBy: { username: "asc" } });
    const old = new Date(Date.now() - 210 * 86_400_000);
    if (accts[0]) await prisma.systemAccount.update({ where: { id: accts[0].id }, data: { accountType: "service", lastActiveAt: old } });
    if (accts[1]) await prisma.systemAccount.update({ where: { id: accts[1].id }, data: { accountType: "human", lastActiveAt: new Date(Date.now() - 95 * 86_400_000) } });
  }

  // Certification campaigns: one in-progress (partly reviewed), one overdue.
  if ((await prisma.certificationCampaign.count()) === 0) {
    const assignments = await prisma.roleAssignment.findMany({ where: { status: "active" }, include: { role: true } });
    if (assignments.length > 0) {
      const now = Date.now();
      const ctx = (a: (typeof assignments)[number]) => JSON.stringify({ user: a.userName, role: a.role.name, approvedBy: a.role.baselineApprovedBy, grantedAt: a.grantedAt.toISOString(), justification: a.justification });
      // In-progress, due in the future, first item certified.
      const inprog = await prisma.certificationCampaign.create({ data: { name: "Q3 2026 access certification", scheduledFor: new Date(now - 3 * 86_400_000), dueDate: new Date(now + 11 * 86_400_000), status: "in_progress" } });
      for (let i = 0; i < assignments.length; i++) {
        const a = assignments[i];
        await prisma.certificationItem.create({ data: { campaignId: inprog.id, assignmentId: a.id, reviewerId: a.role.name, originalGrantContextJson: ctx(a), decision: i === 0 ? "certified" : null, decidedAt: i === 0 ? new Date(now - 86_400_000) : null } });
      }
      // Overdue: due in the past, items still unreviewed.
      const overdue = await prisma.certificationCampaign.create({ data: { name: "Q2 2026 access certification", scheduledFor: new Date(now - 100 * 86_400_000), dueDate: new Date(now - 20 * 86_400_000), status: "in_progress" } });
      for (const a of assignments) {
        await prisma.certificationItem.create({ data: { campaignId: overdue.id, assignmentId: a.id, reviewerId: a.role.name, originalGrantContextJson: ctx(a) } });
      }
    }
  }
  console.log("patch-rbac: insights + assessments demo seeded.");
}

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-rbac: no DATABASE_URL, skipping."); return; }
  await backfillRoleCaps();
  await seedCustomRoles();
  await seedAssignments();
  await seedDrift();
  await seedOnboardingDefaults();
  await seedNotifications();
  await seedInsightsAssessments();
}

main()
  .catch((error) => console.error("patch-rbac failed (continuing):", error))
  .finally(async () => { await prisma.$disconnect(); });
