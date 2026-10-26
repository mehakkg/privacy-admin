import { getInventoryCounts } from "@/lib/engines/inventory";
import { getActivitiesScreen } from "@/lib/engines/activities";

/**
 * DATA MAP — cross-page readiness, for the "Path to register" strip under the
 * Data inventory header. Three stages, three distinct units, ONE source each:
 *   - Fields classified = inventory fields with a DLP sensitivity label.
 *   - Activities in the register = activities in state Approved or Review due.
 *   - Register coverage = the same % the Activities coverage strip computes.
 * Every number is computed from the same fixture store the other screens read.
 */
export interface ReadinessStripData {
  fields: { classified: number; total: number };
  activities: { inRegister: number; total: number };
  coverage: { pct: number };
}

export async function getReadinessStrip(): Promise<ReadinessStripData> {
  const [inv, screen] = await Promise.all([getInventoryCounts(), getActivitiesScreen()]);
  return {
    fields: { classified: inv.total - inv.byStatus.cls, total: inv.total },
    activities: { inRegister: screen.coverage.inRegisterCount, total: screen.rows.length },
    coverage: { pct: screen.coverage.pct },
  };
}
