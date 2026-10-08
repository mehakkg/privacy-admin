/**
 * Unit tests for the Processing Activities pure logic. No test-runner dependency:
 * run with `npx tsx src/lib/activities/logic.test.ts` (added as the "test" script).
 * Relative imports so tsx resolves them without tsconfig path aliases.
 */
import {
  basicsGaps, completeness, completenessLabel, nextStep, summary, listSentence,
  purposeRailText, basicsRailText, isNeedsWork, reviewBlockers, reviewRailText, blockingChecklist,
  firstIncompleteIndex, checklistPurposeIds,
} from "./logic";
import { purposeState, type Activity, type Purpose, type PurposeVersion, type Ctx, type ActivityPurpose, type LegalBasis, type ConsentStatus, type PurposeVersionState } from "./types";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) { if (cond) pass++; else { fail++; console.error("FAIL: " + name); } }
function eq<T>(name: string, got: T, want: T) { check(`${name} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want)); }

// --- fixtures ---------------------------------------------------------------
const V = (number: number, state: PurposeVersionState, legalBasis: LegalBasis, consent: ConsentStatus, extra: Partial<PurposeVersion> = {}): PurposeVersion => ({
  number, state, name: "P", description: "d", legalBasis, legitimateUseType: legalBasis === "legitimate_use" ? "Legal obligation" : null,
  retention: { amount: 7, unit: "years", trigger: "after account closure" }, justification: "j",
  submittedBy: null, submittedAt: null, decidedBy: null, decidedAt: null, decisionComment: null, selfApproved: false, consent, ...extra,
});
const P = (id: string, versions: PurposeVersion[], retiredAt: string | null = null): Purpose => ({ id, versions, retiredAt });

const purposes: Record<string, Purpose> = {
  accountServicing: P("accountServicing", [V(1, "approved", "legitimate_use", "not_required"), V(2, "approved", "legitimate_use", "not_required"), V(3, "approved", "legitimate_use", "not_required")]),
  loanApp: P("loanApp", [V(1, "approved", "legitimate_use", "not_required"), V(2, "approved", "legitimate_use", "not_required")]),
  marketing: P("marketing", [V(1, "approved", "consent", "linked")]),
  customerSupport: P("customerSupport", [V(1, "approved", "legitimate_use", "not_required")]),
  fraud: P("fraud", [V(1, "waiting_for_dpo", "legitimate_use", "not_required")]),
  creditScoring: P("creditScoring", [V(1, "changes_requested", "legitimate_use", "not_required")]),
  feedback: P("feedback", [V(1, "draft", "consent", "not_linked")]),
  payroll: P("payroll", [V(1, "approved", "legitimate_use", "not_required")]),
};
const ctx: Ctx = { purposes, multiEntity: false };

const link = (purposeId: string, o: Partial<ActivityPurpose> = {}): ActivityPurpose => ({
  purposeId, state: "confirmed", dataLinks: [], processorMode: "uses_processors", noProcessorBy: null, noProcessorAt: null, processorLinks: [], ...o,
});
const data = (n: number) => Array.from({ length: n }, (_, i) => ({ fieldId: `f${i}`, state: "confirmed" as const }));
const procs = (...ids: string[]) => ids.map((vendorId) => ({ vendorId, state: "confirmed" as const }));
const act = (o: Partial<Activity>): Activity => ({
  id: "a", name: "A", ownerId: "u1", department: "Credit", entityId: null, principals: ["customers"], lifecycle: "draft",
  purposeLinks: [], reasons: [], lastReviewedAt: null, nextReviewDue: null, ...o,
});

const a1 = act({ id: "1", name: "Retail Loan Origination", lifecycle: "active", purposeLinks: [link("loanApp", { dataLinks: data(7), processorLinks: procs("acme", "snow") }), link("accountServicing", { dataLinks: data(2), processorLinks: procs("snow") })] });
const a2 = act({ id: "2", name: "Marketing Campaigns", lifecycle: "under_review", principals: ["customers"], purposeLinks: [link("marketing", { dataLinks: data(2), processorLinks: procs("northwind") })], reasons: [{ id: "r1", type: "new_field_in_linked_table", detail: "x", status: "open" }, { id: "r2", type: "review_due", detail: "y", status: "open" }] });
const a3 = act({ id: "3", name: "Customer Onboarding", purposeLinks: [link("accountServicing", { dataLinks: data(3), processorLinks: procs("snow") }), link("customerSupport", { dataLinks: [], processorMode: "unanswered" })] });
const a4 = act({ id: "4", name: "Customer Support", lifecycle: "active", purposeLinks: [link("customerSupport", { dataLinks: data(4), processorLinks: procs("sfdc", "helpdesk") })] });
const a5 = act({ id: "5", name: "Fraud Monitoring", purposeLinks: [link("fraud", { dataLinks: data(1) })] });
const a6 = act({ id: "6", name: "Credit Scoring", purposeLinks: [link("creditScoring", { dataLinks: data(1) })] });
const a7 = act({ id: "7", name: "Payroll", ownerId: null, department: "HR", principals: [], purposeLinks: [] });
const a8 = act({ id: "8", name: "Debt Collections", purposeLinks: [link("loanApp", { dataLinks: data(2), processorMode: "unanswered" })] });
const all = [a1, a2, a3, a4, a5, a6, a7, a8];

// --- completeness -----------------------------------------------------------
eq("a1 complete", completeness(a1, ctx).kind, "complete");
eq("a2 needs_review", completeness(a2, ctx).kind, "needs_review");
eq("a3 needs_data", completeness(a3, ctx).kind, "needs_data");
eq("a4 complete", completeness(a4, ctx).kind, "complete");
eq("a5 needs_approval", completeness(a5, ctx).kind, "needs_approval");
eq("a5 waiting_only", completeness(a5, ctx).subKind, "waiting_only");
eq("a6 needs_approval", completeness(a6, ctx).kind, "needs_approval");
check("a6 not waiting_only", completeness(a6, ctx).subKind === undefined);
eq("a7 needs_basics", completeness(a7, ctx).kind, "needs_basics");
eq("a8 needs_processors", completeness(a8, ctx).kind, "needs_processors");

// --- acceptance 1: segment counts ------------------------------------------
eq("needs-work count", all.filter((a) => isNeedsWork(completeness(a, ctx))).length, 5);
eq("under-review count", all.filter((a) => a.lifecycle === "under_review").length, 1);
eq("all count", all.length, 8);
eq("ready count", all.filter((a) => completeness(a, ctx).kind === "complete").length, 2);

// --- acceptance 2/3/4: next steps ------------------------------------------
eq("a5 next actionable", nextStep(a5, ctx).actionable, false);
eq("a5 next text", nextStep(a5, ctx).text, "Waiting for your DPO");
eq("a6 next verb", nextStep(a6, ctx).verb, "Resubmit 1 purpose");
eq("a7 next verb", nextStep(a7, ctx).verb, "Add an owner");
eq("a3 next verb", nextStep(a3, ctx).verb, "Add data to 1 purpose");
eq("a8 next verb", nextStep(a8, ctx).verb, "Choose processors for 1 purpose");

// --- labels -----------------------------------------------------------------
eq("a5 label", completenessLabel(completeness(a5, ctx)), "Waiting for your DPO");
eq("a6 label", completenessLabel(completeness(a6, ctx)), "Needs a purpose approval");
eq("a1 label", completenessLabel(completeness(a1, ctx)), "Ready for ROPA");

// --- summary + list sentence ------------------------------------------------
eq("a1 summary", summary(a1), "2 purposes · 9 fields · 2 processors");
eq("list sentence", listSentence(all, ctx).sentence, "8 activities. 2 are ready for ROPA.");
check("gaps line mentions need work", /need work/.test(listSentence(all, ctx).gapsLine));

// --- basics gaps + rail -----------------------------------------------------
eq("a7 basics gaps", basicsGaps(a7, false), ["owner", "principals"]);
eq("a7 basics rail", basicsRailText(a7, false), "Needs owner");
eq("a3 customerSupport rail", purposeRailText(a3, a3.purposeLinks[1], ctx), "Needs data");
eq("a8 loanApp rail", purposeRailText(a8, a8.purposeLinks[0], ctx), "Needs processors");
eq("a5 fraud rail", purposeRailText(a5, a5.purposeLinks[0], ctx), "Waiting for DPO");

// --- purpose versioning -----------------------------------------------------
const withWaiting = P("x", [V(3, "approved", "legitimate_use", "not_required"), V(4, "waiting_for_dpo", "legitimate_use", "not_required")]);
eq("newer waiting displayState", purposeState(withWaiting).displayState, "approved_newer_waiting");
eq("newer waiting approvedForUse", purposeState(withWaiting).approvedForUse, true);
eq("newer waiting number", purposeState(withWaiting).waitingVersionNumber, 4);

// --- review blockers --------------------------------------------------------
eq("a1 blockers 0", reviewBlockers(a1, ctx), 0);
eq("a7 blockers (owner+principals+no purpose)", reviewBlockers(a7, ctx), 3);
eq("a3 blockers (customerSupport no data + unanswered)", reviewBlockers(a3, ctx), 2);
eq("a1 review rail", reviewRailText(reviewBlockers(a1, ctx)), "Ready");
eq("a7 review rail", reviewRailText(reviewBlockers(a7, ctx)), "Fix 3 items");

// --- checklist --------------------------------------------------------------
const pname = () => "P";
eq("a7 checklist == blockers", blockingChecklist(a7, ctx, pname).length, reviewBlockers(a7, ctx));
eq("a3 checklist == blockers", blockingChecklist(a3, ctx, pname).length, reviewBlockers(a3, ctx));
eq("a1 checklist empty", blockingChecklist(a1, ctx, pname).length, 0);
eq("a7 checklist ids", blockingChecklist(a7, ctx, pname).map((i) => i.id), ["B1", "B3", "B4"]);
eq("a3 checklist ids", blockingChecklist(a3, ctx, pname).map((i) => i.id).sort(), ["B7", "B8"]);

// --- M0 D2: rail count and pane count are the SAME source -------------------
// Three blockers: no owner (B1) + one confirmed approved purpose with no data (B7)
// + unanswered processors (B8). principals present, single-entity, so no B3.
const d2 = act({ ownerId: null, principals: ["employees"], purposeLinks: [link("payroll", { dataLinks: [], processorMode: "unanswered" })] });
eq("D2 reviewBlockers = 3", reviewBlockers(d2, ctx), 3);
eq("D2 checklist length = 3", blockingChecklist(d2, ctx, pname).length, 3);
eq("D2 rail text = Fix 3 items", reviewRailText(reviewBlockers(d2, ctx)), "Fix 3 items");
eq("D2 rail count == pane count", reviewBlockers(d2, ctx), blockingChecklist(d2, ctx, pname).length);

// D2 regression: a complete purpose plus a suggested data link. B5 ("suggested
// items need a decision") must be counted by BOTH the rail and the pane — the old
// reviewBlockers missed it, giving the "Fix 3 / Fix 2" split.
const d2b = act({ purposeLinks: [link("payroll", { dataLinks: [{ fieldId: "f1", state: "confirmed" }, { fieldId: "f2", state: "suggested" }], processorMode: "none" })] });
eq("D2 suggested -> B5 counted by rail", reviewBlockers(d2b, ctx), 1);
eq("D2 suggested -> B5 in checklist", blockingChecklist(d2b, ctx, pname).map((i) => i.id), ["B5"]);
eq("D2 rail == pane with suggestions", reviewBlockers(d2b, ctx), blockingChecklist(d2b, ctx, pname).length);

// --- M0 D1: every purpose the checklist names has a rail item ---------------
// Rail = activity.purposeLinks. A confirmed-but-unapproved purpose (B6) and a
// suggested purpose (B5) must both be reachable in the rail.
const d1 = act({ purposeLinks: [link("creditScoring", { dataLinks: data(1), processorLinks: procs("snow") }), link("feedback", { state: "suggested" })] });
for (const a of all.concat([d1, d2, d2b])) {
  const named = checklistPurposeIds(blockingChecklist(a, ctx, pname));
  const railIds = a.purposeLinks.map((p) => p.purposeId);
  check(`D1 ${a.name}: every checklist purpose is in the rail`, named.every((id) => railIds.includes(id)));
}

// --- M0 D6: the "Next" marker is the first incomplete rail item -------------
eq("D6 first incomplete", firstIncompleteIndex(["Complete", "Needs data", "Fix 2 items"]), 1);
eq("D6 none incomplete", firstIncompleteIndex(["Complete", "Ready"]), -1);
eq("D6 suggested counts as incomplete", firstIncompleteIndex(["Suggested", "Complete"]), 0);

console.log(`\nProcessing Activities logic: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
