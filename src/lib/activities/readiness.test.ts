/**
 * Unit tests for the nine-state activity readiness (Data Map redesign). The ten
 * Meridian fixture activities are the oracle — each asserted against the spec's
 * Readiness column. Run via the npm test harness (tsx).
 */
import { readiness, bucketOf, type ReadinessActivity, type ReadinessPurpose, type ReadinessState, type ReadinessBucket } from "./readiness";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) { if (cond) pass++; else { fail++; console.error("FAIL: " + name); } }
function eq<T>(name: string, got: T, want: T) { check(`${name} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want)); }

const TODAY = new Date("2026-10-23T00:00:00Z");

// Purpose builder with sensible defaults (approved, consent, in a notice, has data+systems).
const P = (o: Partial<ReadinessPurpose> = {}): ReadinessPurpose => ({
  name: "P", fieldCount: 3, systemCount: 1, approval: "approved", legalBasis: "consent", inPublishedNotice: true, ...o,
});
const A = (o: Partial<ReadinessActivity>): ReadinessActivity => ({
  ownerId: "u1", department: "D", principals: ["Customer"], purposes: [P()],
  submitted: false, approved: false, lastReviewedAt: null, driftSinceApproval: false, ...o,
});

// --- the ten fixtures -------------------------------------------------------
const fixtures: { name: string; a: ReadinessActivity; state: ReadinessState; next?: string | null }[] = [
  { name: "Customer onboarding & KYC", state: "approved", next: null,
    a: A({ approved: true, submitted: true, lastReviewedAt: "2026-08-14", purposes: [P({ name: "KYC & identity verification", fieldCount: 9, systemCount: 2 })] }) },
  { name: "Credit scoring", state: "approved", next: null,
    a: A({ principals: ["Loan applicant"], approved: true, submitted: true, lastReviewedAt: "2026-09-02", purposes: [P({ name: "Credit assessment", fieldCount: 6, systemCount: 2 })] }) },
  { name: "Loan servicing", state: "review_due", next: "Review this activity",
    a: A({ approved: true, submitted: true, lastReviewedAt: "2026-06-11", purposes: [P({ name: "Credit assessment", fieldCount: 5, systemCount: 2 })] }) },
  { name: "Fraud monitoring", state: "needs_approval", next: "Waiting on 'Fraud detection'",
    a: A({ purposes: [P({ name: "Fraud detection", fieldCount: 4, systemCount: 1, approval: "pending" })] }) },
  { name: "Debt collections", state: "needs_processors", next: "Choose systems for 1 purpose",
    a: A({ purposes: [P({ name: "Recovery & collections", fieldCount: 2, systemCount: 0 })] }) },
  { name: "Marketing campaigns", state: "needs_approval", next: "Submit 'Product marketing'",
    a: A({ principals: ["Customer", "Prospect"], purposes: [P({ name: "Product marketing", fieldCount: 3, systemCount: 1, approval: "draft", inPublishedNotice: false })] }) },
  { name: "Customer support calls", state: "needs_notice", next: "Add 'Customer support & complaints' to a notice",
    a: A({ purposes: [P({ name: "Customer support & complaints", fieldCount: 3, systemCount: 1, inPublishedNotice: false })] }) },
  { name: "Payroll", state: "needs_basics", next: "Add an owner",
    a: A({ ownerId: null, department: "HR", principals: ["Employee"], purposes: [P({ name: "Payroll & statutory deductions", fieldCount: 0, systemCount: 0, legalBasis: "legitimate_use" })] }) },
  { name: "Wealth advisory onboarding", state: "needs_data", next: "Add data to 1 purpose",
    a: A({ department: "Wealth", principals: ["CUSTOMER"], purposes: [P({ name: "Investment advisory onboarding", fieldCount: 0, systemCount: 0 })] }) },
  { name: "Pre-employment background verification", state: "waiting_for_dpo", next: null,
    a: A({ department: "HR", principals: ["Employee"], submitted: true, purposes: [P({ name: "Pre-employment background checks", fieldCount: 5, systemCount: 1, legalBasis: "legitimate_use" })] }) },
];

for (const f of fixtures) {
  const r = readiness(f.a, TODAY);
  eq(`${f.name}: state`, r.state, f.state);
  if (f.next !== undefined) eq(`${f.name}: next`, r.next?.text ?? null, f.next);
}

// --- summary-line buckets (must match "6 need work, 1 waiting, 1 review due, 2 approved") ---
const counts: Record<ReadinessBucket, number> = { needs_work: 0, waiting_for_dpo: 0, review_due: 0, approved: 0 };
for (const f of fixtures) counts[bucketOf(readiness(f.a, TODAY).state)]++;
eq("bucket needs_work", counts.needs_work, 6);
eq("bucket waiting", counts.waiting_for_dpo, 1);
eq("bucket review_due", counts.review_due, 1);
eq("bucket approved", counts.approved, 2);
eq("total", fixtures.length, 10);

// --- acceptance: legitimate use never triggers needs_notice ----------------
// A legit-use purpose not in any notice must NOT become needs_notice; with all
// other gaps clear and not yet submitted it reaches ready_to_submit.
eq("legit-use skips notice", readiness(A({ purposes: [P({ legalBasis: "legitimate_use", inPublishedNotice: false })] }), TODAY).state, "ready_to_submit");

// --- next-step link vs text ------------------------------------------------
eq("pending approval is text (not a link)", readiness(A({ purposes: [P({ name: "X", approval: "pending" })] }), TODAY).next?.isLink, false);
eq("draft approval is a link", readiness(A({ purposes: [P({ name: "X", approval: "draft", inPublishedNotice: false })] }), TODAY).next?.isLink, true);
eq("rejected -> resubmit link", readiness(A({ purposes: [P({ name: "X", approval: "rejected" })] }), TODAY).next?.text, "Resubmit 'X'");

// --- review-due via drift (not just age) -----------------------------------
eq("drift -> review_due", readiness(A({ approved: true, submitted: true, lastReviewedAt: "2026-10-20", driftSinceApproval: true }), TODAY).state, "review_due");

console.log(`\nActivity readiness: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
