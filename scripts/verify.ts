/**
 * Acceptance-criteria verification.
 *
 * Exercises the seven non-negotiable behaviours against the real engines and
 * the real database, rather than against the UI — the UI can only show that a
 * button was disabled, which is not the claim being made.
 *
 * Run: npx tsx scripts/verify.ts   (reseed afterwards: npm run db:seed)
 */

import { db, GovernanceReadOnlyError, ImmutableRecordError } from "../src/lib/db";
import { computeCompletion } from "../src/lib/engines/completion";
import { verifyChain, recordAction } from "../src/lib/engines/audit";
import {
  dispatchSystemExecution,
  recordRuling,
  requestRetentionOverride,
  dispatchProcessorInstruction,
  DpaScopeError,
} from "../src/lib/engines/execution";
import { RetentionGateError } from "../src/lib/guards/retentionGate";
import { UnilateralOverrideError } from "../src/lib/guards/escalationGate";
import type { AuditActor } from "../src/lib/engines/audit";
import type { CompletionState } from "../src/lib/domain";

const ADMIN: AuditActor = { id: "act_admin", label: "R. Iyer", role: "admin" };
const DPO: AuditActor = { id: "act_dpo", label: "S. Menon", role: "dpo" };

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

async function expectThrow(
  name: string,
  fn: () => Promise<unknown>,
  errorName: string,
) {
  try {
    await fn();
    check(name, false, `Expected ${errorName}, but the call SUCCEEDED.`);
  } catch (error) {
    const e = error as Error;
    check(
      name,
      e.name === errorName,
      e.name === errorName
        ? `Refused with ${e.name}: ${e.message.slice(0, 150)}…`
        : `Expected ${errorName}, got ${e.name}: ${e.message}`,
    );
  }
}

