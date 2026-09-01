/**
 * Domain vocabulary. SQLite has no enum type, so these unions are the
 * constraint: every String column documented with a `//` enum comment in
 * schema.prisma has its permitted values here, plus the labels the UI renders.
 */

export type ActorRole = "admin" | "dpo" | "ciso" | "grievance_officer" | "legal" | "system";

export const ROLE_LABEL: Record<ActorRole, string> = {
  admin: "Admin",
  dpo: "Data Protection Officer",
  ciso: "CISO",
  grievance_officer: "Grievance Officer",
  legal: "Legal / Procurement",
  system: "System",
};

export type RequestType = "access" | "correction" | "erasure" | "nomination";

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  access: "Access",
  correction: "Correction",
  erasure: "Erasure",
  nomination: "Nomination",
};

export type RequestStatus =
  | "received"
  | "identity_review"
  | "retention_review"
  | "executing"
  | "awaiting_confirmation"
  | "closed"
  | "rejected";

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  received: "Received",
  identity_review: "Identity review",
  retention_review: "Retention review",
  executing: "Executing",
  awaiting_confirmation: "Awaiting confirmation",
  closed: "Closed",
  rejected: "Rejected",
};

export type EscalationSource =
  | "portal"
  | "grievance_officer"
  | "dpb"
  | "branch"
  | "email";

export const ESCALATION_SOURCE_LABEL: Record<EscalationSource, string> = {
  portal: "Self-service portal",
  grievance_officer: "Grievance Officer",
  dpb: "Data Protection Board",
  branch: "Branch (assisted)",
  email: "Email",
};

/**
 * The three-state completion model, plus `failed` surfaced alongside rather
 * than collapsed into it.
 *
 * There is no `complete` / `done` boolean anywhere in this codebase. A request
 * reads `verified` only when every connected system AND every processor has
 * genuinely confirmed, and coverage of the location map is itself complete.
 */
export type ExecutionStatus = "pending" | "partial" | "verified" | "failed";

export const EXECUTION_STATUS_LABEL: Record<ExecutionStatus, string> = {
  pending: "Pending",
  partial: "Partially complete",
  verified: "Verified",
  failed: "Failed",
};

/** Request-level roll-up. Deliberately excludes `failed`: see completion.ts. */
export type CompletionState = "pending" | "partial" | "verified";

export const COMPLETION_STATE_LABEL: Record<CompletionState, string> = {
  pending: "Pending",
  partial: "Partially complete",
  verified: "Fully verified",
};

export type ExecutionMode = "api" | "manual" | "delayed" | "processor_instruction";

export const EXECUTION_MODE_LABEL: Record<ExecutionMode, string> = {
  api: "API",
  manual: "Manual",
  delayed: "Delayed (backup)",
  processor_instruction: "Processor instruction",
};

export type VerificationMethod =
  | "api_ack"
  | "manual_attestation"
  | "processor_confirmation";

export const VERIFICATION_METHOD_LABEL: Record<VerificationMethod, string> = {
  api_ack: "API acknowledgement",
  manual_attestation: "Manual attestation",
  processor_confirmation: "Processor confirmation",
};

export type ConnectionStatus = "healthy" | "degraded" | "down" | "manual_only";

export const CONNECTION_STATUS_LABEL: Record<ConnectionStatus, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  down: "Down",
  manual_only: "No API",
};

/**
 * Retention exception review lifecycle.
 *
 * `unreviewed` blocks every execution action for the principal. Admin may move
 * an exception to `acknowledged` (respect it — the covered fields are excluded
 * from deletion) or `override_requested` (which creates an Escalation).
 *
 * `overridden` and `upheld` are terminal and can ONLY be reached through a DPO
 * ruling. Admin cannot write them; see guards/escalationGate.ts.
 */
export type RetentionReviewStatus =
  | "unreviewed"
  | "acknowledged"
  | "override_requested"
  | "overridden"
  | "upheld";

export const RETENTION_REVIEW_LABEL: Record<RetentionReviewStatus, string> = {
  unreviewed: "Not yet reviewed",
  acknowledged: "Acknowledged — fields excluded",
  override_requested: "Override requested — awaiting DPO",
  overridden: "Overridden by DPO ruling",
  upheld: "Upheld by DPO ruling",
};

