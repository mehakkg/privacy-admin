/**
 * DATA MAP — activity readiness ("path to the register"), pure (no DB, no React).
 *
 * Every activity has exactly ONE readiness state, DERIVED and read-only. The nine
 * states are evaluated IN ORDER; the first match wins. This is the single source
 * the Activities list, detail header, summary line and nav badge read from, so the
 * counts always agree. Unit-tested against all ten Meridian fixture activities in
 * ./readiness.test.ts.
 */

// State keys are kept stable across the Part N reorder, but two change meaning:
//  - needs_approval  → "Needs a purpose decision" (a Draft purpose no longer
//    blocks; it is bundled with the activity's submission). Only Pending or
//    Rejected purposes block here.
//  - needs_notice    → "Approved · needs a notice": the DPO has now approved the
//    activity, and the notice is the LAST step before the register.
// New check order: Basics · Data · Systems · Purposes · DPO · Notice.
export type ReadinessState =
  | "needs_basics" | "needs_data" | "needs_processors" | "needs_approval"
  | "ready_to_submit" | "waiting_for_dpo" | "needs_notice" | "approved" | "review_due";

/** Chip styling token per state. */
export type ChipTone = "amber-outline" | "primary-outline" | "info" | "success" | "amber-fill";

export const READINESS_META: Record<ReadinessState, { label: string; tone: ChipTone }> = {
  needs_basics:    { label: "Needs the basics",         tone: "amber-outline" },
  needs_data:      { label: "Needs data",               tone: "amber-outline" },
  needs_processors:{ label: "Needs processors",         tone: "amber-outline" },
  needs_approval:  { label: "Needs a purpose decision", tone: "amber-outline" },
  ready_to_submit: { label: "Ready to submit",          tone: "primary-outline" },
  waiting_for_dpo: { label: "Waiting for DPO",          tone: "info" },
  needs_notice:    { label: "Approved · needs a notice", tone: "primary-outline" },
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

  // 4 — Needs a purpose decision: a Pending (submitted separately) or Rejected
  //     purpose blocks. A Draft purpose does NOT block — it is bundled with this
  //     activity's submission and reviewed together (Part N2).
  const blocking = a.purposes.filter((p) => p.approval === "pending" || p.approval === "rejected");
  if (blocking.length > 0) {
    const rejected = blocking.find((p) => p.approval === "rejected");
    const next: NextStep = rejected
      ? { text: `Resubmit '${rejected.name}'`, isLink: true }
      : { text: `Waiting on '${blocking[0].name}'`, isLink: false };
    return mk("needs_approval", next);
  }

  // Checks 1–4 pass (every purpose is Approved or a bundled Draft).
  if (a.approved) {
    // 6 — Notice is the last step before the register (now AFTER DPO approval).
    const noNotice = a.purposes.find((p) => p.legalBasis === "consent" && !p.inPublishedNotice);
    if (noNotice) return mk("needs_notice", { text: `Add '${noNotice.name}' to a notice`, isLink: true });
    const stale = a.lastReviewedAt != null && today.getTime() - new Date(a.lastReviewedAt).getTime() > REVIEW_DUE_DAYS * DAY;
    if (stale || a.driftSinceApproval) return mk("review_due", { text: "Review this activity", isLink: true });
    return mk("approved", null);
  }
  // 5 — Waiting for DPO (submitted, not yet approved).
  if (a.submitted) return mk("waiting_for_dpo", null);
  // 5 — Ready to submit. Draft purposes travel with the submission.
  const draftCount = a.purposes.filter((p) => p.approval === "draft").length;
  const text = draftCount > 0 ? `Submit with ${plural(draftCount, "new purpose")}` : "Submit for DPO review";
  return mk("ready_to_submit", { text, isLink: true });
}

/** Buckets for the list filter chips + summary line. */
export type ReadinessBucket = "needs_work" | "waiting_for_dpo" | "review_due" | "approved";
export function bucketOf(state: ReadinessState): ReadinessBucket {
  if (state === "approved") return "approved";
  if (state === "review_due") return "review_due";
  if (state === "waiting_for_dpo") return "waiting_for_dpo";
  return "needs_work"; // needs_* and ready_to_submit
}

/** In the register (Approved or Review due) vs in progress (everything else). */
export function inRegister(state: ReadinessState): boolean {
  return state === "approved" || state === "review_due";
}

// --- Who must act, and the six-check progress (Activities screen redesign) ---

export type Actor = "admin" | "dpo" | "owner" | "none";

/** Who has to act next, given the state. Draft/Rejected purposes → Admin; a purpose
 *  only Pending → DPO; a submitted activity → DPO; review due → the business owner. */
export function readinessActor(state: ReadinessState, a: ReadinessActivity): Actor {
  switch (state) {
    case "needs_basics": case "needs_data": case "needs_processors": case "needs_notice": case "ready_to_submit": return "admin";
    // A Rejected purpose is the Admin's to fix; a Pending-only decision is the DPO's.
    case "needs_approval": return a.purposes.some((p) => p.approval === "rejected") ? "admin" : "dpo";
    case "waiting_for_dpo": return "dpo";
    case "review_due": return "owner";
    case "approved": return "none";
  }
}

export type CheckKey = "basics" | "data" | "systems" | "purpose" | "dpo" | "notice";
export type CheckState = "pass" | "block" | "todo" | "na";
export interface Check { key: CheckKey; label: string; state: CheckState }
// Progress-dot order (Part N1): Basics · Data · Systems · Purposes · DPO · Notice.
const CHECK_ORDER: CheckKey[] = ["basics", "data", "systems", "purpose", "dpo", "notice"];
const CHECK_LABEL: Record<CheckKey, string> = { basics: "Basics", data: "Data", systems: "Systems", purpose: "Purposes", dpo: "DPO", notice: "Notice" };
const BLOCK_OF: Record<ReadinessState, CheckKey | null> = {
  needs_basics: "basics", needs_data: "data", needs_processors: "systems", needs_approval: "purpose",
  ready_to_submit: "dpo", waiting_for_dpo: "dpo", needs_notice: "notice", approved: null, review_due: null,
};

/** The six checks as dot states: checks before the blocking one pass, the blocking
 *  one is `block`, later ones are `todo`; the Notice check is `na` for a
 *  legitimate-use-only activity. */
export function readinessChecks(a: ReadinessActivity, today: Date = new Date()): Check[] {
  const state = readiness(a, today).state;
  const block = BLOCK_OF[state];
  const noticeNa = a.purposes.length > 0 && !a.purposes.some((p) => p.legalBasis === "consent");
  const bi = block ? CHECK_ORDER.indexOf(block) : CHECK_ORDER.length;
  return CHECK_ORDER.map((key, i) => {
    const label = CHECK_LABEL[key];
    if (key === "notice" && noticeNa) return { key, label, state: "na" as CheckState };
    if (i < bi) return { key, label, state: "pass" as CheckState };
    if (i === bi) return { key, label, state: "block" as CheckState };
    return { key, label, state: "todo" as CheckState };
  });
}

export function checksAria(checks: Check[]): string {
  const passed = checks.filter((c) => c.state === "pass").length;
  const blocked = checks.find((c) => c.state === "block");
  return `Readiness: ${passed} of 6 checks passed.${blocked ? ` Blocked at ${blocked.label}.` : ""}`;
}
