/**
 * Notification categories — one vocabulary shared by the engine, the header bell,
 * the full page and the Settings config. Integration sync failure is a
 * first-class category, not an edge case.
 */
export type NotificationCategory =
  | "dpo_approval_needed"
  | "drift_detected"
  | "dsr_sla_deadline"
  | "breach_clock"
  | "integration_sync_failure"
  | "policy_violation"
  | "general_activity";

export const CATEGORY_ORDER: NotificationCategory[] = [
  "dpo_approval_needed",
  "breach_clock",
  "dsr_sla_deadline",
  "integration_sync_failure",
  "drift_detected",
  "policy_violation",
  "general_activity",
];

export const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  dpo_approval_needed: "DPO approval needed",
  drift_detected: "Drift detected",
  dsr_sla_deadline: "DSR SLA deadline",
  breach_clock: "Breach 72-hour clock",
  integration_sync_failure: "Integration sync failure",
  policy_violation: "Policy violation",
  general_activity: "General activity",
};

export const CATEGORY_DESC: Record<NotificationCategory, string> = {
  dpo_approval_needed: "A role or purpose request is waiting for your ruling.",
  drift_detected: "An assignment's access has deviated from its approved baseline.",
  dsr_sla_deadline: "A rights request is approaching or past its fulfilment deadline.",
  breach_clock: "The 72-hour Board-notification clock is running on a breach.",
  integration_sync_failure: "A discovery push / integration sync failed or timed out.",
  policy_violation: "A protection-rule or policy violation was detected.",
  general_activity: "Routine activity across the product.",
};

/** These are tied to a statutory or governance deadline — never muteable. */
export const NEVER_MUTABLE: NotificationCategory[] = ["dpo_approval_needed", "breach_clock"];
export const isMutable = (c: string): boolean => !NEVER_MUTABLE.includes(c as NotificationCategory);

/** Lucide icon name per category (resolved in the client component). */
export const CATEGORY_ICON: Record<NotificationCategory, string> = {
  dpo_approval_needed: "ShieldCheck",
  drift_detected: "GitCompareArrows",
  dsr_sla_deadline: "Clock",
  breach_clock: "AlarmClock",
  integration_sync_failure: "PlugZap",
  policy_violation: "AlertTriangle",
  general_activity: "Bell",
};

export const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };
