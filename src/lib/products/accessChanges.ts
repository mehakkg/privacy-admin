/**
 * Access changes — the verified revocation loop (reach-products §5.3).
 *
 * A privacy event (consent withdrawal, erasure, offboarding) creates an Access
 * change listing the target applications computed from the register. DPDP sends
 * one revocation instruction per application to miniOrange IAM; IAM executes it
 * and returns a receipt (application, user, entitlement, time, transaction id).
 * DPDP marks the row Verified only on that receipt — never by hand when a receipt
 * is possible. Applications IAM doesn't manage use Confirm manually with evidence.
 *
 * IAM/DLP/TPRM aren't connected in this prototype, so this is fixture data (§10),
 * held here as the single source so the page, the nav and any roll-up agree. When
 * the IAM connector lands (§5.4), these rows come from real receipts unchanged.
 */

export type RowState =
  | "verified" // IAM receipt received
  | "pending" // instruction sent, waiting on IAM, still inside the policy window
  | "no_confirmation" // policy window elapsed with no receipt → Retry / Escalate
  | "failed" // IAM returned an error → Retry / Open in IAM
  | "manual"; // app IAM doesn't manage → confirmed manually with evidence

export type Trigger = "offboarding" | "withdrawal" | "erasure";
export type Rollup = "pending" | "partial" | "verified";

export interface AppRow {
  app: string;
  entitlement: string;
  state: RowState;
  iamManaged: boolean;
  receiptId?: string; // IAM transaction id, present when verified
  at?: string; // when the receipt arrived / action happened
  error?: string; // for failed rows
  evidence?: string; // for manual rows
}

export interface AccessChange {
  id: string;
  subject: string; // the data principal / user whose access changes
  subjectIamId: string; // IAM person id for the "View in IAM" link
  trigger: Trigger;
  reason: string;
  createdAgo: string;
  rows: AppRow[];
}

export const TRIGGER_LABEL: Record<Trigger, string> = {
  offboarding: "Offboarding",
  withdrawal: "Consent withdrawal",
  erasure: "Erasure request",
};

export const ROLLUP_LABEL: Record<Rollup, string> = {
  pending: "Pending",
  partial: "Partially verified",
  verified: "Fully verified",
};

/** Roll-up of a change from its rows (§5.3): Pending → Partially → Fully. */
export function rollupOf(rows: AppRow[]): Rollup {
  const done = (r: AppRow) => r.state === "verified" || r.state === "manual";
  if (rows.every(done)) return "verified";
  if (rows.some(done)) return "partial";
  return "pending";
}

/** How many of the apps are confirmed (verified or manual). */
export function verifiedCount(rows: AppRow[]): number {
  return rows.filter((r) => r.state === "verified" || r.state === "manual").length;
}

// --- Fixture: Meridian Financial Services (§10) -----------------------------
export const ACCESS_CHANGES: AccessChange[] = [
  {
    id: "AC-1042",
    subject: "Rohan Desai",
    subjectIamId: "iam-rohan-desai",
    trigger: "offboarding",
    reason: "Leaver synced from miniOrange IAM — revoke access to all systems holding personal data.",
    createdAgo: "2 days ago",
    rows: [
      { app: "SharePoint › Loans", entitlement: "Contributor", state: "verified", iamManaged: true, receiptId: "IAM-RX-88421", at: "2 days ago" },
      { app: "Clientline CRM", entitlement: "Sales user", state: "verified", iamManaged: true, receiptId: "IAM-RX-88422", at: "2 days ago" },
      { app: "PeopleGrid HRMS", entitlement: "Employee self-service", state: "verified", iamManaged: true, receiptId: "IAM-RX-88430", at: "1 day ago" },
      { app: "Core Banking (CBS)", entitlement: "Teller — read", state: "no_confirmation", iamManaged: true },
    ],
  },
  {
    id: "AC-1051",
    subject: "Meera Pillai",
    subjectIamId: "iam-meera-pillai",
    trigger: "withdrawal",
    reason: "Marketing consent withdrawn — revoke access used only for marketing personalisation.",
    createdAgo: "6 hours ago",
    rows: [
      { app: "Clientline CRM", entitlement: "Marketing segment", state: "verified", iamManaged: true, receiptId: "IAM-RX-88511", at: "5 hours ago" },
      { app: "Frostbyte Analytics", entitlement: "Audience export", state: "pending", iamManaged: true },
      { app: "Branch kiosk DB", entitlement: "Promo display", state: "manual", iamManaged: false, evidence: "Kiosk promo list cleared — screenshot attached", at: "4 hours ago" },
    ],
  },
  {
    id: "AC-1047",
    subject: "Anil Kumar",
    subjectIamId: "iam-anil-kumar",
    trigger: "erasure",
    reason: "Erasure request fulfilled — remove all standing access tied to the erased record.",
    createdAgo: "4 days ago",
    rows: [
      { app: "Clientline CRM", entitlement: "Sales user", state: "verified", iamManaged: true, receiptId: "IAM-RX-88390", at: "4 days ago" },
      { app: "SharePoint › Loans", entitlement: "Reader", state: "verified", iamManaged: true, receiptId: "IAM-RX-88391", at: "4 days ago" },
    ],
  },
];

export function getAccessChange(id: string): AccessChange | undefined {
  return ACCESS_CHANGES.find((c) => c.id === id);
}