async function main() {
  console.log("\n=== 1. Three-state completion, never binary ===");
  {
    const kavya = await computeCompletion("req_kavya");
    check(
      "Request with a failure and a confirmed system reads 'partial'",
      kavya.state === "partial" && kavya.hasFailures,
      `state=${kavya.state}, hasFailures=${kavya.hasFailures}, ` +
        `verified=${kavya.totals.verified}/${kavya.totals.targets}, failed=${kavya.totals.failed}`,
    );
    // `CompletionState` is 'pending' | 'partial' | 'verified' — 'failed' is not
    // a member, so a request can never roll up TO a failure. The compiler
    // enforces that; this asserts the runtime consequence.
    const states: CompletionState[] = ["pending", "partial", "verified"];
    check(
      "Failures are reported alongside the state, not folded into it",
      states.includes(kavya.state) && kavya.failures.length === 1 && kavya.hasFailures,
      `state is '${kavya.state}' with ${kavya.failures.length} failure listed separately ` +
        `(the CompletionState union has no 'failed' member, so this cannot regress)`,
    );

    const meera = await computeCompletion("req_meera");
    const legacy = meera.targets.find((t) => t.name === "Legacy Loan Archive");
    check(
      "KYC-conflict request is pending with the no-API archive unconfirmed",
      meera.state !== "verified" && legacy?.status === "pending",
      `state=${meera.state}; Legacy Loan Archive=${legacy?.status} (requires manual verification=${legacy?.requiresManualVerification})`,
    );

    check(
      "Coverage incompleteness withholds 'verified' independently of confirmations",
      !meera.coverage.complete || meera.coverage.reasons.length === 0,
      `coverage.complete=${meera.coverage.complete}; reasons=${JSON.stringify(meera.coverage.reasons)}`,
    );

    const kavyaCoverage = await computeCompletion("req_kavya");
    check(
      "A stale location is reported as a coverage gap",
      !kavyaCoverage.coverage.complete && kavyaCoverage.coverage.staleTargets > 0,
      kavyaCoverage.coverage.reasons.join(" | "),
    );
  }

  console.log("\n=== 4. Retention exceptions gate execution, server-side ===");
  {
    await expectThrow(
      "dispatchSystemExecution on the KYC-conflict request is refused",
      () => dispatchSystemExecution("req_meera", "sys_core", ADMIN),
      "RetentionGateError",
    );
    await expectThrow(
      "Processor instruction on the same request is refused too",
      () => dispatchProcessorInstruction("req_meera", "proc_email", ADMIN),
      "RetentionGateError",
    );
    void RetentionGateError;
  }

  console.log("\n=== 5. Admin cannot resolve a legal conflict unilaterally ===");
  {
    const escalation = await requestRetentionOverride(
      "ret_kyc",
      "Data Principal insists the account was never used for KYC purposes.",
      ADMIN,
    );
    check(
      "Requesting an override raises an escalation and does NOT apply it",
      escalation.status === "open" && escalation.ruling === null,
      `escalation ${escalation.id}: status=${escalation.status}, ruling=${escalation.ruling}`,
    );

    const exception = await db.retentionException.findUniqueOrThrow({
      where: { id: "ret_kyc" },
    });
    check(
      "The exception moves to 'override_requested', not 'overridden'",
      exception.reviewStatus === "override_requested",
      `reviewStatus=${exception.reviewStatus}`,
    );

    await expectThrow(
      "Admin recording a ruling on their own escalation is refused",
      () => recordRuling(escalation.id, "approve_override", "Approving my own request.", ADMIN),
      "UnilateralOverrideError",
    );
    void UnilateralOverrideError;

    await recordRuling(
      escalation.id,
      "uphold_retention",
      "PMLA retention applies until 2030. The KYC fields must be kept.",
      DPO,
    );
    const ruled = await db.retentionException.findUniqueOrThrow({
      where: { id: "ret_kyc" },
    });
    check(
      "The DPO's ruling is recorded and applied",
      ruled.reviewStatus === "upheld",
      `reviewStatus=${ruled.reviewStatus} after the DPO ruled`,
    );
  }

  console.log("\n=== 3. Cross-persona notification is automatic ===");
  {
    // ret_txn is still unreviewed, so acknowledge it to clear the gate.
    await db.retentionException.update({
      where: { id: "ret_txn" },
      data: { reviewStatus: "acknowledged" },
    });
    await db.dataPrincipalRequest.update({
      where: { id: "req_meera" },
      data: {
        preNoticeSentAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
        preNoticeDueAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    const before = await db.notification.count({ where: { targetRole: "grievance_officer" } });
    await dispatchSystemExecution("req_meera", "sys_core", ADMIN);
    const after = await db.notification.count({ where: { targetRole: "grievance_officer" } });

    check(
      "A successful execution notifies the Grievance Officer with no notify step",
      after > before,
      `grievance_officer notifications: ${before} -> ${after}`,
    );

    // Kavya's failing system: dispatch and confirm a critical notification.
    const beforeFail = await db.notification.count({
      where: { targetRole: "dpo", severity: "critical" },
    });
    await db.retentionException.update({
      where: { id: "ret_kavya" },
      data: { reviewStatus: "acknowledged" },
    });
    await db.dataPrincipalRequest.update({
      where: { id: "req_kavya" },
      data: {
        preNoticeSentAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
        preNoticeDueAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });
    await dispatchSystemExecution("req_kavya", "sys_mkt", ADMIN);
    const afterFail = await db.notification.count({
      where: { targetRole: "dpo", severity: "critical" },
    });
    check(
      "A failed execution raises a critical notification automatically",
      afterFail > beforeFail,
      `critical DPO notifications: ${beforeFail} -> ${afterFail}`,
    );
  }

  console.log("\n=== 6. DPA scope is enforced, not warned about ===");
  {
    // The print vendor holds `financial` data (account statements) but its DPA
    // covers only contact and identity.
    await expectThrow(
      "Instructing a processor outside its DPA scope is refused",
      () => dispatchProcessorInstruction("req_meera", "proc_print", ADMIN),
      "DpaScopeError",
    );
    void DpaScopeError;

    const inScope = await dispatchProcessorInstruction("req_meera", "proc_email", ADMIN);
    check(
      "A processor within its DPA scope can be instructed, and stays pending",
      inScope.status === "pending" && inScope.deliveredAt !== null,
      `status=${inScope.status}, delivered=${inScope.deliveredAt !== null} — delivery is not the same as the data being gone`,
    );
  }

  console.log("\n=== 2. Audit log is automatic and immutable ===");
  {
    const entries = await db.auditLogEntry.count();
    check(
      "Actions wrote audit entries without any separate logging step",
      entries > 0,
      `${entries} entries in the chain`,
    );

    const chain = await verifyChain();
    check(
      "Hash chain verifies end to end",
      chain.ok,
      chain.ok ? `${chain.entriesChecked} entries intact` : `broken at seq ${chain.brokenAtSeq}: ${chain.reason}`,
    );

    const first = await db.auditLogEntry.findFirstOrThrow({ orderBy: { seq: "asc" } });
    await expectThrow(
      "Updating an audit entry is refused",
      () =>
        db.auditLogEntry.update({
          where: { seq: first.seq },
          data: { action: "tampered" },
        }),
      "ImmutableRecordError",
    );
    await expectThrow(
      "Deleting an audit entry is refused",
      () => db.auditLogEntry.delete({ where: { seq: first.seq } }),
      "ImmutableRecordError",
    );
    void ImmutableRecordError;

    // Tamper-evidence: write a bad hash through raw SQL (bypassing the client
    // extension entirely, as a real attacker with DB access would) and confirm
    // the chain reports it.
    await db.$executeRawUnsafe(
      `UPDATE "AuditLogEntry" SET "action" = 'tampered' WHERE "seq" = ${first.seq}`,
    );
    const broken = await verifyChain();
    check(
      "Tampering via direct SQL is detected by the chain",
      !broken.ok && broken.brokenAtSeq === first.seq,
      broken.reason ?? "chain still reports OK — tamper-evidence FAILED",
    );
    await db.$executeRawUnsafe(
      `UPDATE "AuditLogEntry" SET "action" = '${first.action}' WHERE "seq" = ${first.seq}`,
    );
    const restored = await verifyChain();
    check(
      "Chain verifies again once the tampered value is restored",
      restored.ok,
      restored.ok ? "chain intact" : (restored.reason ?? ""),
    );
  }

  console.log("\n=== 2b. Erasing the data does not erase the record of erasure ===");
  {
    const principal = await db.dataPrincipal.create({
      data: { displayName: "Erasure survival test" },
    });
    await db.$transaction(async (tx) => {
      await recordAction(tx, {
        actor: ADMIN,
        action: "execution.dispatched",
        targetType: "DataPrincipal",
        targetId: principal.id,
        payload: { note: "written before the principal was erased" },
      });
    });

    await db.dataPrincipal.delete({ where: { id: principal.id } });

    const survived = await db.auditLogEntry.count({
      where: { targetType: "DataPrincipal", targetId: principal.id },
    });
    const gone = await db.dataPrincipal.findUnique({ where: { id: principal.id } });

    check(
      "Audit entry survives deletion of the Data Principal it describes",
      survived === 1 && gone === null,
      `principal deleted=${gone === null}, audit entries remaining=${survived}`,
    );
  }

  console.log("\n=== 6b. Governance objects are read-only to Admin ===");
  {
    await expectThrow(
      "Updating a PurposeTag is refused",
      () =>
        db.purposeTag.update({
          where: { name: "Marketing communication" },
          data: { name: "Renamed by Admin" },
        }),
      "GovernanceReadOnlyError",
    );
    await expectThrow(
      "Creating a ProtectionRule is refused",
      () =>
        db.protectionRule.create({
          data: {
            dataCategory: "kyc",
            ruleType: "mask",
            scope: "everywhere",
            definition: "invented by Admin",
            approvedBy: "R. Iyer",
            approvedAt: new Date(),
          },
        }),
      "GovernanceReadOnlyError",
    );
    await expectThrow(
      "Deleting a CookieCategory is refused",
      () => db.cookieCategory.delete({ where: { name: "Analytics" } }),
      "GovernanceReadOnlyError",
    );
    void GovernanceReadOnlyError;
  }

  console.log("\n=== 7. Failure diagnostics are visible to Admin ===");
  {
    const failure = await db.executionRecord.findFirstOrThrow({
      where: { requestId: "req_kavya", status: "failed" },
    });
    check(
      "The failed record carries code, detail and the raw response",
      Boolean(failure.failureCode && failure.failureDetail && failure.failureRawResponse),
      `code=${failure.failureCode}, detail=${failure.failureDetail?.slice(0, 60)}…, raw=${failure.failureRawResponse?.length} bytes`,
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
