/**
 * Onboarding flow acceptance verification.
 *
 * Exercises the engine and guards directly. A disabled button proves nothing
 * about what the server would accept, and the whole point of the mandatory gate
 * is that it holds even if a screen forgets it.
 *
 * Run: npx tsx scripts/verify-onboarding.ts   (then: npm run db:seed)
 */

import { db } from "../src/lib/db";
import {
  completeOnboarding,
  confirmGate,
  findUnroutedCustomEvents,
  getOnboarding,
  markStepDone,
  resumeStep,
  skipStep,
  stepStatus,
} from "../src/lib/engines/onboarding";
import {
  assertDispatchable,
  assertWithinDpaScope,
  getProcessorPosture,
  inspectDpaReference,
} from "../src/lib/guards/processorGate";
import {
  fetchGovernanceConfig,
  GovernancePortalUnreachableError,
  parseSim,
} from "../src/lib/governance/portal";
import { verifyChain, type AuditActor } from "../src/lib/engines/audit";
import { ROUTABLE_EVENTS } from "../src/lib/domain";

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
        ? `Refused with ${e.name}: ${e.message.slice(0, 130)}…`
        : `Expected ${errorName}, got ${e.name}: ${e.message}`,
    );
  }
}

async function main() {
  // Start from a clean wizard.
  await db.onboardingState.deleteMany({});

  console.log("\n=== The mandatory gate is mandatory ===");
  {
    await expectThrow(
      "Step 1 cannot be skipped, even bypassing the UI",
      () => skipStep(1, ADMIN),
      "StepNotSkippableError",
    );

    await expectThrow(
      "Confirming with no escalation contact is refused",
      () =>
        confirmGate(
          {
            escalationContactActorId: null,
            backupContactActorId: null,
            backupHasChannel: true,
            backupName: null,
            scopedEntityId: null,
            noDpoAssigned: false,
            noRetentionCategories: false,
            governanceUnavailable: false,
            categoryCount: 4,
          },
          ADMIN,
        ),
      "MissingEscalationContactError",
    );

    await expectThrow(
      "A backup contact with no notification channel is refused",
      () =>
        confirmGate(
          {
            escalationContactActorId: "act_dpo",
            backupContactActorId: "act_go",
            backupHasChannel: false,
            backupName: "P. Deshmukh",
            scopedEntityId: null,
            noDpoAssigned: false,
            noRetentionCategories: false,
            governanceUnavailable: false,
            categoryCount: 4,
          },
          ADMIN,
        ),
      "UnreachableBackupContactError",
    );

    const before = await getOnboarding();
    check(
      "Nothing was recorded by the refused attempts",
      !before.gateCleared && before.escalationContactActorId === null,
      `gateCleared=${before.gateCleared}, contact=${before.escalationContactActorId}`,
    );
  }

  console.log("\n=== Governance portal: unreachable is not the same as empty ===");
  {
    await expectThrow(
      "An unreachable portal throws rather than returning empty data",
      () => fetchGovernanceConfig(parseSim("gov_down")),
      "GovernancePortalUnreachableError",
    );

    const empty = await fetchGovernanceConfig(parseSim("no_categories"));
    check(
      "An empty category list is reported as empty, not as an error",
      empty.retentionCategories.length === 0 && empty.contacts.length > 0,
      `${empty.retentionCategories.length} categories, ${empty.contacts.length} contacts — a real, readable "nothing configured"`,
    );

    const noDpo = await fetchGovernanceConfig(parseSim("no_dpo"));
    check(
      "No DPO assigned is a distinct, detectable state",
      !noDpo.contacts.some((c) => c.role === "dpo"),
      `roster has ${noDpo.contacts.length} contacts, none of them a DPO`,
    );

    const multi = await fetchGovernanceConfig(parseSim("multi_entity"));
    check(
      "Multi-entity orgs surface more than one DPO for entity-scoped routing",
      multi.contacts.filter((c) => c.role === "dpo").length > 1,
      `${multi.contacts.filter((c) => c.role === "dpo").length} DPOs, entities: ${multi.contacts
        .filter((c) => c.role === "dpo")
        .map((c) => c.entity ?? "primary")
        .join(", ")}`,
    );

    const real = await fetchGovernanceConfig();
    check(
      "The DPO's statutory categories are readable and carry citations",
      real.retentionCategories.length >= 4 &&
        real.retentionCategories.every((c) => c.statuteRef.length > 0),
      real.retentionCategories.map((c) => `${c.name} (${c.retentionPeriod})`).join("; "),
    );
  }

  console.log("\n=== Proceeding without governance data is a logged risk acknowledgment ===");
  {
    await confirmGate(
      {
        escalationContactActorId: "act_dpo",
        backupContactActorId: null,
        backupHasChannel: true,
        backupName: null,
        scopedEntityId: null,
        noDpoAssigned: false,
        noRetentionCategories: true,
        governanceUnavailable: true,
        categoryCount: 0,
      },
      ADMIN,
    );

    const state = await getOnboarding();
    check(
      "The gate clears and the risk flag is persisted",
      state.gateCleared && state.governanceUnavailableAcknowledged,
      `gateCleared=${state.gateCleared}, governanceUnavailableAcknowledged=${state.governanceUnavailableAcknowledged}`,
    );

    const entry = await db.auditLogEntry.findFirst({
      where: { action: "onboarding.escalation_contact_confirmed" },
      orderBy: { seq: "desc" },
    });
    check(
      "The confirmation is in the audit trail with the risk recorded",
      Boolean(entry) && entry!.payloadJson.includes("proceededWithoutGovernanceData"),
      `seq=${entry?.seq}, payload includes the flags: ${entry?.payloadJson.slice(0, 120)}…`,
    );
  }

  console.log("\n=== Skips are recorded with their consequence, and resume works ===");
  {
    await skipStep(2, ADMIN);
    await skipStep(3, ADMIN);

    const state = await getOnboarding();
    check(
      "Skipped steps carry the reason they matter, not just the fact",
      state.skippedSteps.length === 2 &&
        state.skippedSteps.every((s) => s.consequence.length > 20),
      state.skippedSteps.map((s) => `${s.label}: ${s.consequence.slice(0, 60)}…`).join(" | "),
    );

    check(
      "Step 1 can never appear in the skipped column",
      !state.skippedSteps.some((s) => s.n === 1),
      `skipped step numbers: [${state.skippedSteps.map((s) => s.n).join(", ")}] — 1 is structurally absent`,
    );

    check(
      "Resume lands on the first genuinely outstanding step",
      resumeStep(state) === 4,
      `resumeStep=${resumeStep(state)} (1 done, 2 and 3 skipped, so 4 is next)`,
    );

    const skipEntry = await db.auditLogEntry.findFirst({
      where: { action: "onboarding.sources_skipped" },
    });
    check(
      "A skip is itself an audited decision",
      Boolean(skipEntry),
      `seq=${skipEntry?.seq}, action=${skipEntry?.action}`,
    );
  }

  console.log("\n=== Screen 4 is a real confirmation event, even with nothing to review ===");
  {
    const fieldCount = await db.classifiedField.count();
    await markStepDone(4, ADMIN, { fieldsReviewed: fieldCount });

    const entry = await db.auditLogEntry.findFirst({
      where: { action: "onboarding.classification_confirmed" },
    });
    check(
      "Confirming classification writes an attributable entry",
      Boolean(entry) && entry!.actorLabel === "R. Iyer",
      `seq=${entry?.seq} by ${entry?.actorLabel} — a named person at a known time, not an auto-advance`,
    );
  }

  console.log("\n=== A draft DPA is a hard block, not a warning (s.8(2)) ===");
  {
    await db.dataProcessor.update({
      where: { id: "proc_print" },
      data: { dpaStatus: "draft" },
    });

    const posture = await getProcessorPosture("proc_print");
    check(
      "A draft-DPA processor reports itself as not dispatchable",
      !posture.dispatchable && posture.blockReason !== null,
      `${posture.name}: dispatchable=${posture.dispatchable} — ${posture.blockReason}`,
    );

    await expectThrow(
      "Dispatching to a draft-DPA processor is refused outright",
      () => assertDispatchable("proc_print"),
      "DraftDpaError",
    );

    const active = await getProcessorPosture("proc_email");
    check(
      "A processor with an executed DPA is dispatchable",
      active.dispatchable,
      `${active.name}: dispatchable=${active.dispatchable}, DPA covers ${active.dpaScope.join(", ")}`,
    );

    let scopeRefused = false;
    try {
      // The email vendor's DPA covers marketing and contact, not KYC.
      assertWithinDpaScope(active.name, ["kyc"], active.dpaScope);
    } catch (e) {
      scopeRefused = (e as Error).name === "OutsideDpaScopeError";
    }
    check(
      "A valid DPA is still not authority beyond its scope",
      scopeRefused,
      `instructing ${active.name} about kyc was refused — its DPA covers ${active.dpaScope.join(", ")}`,
    );
  }

  console.log("\n=== DPA reference format: flagged, never blocked ===");
  {
    const good = inspectDpaReference("DPA-2026-001");
    const odd = inspectDpaReference("legal/2026/vendor-14");
    const blank = inspectDpaReference("  ");
    check(
      "A conventional reference passes silently",
      good.looksConventional && good.note === null,
      "DPA-2026-001 — no note",
    );
    check(
      "An unconventional reference is noted, not rejected",
      !odd.looksConventional && (odd.note ?? "").includes("not a"),
      `"legal/2026/vendor-14" → ${odd.note?.slice(0, 90)}…`,
    );
    check(
      "A blank reference is the one case that is genuinely invalid",
      !blank.looksConventional && blank.note === "A DPA reference is required.",
      blank.note ?? "",
    );
  }

  console.log("\n=== A custom event cannot be left silently unrouted ===");
  {
    const known = ROUTABLE_EVENTS.map((e) => e.eventType);
    const unrouted = findUnroutedCustomEvents(
      [
        { eventType: "deletion.completed", recipientRole: "" },
        { eventType: "processor.confirmation_overdue", recipientRole: "" },
        { eventType: "custom.thing", recipientRole: "dpo" },
      ],
      known,
    );
    check(
      "Only the unassigned CUSTOM event is flagged",
      unrouted.length === 1 && unrouted[0] === "processor.confirmation_overdue",
      `flagged: [${unrouted.join(", ")}] — a known event falls back to its default, a custom one cannot`,
    );
  }

  console.log("\n=== Completion is honest about an incomplete setup ===");
  {
    await markStepDone(5, ADMIN);
    await skipStep(6, ADMIN);
    await completeOnboarding(ADMIN);

    const state = await getOnboarding();
    const entry = await db.auditLogEntry.findFirst({
      where: { action: "onboarding.completed" },
      orderBy: { seq: "desc" },
    });

    check(
      "Completion is recorded with what was done and what was left",
      Boolean(state.completedAt) &&
        Boolean(entry) &&
        entry!.payloadJson.includes("skipped"),
      `completedAt=${state.completedAt?.toISOString()}, payload=${entry?.payloadJson.slice(0, 140)}…`,
    );

    check(
      "Steps 2, 3 and 6 remain visible as skipped after completion",
      state.skippedSteps.length === 3,
      `still listed: ${state.skippedSteps.map((s) => s.label).join(", ")} — deferral does not disappear on finish`,
    );

    check(
      "stepStatus reports each step distinctly",
      stepStatus(state, 1) === "done" &&
        stepStatus(state, 2) === "skipped" &&
        stepStatus(state, 7) === "pending",
      `1=${stepStatus(state, 1)}, 2=${stepStatus(state, 2)}, 4=${stepStatus(state, 4)}, 6=${stepStatus(state, 6)}`,
    );
  }

  console.log("\n=== The audit chain survived all of it ===");
  {
    const onboardingEntries = await db.auditLogEntry.count({
      where: { action: { startsWith: "onboarding." } },
    });
    check(
      "Onboarding wrote audit entries without any manual logging step",
      onboardingEntries >= 7,
      `${onboardingEntries} onboarding entries`,
    );

    const chain = await verifyChain();
    check(
      "Hash chain still verifies",
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
