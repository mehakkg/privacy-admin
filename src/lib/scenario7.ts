/** Scenario-6 (protection rules + entity) shared constants — pure, client-safe. */

export const PROPOSAL_STATUS_TONE: Record<string, "yellow" | "green" | "red" | "blue"> = {
  pending_ciso: "yellow", approved: "green", denied: "red", counter_proposed: "blue",
};
export const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  pending_ciso: "Pending CISO", approved: "Approved", denied: "Denied", counter_proposed: "Counter-proposed",
};

/** System-suggested default risk-analytics metrics by the source's Discovery kind. */
export const METRICS_BY_KIND: Record<string, string[]> = {
  database: ["Records at rest", "Retention overdue", "Fields classified high-risk", "Access grants"],
  cloud_storage: ["Objects scanned", "Publicly exposed objects", "Encryption coverage", "Stale objects"],
  saas: ["Connected accounts", "Data categories shared", "OAuth scopes granted"],
  file_share: ["Files classified", "Sensitive files", "Stale files", "Undisclosed shares"],
  other: ["Records", "Classification coverage"],
};
export function suggestMetrics(kind: string): string[] { return METRICS_BY_KIND[kind] ?? METRICS_BY_KIND.other; }

export const ENTITY_SOURCE_LABEL: Record<string, string> = { native: "Native", acquired: "Acquired" };
export const IMPORT_STATUS_LABEL: Record<string, string> = { manual: "Manual entry", bulk_imported: "Bulk imported", partial_import: "Partial import" };
export const IMPORT_STATUS_TONE: Record<string, "gray" | "green" | "yellow"> = { manual: "gray", bulk_imported: "green", partial_import: "yellow" };
