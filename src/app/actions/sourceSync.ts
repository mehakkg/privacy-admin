"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { audited } from "@/lib/engines/audit";
import type { TxClient } from "@/lib/tx";
import type { ActionResult } from "@/app/actions/requests";

/**
 * Manual source sync. Records a completed ScanRun and refreshes the source's
 * scan state, so a Stale/Failed source can be brought current from the Sources
 * glance view. Health is read from the SAME derived status the notification
 * system uses (ScanRun history / scanStatus) — this just advances it.
 */
export async function syncSourceAction(sourceId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  const source = await db.discoverySource.findUnique({ where: { id: sourceId }, include: { _count: { select: { fields: true } } } });
  if (!source) return { ok: false, error: "Source not found.", errorKind: "StateError" };
  if (!source.dpoApprovedForScanning) return { ok: false, error: "This source is awaiting DPO scope approval — it cannot be synced yet.", errorKind: "GateError" };

  try {
    const now = new Date();
    await audited(
      { actor, action: "source.synced", targetType: "DiscoverySource", targetId: sourceId, eventDescription: `Manual sync of ${source.name}`, payload: { fields: source._count.fields } },
      async (tx: TxClient) => {
        await tx.scanRun.create({ data: { sourceId, status: "completed", completedAt: now, fieldsFound: source._count.fields } });
        await tx.discoverySource.update({ where: { id: sourceId }, data: { scanStatus: "scanned", lastScanned: now } });
      },
    );
    revalidatePath("/data-map/sources");
    return { ok: true };
  } catch (e) {
    const err = e as Error;
    return { ok: false, error: err.message, errorKind: err.name };
  }
}
