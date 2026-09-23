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

/**
 * Connection health for the Sources glance view. It is the SAME derivation as
 * sourceStatus() (the one DLP owns), only banded for at-a-glance triage: a
 * "current" source that hasn't scanned within SOURCE_STALE_DAYS reads as Stale,
 * everything else keeps its underlying state. A stale/failed source is never
 * visually indistinguishable from a healthy one.
 */
export const SOURCE_STALE_DAYS = 30;
export type SourceHealth = "healthy" | "stale" | "failed" | "awaiting_approval" | "never_scanned";

export function sourceHealth(
  s: { dpoApprovedForScanning: boolean; scanStatus: string; lastScanned: Date | null },
  now: Date = new Date(),
): SourceHealth {
  const base = sourceStatus(s);
  if (base === "current") {
    if (s.lastScanned && now.getTime() - s.lastScanned.getTime() > SOURCE_STALE_DAYS * 86400000) return "stale";
    return "healthy";
  }
  return base;
}

export const SOURCE_HEALTH_LABEL: Record<SourceHealth, string> = {
  healthy: "Healthy",
  stale: "Stale",
  failed: "Failed",
  awaiting_approval: "Awaiting approval",
  never_scanned: "Never scanned",
};
export const SOURCE_HEALTH_TONE: Record<SourceHealth, PillTone> = {
  healthy: "green",
  stale: "yellow",
  failed: "red",
  awaiting_approval: "purple",
  never_scanned: "gray",
};
export const SOURCE_HEALTH_TIP: Record<SourceHealth, string> = {
  healthy: "Connected and scanned within the approved cadence.",
  stale: `No successful sync in over ${SOURCE_STALE_DAYS} days — refresh before relying on this source.`,
  failed: "The most recent sync failed — this matches the integration-sync-failure alert in Notifications.",
  awaiting_approval: "Connected, but not yet DPO-approved for scanning.",
  never_scanned: "Connected and approved, but no scan has run yet.",
};
