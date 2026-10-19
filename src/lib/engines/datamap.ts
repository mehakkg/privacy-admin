import { db } from "@/lib/db";
import { getInventoryCounts } from "@/lib/engines/inventory";
import { getActivityCounts } from "@/lib/engines/activities";

/**
 * DATA MAP — cross-page readiness, for the "Path to ROPA" strip under every Data
 * map PageHeader. Three stages, three distinct units, ONE source each:
 *   - Fields complete  = inventory fields with status "ready" (classified + a
 *     confirmed purpose + data current).
 *   - Activities ready = activities whose completeness is complete.
 *   - ROPA entries     = activities with an active signed version.
 * "ready for ROPA" is an activity phrase only; fields read "complete".
 */
export interface ReadinessStripData {
  fields: { complete: number; total: number };
  activities: { ready: number; total: number };
  ropa: { entries: number };
}

export async function getReadinessStrip(): Promise<ReadinessStripData> {
  const [inv, acts, ropaEntries] = await Promise.all([
    getInventoryCounts(),
    getActivityCounts(),
    db.activityVersion.count({ where: { state: "active" } }),
  ]);
  return {
    fields: { complete: inv.ready, total: inv.total },
    activities: { ready: acts.ready, total: acts.all },
    ropa: { entries: ropaEntries },
  };
}
