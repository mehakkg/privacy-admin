/**
 * PROCESSING ACTIVITIES — domain types (pure, no DB import).
 *
 * The engine maps Prisma rows into these shapes; the pure functions in
 * ./logic.ts operate only on these, and components render only what those
 * functions return. Keeping the domain separate from Prisma lets the business
 * logic be unit-tested in isolation.
 */

export type Role = "admin" | "dpo";
export type Lifecycle = "draft" | "pending_dpo_review" | "active" | "under_review" | "retired";
export type Principal = "customers" | "employees" | "job_applicants" | "vendor_staff" | "children";
export type Sensitivity = "Restricted" | "Confidential" | "Internal" | "Public" | null;
export type LegalBasis = "consent" | "legitimate_use";
export type PurposeVersionState = "draft" | "waiting_for_dpo" | "approved" | "changes_requested" | "rejected" | "retired";
export type LinkState = "confirmed" | "suggested";
export type ProcessorMode = "unanswered" | "uses_processors" | "none";
export type ConsentStatus = "linked" | "not_linked" | "not_required";

export interface Retention { amount: number; unit: "months" | "years"; trigger: string }

export interface PurposeVersion {
  number: number;
  state: PurposeVersionState;
  name: string;
  description: string;
  legalBasis: LegalBasis;
  legitimateUseType: string | null;
  retention: Retention;
  justification: string;
  submittedBy: string | null;
  submittedAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionComment: string | null;
  selfApproved: boolean;
  /** Derived per version: consent-based → linked|not_linked; legitimate-use → not_required. */
  consent: ConsentStatus;
}

export interface Purpose {
  id: string;
  versions: PurposeVersion[];
  retiredAt: string | null;
}

export interface DataLink { fieldId: string; state: LinkState }
export interface ProcessorLink { vendorId: string; state: LinkState }

export interface ActivityPurpose {
  purposeId: string;
  state: LinkState; // confirmed | suggested
  dataLinks: DataLink[];
  processorMode: ProcessorMode;
  noProcessorBy: string | null;
  noProcessorAt: string | null;
  processorLinks: ProcessorLink[];
}

export type ReviewReasonType =
  | "review_due" | "new_field_in_linked_table" | "reclassified_field" | "vendor_changed"
  | "purpose_version_approved" | "purpose_retired" | "manual";

export interface ReviewReason {
  id: string;
  type: ReviewReasonType;
  detail: string;
  status: "open" | "resolved" | "dismissed";
}

export interface Activity {
  id: string;
  name: string;
  ownerId: string | null;
  department: string | null;
  entityId: string | null;
  principals: Principal[];
  lifecycle: Lifecycle;
  purposeLinks: ActivityPurpose[];
  reasons: ReviewReason[];
  lastReviewedAt: string | null;
  nextReviewDue: string | null;
}

/** Everything the pure functions need beyond the activity itself. */
export interface Ctx {
  purposes: Record<string, Purpose>;
  multiEntity: boolean;
  /** field id → how many confirmed data links across all activities, etc. — not needed by core logic. */
}

// --- Purpose state helpers --------------------------------------------------

export interface PurposeStateInfo {
  latest: PurposeVersion | null;
  inForce: PurposeVersion | null; // the approved version, if any
  state: PurposeVersionState | "none";
  /** version state, or "approved_newer_waiting" when an approved version exists but the latest is newer & non-approved. */
  displayState: PurposeVersionState | "approved_newer_waiting" | "none";
  approvedForUse: boolean; // has an approved version in force
  waitingVersionNumber: number | null;
}

export function purposeState(purpose: Purpose | undefined): PurposeStateInfo {
  if (!purpose || purpose.versions.length === 0) return { latest: null, inForce: null, state: "none", displayState: "none", approvedForUse: false, waitingVersionNumber: null };
  const sorted = [...purpose.versions].sort((a, b) => b.number - a.number);
  const latest = sorted[0];
  const inForce = sorted.find((v) => v.state === "approved") ?? null;
  if (purpose.retiredAt) return { latest, inForce, state: "retired", displayState: "retired", approvedForUse: false, waitingVersionNumber: null };
  const approvedForUse = !!inForce;
  let displayState: PurposeStateInfo["displayState"] = latest.state;
  let waitingVersionNumber: number | null = null;
  if (inForce && latest.number > inForce.number && latest.state !== "approved") {
    displayState = "approved_newer_waiting";
    waitingVersionNumber = latest.number;
  }
  return { latest, inForce, state: latest.state, displayState, approvedForUse, waitingVersionNumber };
}
