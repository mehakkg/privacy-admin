import type { PillTone } from "@/components/ui";

/**
 * The four Source statuses, matched verbatim to DLP's own definitions. Status is
 * DERIVED from the fields DLP owns (approval, scan status, last-scanned) — never
 * independently computed here, so if DLP's definition of "stale/current" moves,
 * this moves with it rather than diverging.
 */
export type SourceStatus = "current" | "never_scanned" | "awaiting_approval" | "failed";

export function sourceStatus(s: {
  dpoApprovedForScanning: boolean;
  scanStatus: string;
  lastScanned: Date | null;
}): SourceStatus {
  // Scope approval gates everything: an unapproved source is "Awaiting approval"
  // regardless of any scan state, and every action but viewing is disabled.
  if (!s.dpoApprovedForScanning) return "awaiting_approval";
  if (s.scanStatus === "failed") return "failed";
  if (!s.lastScanned || s.scanStatus === "pending") return "never_scanned";
  return "current";
}

export const SOURCE_STATUS_LABEL: Record<SourceStatus, string> = {
  current: "Current",
  never_scanned: "Never scanned",
  awaiting_approval: "Awaiting approval",
  failed: "Last scan failed",
};

export const SOURCE_STATUS_TONE: Record<SourceStatus, PillTone> = {
  current: "green",
  never_scanned: "gray",
  awaiting_approval: "purple",
  failed: "red",
};

export const SOURCE_STATUS_TIP: Record<SourceStatus, string> = {
  current: "Scanned within the DPO-approved cadence.",
  never_scanned: "Connected and approved for scope, but no scan has run yet.",
  awaiting_approval: "Connected, but not yet DPO-approved for scanning. Every action is disabled except viewing.",
  failed: "DLP reported a failure on the most recent scan attempt.",
};

export const SOURCE_KIND_LABEL: Record<string, string> = {
  database: "Database",
  cloud_storage: "Cloud storage",
  saas: "SaaS tool",
  file_share: "File share",
  other: "Other",
};