/** Statuses that no longer block execution. */
export const RETENTION_BLOCKING_STATUSES: readonly RetentionReviewStatus[] = [
  "unreviewed",
];

export type EscalationStatus = "open" | "ruled" | "withdrawn";

export type EscalationRuling =
  | "approve_override"
  | "uphold_retention"
  | "partial_override";

export const ESCALATION_RULING_LABEL: Record<EscalationRuling, string> = {
  approve_override: "Override approved — deletion may proceed",
  uphold_retention: "Retention upheld — fields must be kept",
  partial_override: "Partial override — see rationale",
};

export type IdentifierKind =
  | "email"
  | "phone"
  | "pan"
  | "customer_id"
  | "account_no";

export const IDENTIFIER_KIND_LABEL: Record<IdentifierKind, string> = {
  email: "Email",
  phone: "Phone",
  pan: "PAN",
  customer_id: "Customer ID",
  account_no: "Account number",
};

export type NotificationSeverity = "info" | "warning" | "critical";

/** Data categories used by DPA-scope validation and protection rules. */
export const DATA_CATEGORIES = [
  "identity",
  "contact",
  "kyc",
  "financial",
  "transaction",
  "marketing",
  "behavioural",
  "support",
] as const;

export type DataCategory = (typeof DATA_CATEGORIES)[number];

export const DATA_CATEGORY_LABEL: Record<DataCategory, string> = {
  identity: "Identity",
  contact: "Contact",
  kyc: "KYC",
  financial: "Financial",
  transaction: "Transaction",
  marketing: "Marketing",
  behavioural: "Behavioural",
  support: "Support",
};

// ---------------------------------------------------------------------------
// Scenario 2 — Access Lifecycle & Identity Hygiene
// ---------------------------------------------------------------------------

export type EmploymentStatus = "active" | "on_notice" | "offboarded";

export const EMPLOYMENT_STATUS_LABEL: Record<EmploymentStatus, string> = {
  active: "Active",
  on_notice: "On notice",
  offboarded: "Offboarded",
};

export type AccountStatus = "active" | "disabled" | "revoked" | "orphaned";

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  active: "Active",
  disabled: "Disabled",
  revoked: "Revoked",
  orphaned: "Orphaned",
};

export type SessionKind = "session" | "api_token" | "refresh_token";

export const SESSION_KIND_LABEL: Record<SessionKind, string> = {
  session: "Interactive session",
  api_token: "API token",
  refresh_token: "Refresh token",
};

export type Disposition = "retain" | "disable" | "revoke" | "transfer_owner";

export const DISPOSITION_LABEL: Record<Disposition, string> = {
  retain: "Retain — still needed",
  disable: "Disable — keep the record, remove the access",
  revoke: "Revoke — remove all access",
  transfer_owner: "Transfer ownership",
};

// ---------------------------------------------------------------------------
// First-run onboarding
// ---------------------------------------------------------------------------

/** "done" and "skipped" are different facts and are reported separately. */
export type StepStatus = "pending" | "done" | "skipped";

export const ONBOARDING_STEPS = [
  { n: 1, slug: "escalation", label: "Escalation & retention", skippable: false },
  { n: 2, slug: "sources", label: "Connect data sources", skippable: true },
  { n: 3, slug: "scan", label: "Initial discovery scan", skippable: true },
  { n: 4, slug: "classification", label: "Review classification", skippable: false },
  { n: 5, slug: "integrations", label: "Integrations & processors", skippable: true },
  { n: 6, slug: "routing", label: "Notification routing", skippable: true },
  { n: 7, slug: "summary", label: "Summary", skippable: false },
] as const;

export type OnboardingSlug = (typeof ONBOARDING_STEPS)[number]["slug"];

/**
 * Why a skipped step matters. Shown on the summary and on the dashboard strip:
 * "skipped" alone tells Admin nothing about what it costs them.
 */
/**
 * The one-line form, shown by default. The fuller SKIP_CONSEQUENCE text sits
 * behind an expand — a paragraph per skipped item, rendered for every item at
 * once, buries the list it is meant to explain.
 */
export const SKIP_CONSEQUENCE_SHORT: Record<number, string> = {
  2: "Scans cannot run; the data map stays empty.",
  3: "Nothing scanned, so request scoping is incomplete.",
  5: "Processor instructions cannot be dispatched.",
  6: "Alerts fall back to defaults.",
};

