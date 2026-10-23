import { db } from "@/lib/db";
import { getDlpHealth } from "@/lib/engines/dlp";
import { PENDING, ACCEPTED, DISMISSED, GENERATED_AT, type PendingRec, type DismissedRec } from "@/lib/activities/ropaRecs";

export interface RopaRecsView {
  pending: (PendingRec & { matchActivityId: string | null })[];
  accepted: { activityName: string; activityId: string | null; createdAt: string; by: string }[];
  dismissed: DismissedRec[];
  counts: { pending: number; accepted: number; dismissed: number };
  generatedAt: string; connected: boolean;
}

/** ROPA recommendations: the fixture suggestions resolved against the real register
 *  (closest-match + accepted activity ids), plus the DLP connection state. */
export async function getRopaRecs(): Promise<RopaRecsView> {
  const [acts, health] = await Promise.all([
    db.processingActivity.findMany({ select: { id: true, activity: true } }),
    getDlpHealth(),
  ]);
  const idByName = new Map(acts.map((a) => [a.activity, a.id]));
  return {
    pending: PENDING.map((p) => ({ ...p, matchActivityId: p.match ? idByName.get(p.match.activityName) ?? null : null })),
    accepted: ACCEPTED.map((a) => ({ ...a, activityId: idByName.get(a.activityName) ?? null })),
    dismissed: DISMISSED,
    counts: { pending: PENDING.length, accepted: ACCEPTED.length, dismissed: DISMISSED.length },
    generatedAt: GENERATED_AT, connected: health.state !== "not_connected",
  };
}
