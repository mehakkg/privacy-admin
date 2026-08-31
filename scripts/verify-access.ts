/**
 * Scenario 2 acceptance verification.
 *
 * Same discipline as scripts/verify.ts: exercise the engines and guards
 * directly, because a disabled control proves nothing about what the server
 * would accept.
 *
 * Run: npx tsx scripts/verify-access.ts   (then: npm run db:seed)
 */

import { db } from "../src/lib/db";
import {
  computeRevocationCompletion,
  deprovisionUser,
  grantAccess,
  recordDisposition,
  terminateSession,
  analyseGrant,
} from "../src/lib/engines/access";
import {
  analyseRole,
  correctDrift,
  updateRolePermissions,
} from "../src/lib/guards/baselineGate";
import type { AuditActor } from "../src/lib/engines/audit";
import { verifyChain } from "../src/lib/engines/audit";
import type { CompletionState } from "../src/lib/domain";

const ADMIN: AuditActor = { id: "act_admin", label: "R. Iyer", role: "admin" };

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail: string) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}\n        ${detail}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}\n        ${detail}`);
  }
}

async function expectThrow(name: string, fn: () => Promise<unknown>, errorName: string) {
  try {
    await fn();
    check(name, false, `Expected ${errorName}, but the call SUCCEEDED.`);
  } catch (error) {
    const e = error as Error;
    check(
      name,
      e.name === errorName,
      e.name === errorName
        ? `Refused with ${e.name}: ${e.message.slice(0, 140)}…`
        : `Expected ${errorName}, got ${e.name}: ${e.message}`,
    );
  }
}

async function main() {
  console.log("\n=== Least privilege is enforced at the point of granting ===");
  {
    await expectThrow(
      "Granting a scope wider than the role's baseline is refused",
      () =>
        // Support Agent's baseline covers identity/contact/support, not kyc.
        grantAccess("acc_vikram_core", "role_support", ["identity", "kyc"], null, ADMIN),
      "OverBroadGrantError",
    );

    const ok = await grantAccess(
      "acc_vikram_core",
      "role_support",
      ["identity", "contact"],
      null,
      ADMIN,
    );
    check(
      "A grant inside the baseline is allowed",
      ok.id.length > 0,
      `granted role_support scoped to identity, contact`,
    );

    const seeded = await db.accessGrant.findFirstOrThrow({
      where: { accountId: "acc_priya_mkt" },
      include: { role: true },
    });
    const analysis = analyseGrant(seeded, seeded.role);
    check(
      "A pre-existing over-broad grant is detected, not silently tolerated",
      analysis.overBroad && analysis.excessCategories.includes("marketing"),
      `${analysis.roleName} reaches ${analysis.excessCategories.join(", ")} beyond its baseline`,
    );
  }

  console.log("\n=== Revocation is three-state, and a live token blocks 'verified' ===");
  {
    const before = await computeRevocationCompletion("iu_priya");
    check(
      "Before deprovisioning, nothing is confirmed",
      before.state === "pending",
      `state=${before.state}, ${before.totals.verified}/${before.totals.accounts} confirmed`,
    );

    await deprovisionUser("iu_priya", ADMIN);
    const after = await computeRevocationCompletion("iu_priya");

    const states: CompletionState[] = ["pending", "partial", "verified"];
    check(
      "One deprovisioning produces all three outcomes at once",
      states.includes(after.state) &&
        after.state === "partial" &&
        after.totals.verified >= 1 &&
        after.totals.failed === 1,
      `state=${after.state}: ${after.totals.verified} verified, ${after.totals.partial} partial, ` +
        `${after.totals.failed} failed across ${after.totals.accounts} accounts`,
    );

    const warehouse = after.targets.find((t) => t.systemName.includes("Warehouse"));
    check(
      "Roles removed but sessions surviving reads as PARTIAL, not done",
      warehouse?.status === "partial" && (warehouse?.sessionsRemaining ?? 0) > 0,
      `${warehouse?.systemName}: status=${warehouse?.status}, ` +
        `${warehouse?.grantsRevoked} grants revoked but ${warehouse?.sessionsRemaining} session(s) still live`,
    );

    const failedTarget = after.targets.find((t) => t.status === "failed");
    check(
      "A failed revocation changes nothing locally — no false 'revoked'",
      failedTarget?.grantsRevoked === 0 && failedTarget?.sessionsKilled === 0,
      `${failedTarget?.systemName}: ${failedTarget?.failureCode}, 0 grants revoked (nothing was pretended)`,
    );

    check(
      "Full diagnostics are retained for the failure",
      Boolean(
        failedTarget?.failureCode &&
          failedTarget?.failureDetail &&
          failedTarget?.failureRawResponse,
      ),
      `code=${failedTarget?.failureCode}, raw=${failedTarget?.failureRawResponse?.length} bytes`,
    );

    check(
      "The reasons it is not fully revoked are stated individually",
      after.blockedBy.length >= 2,
      after.blockedBy.join(" | "),
    );
  }

  console.log("\n=== Terminating the last session completes the revocation ===");
  {
    const before = await computeRevocationCompletion("iu_priya");
    const warehouseTarget = before.targets.find((t) => t.systemName.includes("Warehouse"))!;

    const live = await db.activeSession.findMany({
      where: { accountId: warehouseTarget.accountId, terminatedAt: null },
    });
    for (const s of live) await terminateSession(s.id, ADMIN);

    const after = await computeRevocationCompletion("iu_priya");
    const warehouseAfter = after.targets.find((t) => t.systemName.includes("Warehouse"));
    check(
      "Partial becomes verified only once the last token is gone",
      warehouseAfter?.status === "verified" && warehouseAfter?.sessionsRemaining === 0,
      `${warehouseAfter?.systemName}: ${warehouseAfter?.status}, ${warehouseAfter?.sessionsRemaining} remaining`,
    );
    check(
      "The person is still not fully revoked while another system has failed",
      after.state === "partial" && after.hasFailures,
      `state=${after.state} — the failed system still blocks completion`,
    );
  }

  console.log("\n=== The CISO is notified without Admin doing anything ===");
  {
    const critical = await db.notification.count({
      where: { targetRole: "ciso", severity: "critical" },
    });
    check(
      "A failed revocation raised a critical notification to the CISO",
      critical > 0,
      `${critical} critical CISO notification(s), none of them triggered by a 'notify' step`,
    );
  }

  console.log("\n=== RBAC drift: narrowing allowed, widening refused ===");
  {
    const engineer = await db.rBACRole.findUniqueOrThrow({ where: { id: "role_engineer" } });
    const drift = analyseRole(engineer);
    check(
      "Drift beyond the approved baseline is detected",
      drift.hasDrift && drift.excess.includes("read:kyc_documents"),
      `${drift.roleName} grants ${drift.excess.join(", ")} which the baseline does not contain`,
    );

    const branch = await db.rBACRole.findUniqueOrThrow({ where: { id: "role_branch" } });
    const branchDrift = analyseRole(branch);
    check(
      "A role NARROWER than its baseline is not flagged as drift",
      !branchDrift.hasDrift && branchDrift.missing.length > 0,
      `${branchDrift.roleName} is missing ${branchDrift.missing.join(", ")} — permitted, not a problem`,
    );

    await expectThrow(
      "Widening a role beyond its baseline is refused",
      () =>
        updateRolePermissions(
          "role_support",
          ["read:customer_profile", "read:support_tickets", "export:bulk_data"],
          ADMIN,
        ),
      "BaselineViolationError",
    );

    const narrowed = await updateRolePermissions("role_support", ["read:customer_profile"], ADMIN);
    check(
      "Narrowing a role is always allowed",
      narrowed.id.length > 0,
      "Support Agent reduced to read:customer_profile",
    );

    await correctDrift("role_engineer", ADMIN);
    const corrected = analyseRole(
      await db.rBACRole.findUniqueOrThrow({ where: { id: "role_engineer" } }),
    );
    check(
      "Correcting drift removes exactly the unapproved permissions",
      !corrected.hasDrift && corrected.current.length === corrected.baseline.length,
      `Data Engineer now grants ${corrected.current.join(", ")}`,
    );
  }

  console.log("\n=== Disposition requires a justification ===");
  {
    await expectThrow(
      "A disposition with no justification is refused",
      () => recordDisposition("acc_anjali_crm", "revoke", "   ", ADMIN),
      "MissingJustificationError",
    );

    await recordDisposition(
      "acc_anjali_crm",
      "revoke",
      "Owner left the organisation 210 days ago; no business need remains.",
      ADMIN,
    );
    const disposition = await db.accountDisposition.findUniqueOrThrow({
      where: { accountId: "acc_anjali_crm" },
    });
    const account = await db.systemAccount.findUniqueOrThrow({
      where: { id: "acc_anjali_crm" },
    });
    check(
      "A disposition of 'revoke' actually revokes, so decision and act cannot drift",
      disposition.disposition === "revoke" && account.status === "revoked",
      `disposition=${disposition.disposition}, account status=${account.status}`,
    );
  }

  console.log("\n=== Everything above was logged automatically ===");
  {
    const actions = await db.auditLogEntry.groupBy({
      by: ["action"],
      _count: true,
      where: { action: { startsWith: "access." } },
    });
    const rbac = await db.auditLogEntry.count({ where: { action: { startsWith: "rbac." } } });
    check(
      "Access and RBAC actions wrote audit entries with no separate logging step",
      actions.length >= 4 && rbac >= 2,
      `${actions.map((a) => `${a.action}×${a._count}`).join(", ")}; rbac entries=${rbac}`,
    );

    const chain = await verifyChain();
    check(
      "The chain still verifies after all Scenario 2 activity",
      chain.ok,
      chain.ok ? `${chain.entriesChecked} entries intact` : (chain.reason ?? ""),
    );
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`${passed} passed, ${failed} failed`);
  console.log("Database is now dirty — run `npm run db:seed` to restore fixtures.");
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