export const SKIP_CONSEQUENCE: Record<number, string> = {
  2: "No discovery scans can run until at least one source is connected, so the data map stays empty and rights requests cannot be scoped.",
  3: "Nothing has been scanned, so classification and the data-location map for every request will be incomplete.",
  5: "Deletion and access instructions cannot be dispatched to any Data Processor, so requests involving them cannot complete.",
  6: "Notifications fall back to defaults. Cross-persona alerts still fire, but not necessarily to the people you would have chosen.",
};

export type SourceKind =
  | "database"
  | "cloud_storage"
  | "saas"
  | "file_share"
  | "other";

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  database: "Database",
  cloud_storage: "Cloud storage",
  saas: "SaaS tool",
  file_share: "File share",
  other: "Other / custom",
};

export type ConnectionState =
  | "untested"
  | "connected"
  | "connected_no_data"
  | "failed";

export const CONNECTION_STATE_LABEL: Record<ConnectionState, string> = {
  untested: "Not tested",
  connected: "Connected",
  connected_no_data: "Connected, no data found",
  failed: "Connection failed",
};

export type ScanStatus = "pending" | "running" | "scanned" | "partial" | "failed";

export const SCAN_STATUS_LABEL: Record<ScanStatus, string> = {
  pending: "Not scanned",
  running: "Scanning",
  scanned: "Scanned",
  partial: "Partially scanned",
  failed: "Scan failed",
};

export type Confidence = "high" | "needs_review";

export type FieldReviewState = "pending" | "approved" | "overridden";

export type NotifyChannel = "in_app" | "email" | "sms";

export const NOTIFY_CHANNEL_LABEL: Record<NotifyChannel, string> = {
  in_app: "In-app",
  email: "Email",
  sms: "SMS",
};

/** The routable events, with the default recipient each one ships with. */
export const ROUTABLE_EVENTS = [
  {
    eventType: "deletion.completed",
    label: "Deletion completed",
    defaultRole: "grievance_officer",
    defaultChannel: "in_app",
    rationale:
      "The Grievance Officer answers to the Data Principal, so they need the confirmation.",
  },
  {
    eventType: "deletion.failed",
    label: "Deletion failed",
    defaultRole: "dpo",
    defaultChannel: "email",
    rationale:
      "A failure may put a statutory deadline at risk, which is the DPO's call.",
  },
  {
    eventType: "escalation.raised",
    label: "Escalation raised",
    defaultRole: "dpo",
    defaultChannel: "in_app",
    rationale: "Escalations are rulings the DPO has to make.",
  },
  {
    eventType: "sla.at_risk",
    label: "SLA at risk",
    defaultRole: "dpo",
    defaultChannel: "email",
    rationale:
      "Board escalation on lapse is automatic, so the DPO needs warning before it fires.",
  },
] as const;

export type DpaStatus = "draft" | "active";

/** Retention categories are DPO-owned; Admin reads them. */
export const GOVERNANCE_OWNERS = {
  retentionCategory: "DPO",
  purposeTag: "DPO",
  noticeVersion: "DPO",
  cookieCategory: "DPO",
  protectionRule: "CISO",
  rbacBaseline: "CISO",
} as const;

// ---------------------------------------------------------------------------
// Consent & Notices
// ---------------------------------------------------------------------------

/** A subset of the Eighth Schedule languages (DPDP s.5(3)) for notice variants. */
export const SCHEDULE_8_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "bn", label: "Bengali" },
  { code: "mr", label: "Marathi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "gu", label: "Gujarati" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "pa", label: "Punjabi" },
  { code: "or", label: "Odia" },
  { code: "as", label: "Assamese" },
] as const;

export const REGIONS = [
  { code: "IN", label: "India (all states)" },
  { code: "IN-MH", label: "Maharashtra" },
  { code: "IN-KA", label: "Karnataka" },
  { code: "IN-TN", label: "Tamil Nadu" },
  { code: "IN-DL", label: "Delhi" },
] as const;

export const CHANNEL_ORIGIN_LABEL: Record<string, string> = {
  digital: "Digital",
  bulk_import: "Bulk import",
  branch: "Branch (assisted)",
  phone: "Phone",
};

export const WEBHOOK_EVENTS = [
  "consent.granted",
  "consent.withdrawn",
  "consent.expired",
  "notice.published",
];
