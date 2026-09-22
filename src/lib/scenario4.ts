/** Scenario 4 shared constants — pure, client-safe. */

export const OVERRIDE_REASON_CATEGORIES = [
  { value: "mis_tagged", label: "Mis-tagged by scan" },
  { value: "reclassified", label: "Genuinely reclassified" },
  { value: "other", label: "Other" },
] as const;

export const RISK_LEVELS = ["high", "medium", "low"] as const;
export const RISK_LABEL: Record<string, string> = { high: "High risk", medium: "Medium risk", low: "Low risk" };
export const RISK_TONE: Record<string, "red" | "yellow" | "gray"> = { high: "red", medium: "yellow", low: "gray" };

export const SOURCE_KIND_LABEL: Record<string, string> = {
  database: "Database", cloud_storage: "Cloud storage", saas: "SaaS", file_share: "File share", other: "Other",
};

export const SYNC_FREQUENCIES = [
  { value: "realtime", label: "Real-time" }, { value: "hourly", label: "Hourly" }, { value: "daily", label: "Daily" },
];

export const SHARE_APPROVAL_TONE: Record<string, "yellow" | "green" | "red"> = { pending: "yellow", approved: "green", denied: "red" };

/** Size-aware off-peak suggestion: large sources (file shares, databases, or a
 *  long estimated scan) get an overnight window to avoid the timeouts they've
 *  hit before. Pure so the config screen and the engine agree. */
export function isLargeSource(kind: string, estimatedDurationMinutes: number | null): boolean {
  return kind === "file_share" || kind === "database" || (estimatedDurationMinutes ?? 0) >= 45;
}
export const SUGGESTED_OFF_PEAK = "02:00-06:00";
