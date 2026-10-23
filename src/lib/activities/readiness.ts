/**
 * DATA MAP — activity readiness ("path to the register"), pure (no DB, no React).
 *
 * Every activity has exactly ONE readiness state, DERIVED and read-only. The nine
 * states are evaluated IN ORDER; the first match wins. This is the single source
 * the Activities list, detail header, summary line and nav badge read from, so the
 * counts always agree. Unit-tested against all ten Meridian fixture activities in
 * ./readiness.test.ts.
 */

export type ReadinessState =
  | "needs_basics" | "needs_data" | "needs_processors" | "needs_approval"
  | "needs_notice" | "ready_to_submit" | "waiting_for_dpo" | "approved" | "review_due";

/** Chip styling token per state (see spec). 1–5 amber outline, 6 primary outline,
 *  7 info, 8 success, 9 amber fill. */
export type ChipTone = "amber-outline" | "primary-outline" | "info" | "success" | "amber-fill";

export const READINESS_META: Record<ReadinessState, { label: string; tone: ChipTone }> = {
  needs_basics:    { label: "Needs the basics",         tone: "amber-outline" },
  needs_data:      { label: "Needs data",               tone: "amber-outline" },
  needs_processors:{ label: "Needs processors",         tone: "amber-outline" },
  needs_approval:  { label: "Needs a purpose approval", tone: "amber-outline" },
  needs_notice:    { label: "Needs a notice",           tone: "amber-outline" },
  ready_to_submit: { label: "Ready to submit",          tone: "primary-outline" },
  waiting_for_dpo: { label: "Waiting for DPO",          tone: "info" },
  approved:        { label: "Approved",                 tone: "success" },
  review_due:      { label: "Review due",               tone: "amber-fill" },
};

export type PurposeApproval = "draft" | "pending" | "rejected" | "approved";
export type LegalBasisKind = "consent" | "legitimate_use";

export interface ReadinessPurpose {
  name: string;
  fieldCount: number;
  /** Systems OR processors linked to this purpose. */
  systemCount: number;
  approval: PurposeApproval;
  legalBasis: LegalBasisKind;
  /** Only meaningful for consent-based purposes; legitimate use skips the notice check. */
  inPublishedNotice: boolean;
}

export interface ReadinessActivity {
  ownerId: string | null;
  department: string | null;
  principals: string[];
  purposes: ReadinessPurpose[];
  submitted: boolean;
  approved: boolean;
  /** ISO date of last review, or null if never. */
  lastReviewedAt: string | null;
  /** DLP detected a new field or system since approval. */
  driftSinceApproval: boolean;
}

export interface NextStep { text: string; isLink: boolean }
export interface Readiness { state: ReadinessState; label: string; tone: ChipTone; next: NextStep | null }

const DAY = 86_400_000;
const REVIEW_DUE_DAYS = 90;

function plural(n: number, noun: string): string { return `${n} ${noun}${n === 1 ? "" : "s"}`; }

/** The nine-state readiness, evaluated in order. `today` is injected for testability. */
export function readiness(a: ReadinessActivity, today: Date = new Date()): Readiness {
  const mk = (state: ReadinessState, next: NextStep | null): Readiness => ({ state, label: READINESS_META[state].label, tone: READINESS_META[state].tone, next });

  // 1 — Needs the basics.
  if (!a.ownerId || !a.department || a.principals.length === 0 || a.purposes.length === 0) {
    const text = !a.ownerId ? "Add an owner"
      : a.principals.length === 0 ? "Add a data principal"
      : a.purposes.length === 0 ? "Add a purpose"
      : "Add a department";
    return mk("needs_basics", { text, isLink: true });
  }
  // 2 — Needs data: any purpose with 0 fields.
  const noData = a.purposes.filter((p) => p.fieldCount === 0).length;
  if (noData > 0) return mk("needs_data", { text: `Add data to ${plural(noData, "purpose")}`, isLink: true });

  // 3 — Needs processors: any purpose WITH fields but 0 systems/processors.
  const noProc = a.purposes.filter((p) => p.fieldCount > 0 && p.systemCount === 0).length;
  if (noProc > 0) return mk("needs_processors", { text: `Choose systems for ${plural(noProc, "purpose")}`, isLink: true });

  // 4 — Needs a purpose approval: any linked purpose Draft/Pending/Rejected.
  const unapproved = a.purposes.filter((p) => p.approval !== "approved");
  if (unapproved.length > 0) {
    // Prefer an actionable one (draft/rejected) for the link; else the pending one (text).
    const actionable = unapproved.find((p) => p.approval === "draft" || p.approval === "rejected") ?? unapproved[0];
    const next: NextStep = actionable.approval === "draft" ? { text: `Submit '${actionable.name}'`, isLink: true }
      : actionable.approval === "rejected" ? { text: `Resubmit '${actionable.name}'`, isLink: true }
      : { text: `Waiting on '${actionable.name}'`, isLink: false };
    return mk("needs_approval", next);
  }
  // 5 — Needs a notice: any consent-based purpose not in a published notice.
  const noNotice = a.purposes.find((p) => p.legalBasis === "consent" && !p.inPublishedNotice);
  if (noNotice) return mk("needs_notice", { text: `Add '${noNotice.name}' to a notice`, isLink: true });

  // Past all gaps. Distinguish review-due (more specific) from plain approved.
  if (a.approved) {
    const stale = a.lastReviewedAt != null && today.getTime() - new Date(a.lastReviewedAt).getTime() > REVIEW_DUE_DAYS * DAY;
    if (stale || a.driftSinceApproval) return mk("review_due", { text: "Review this activity", isLink: true });
    return mk("approved", null);
  }
  // 7 — Waiting for DPO (submitted, not yet approved).
  if (a.submitted) return mk("waiting_for_dpo", null);
  // 6 — Ready to submit.
  return mk("ready_to_submit", { text: "Submit for DPO review", isLink: true });
}

/** Buckets for the list filter chips + summary line. */
export type ReadinessBucket = "needs_work" | "waiting_for_dpo" | "review_due" | "approved";
export function bucketOf(state: ReadinessState): ReadinessBucket {
  if (state === "approved") return "approved";
  if (state === "review_due") return "review_due";
  if (state === "waiting_for_dpo") return "waiting_for_dpo";
  return "needs_work"; // needs_* and ready_to_submit
}
