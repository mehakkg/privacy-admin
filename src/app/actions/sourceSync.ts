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
/**
 * Register a source manually, alongside the DLP-synced pass-through path. A
 * manually-added source is provenance = manually_added, gets real in-product scan
 * configuration, and — when there's no live connection yet — sits in an explicit
 * "no automated scan" state rather than pretending to be fully synced.
 */
export async function createManualSourceAction(
  input: { name: string; kind: string; connectionMethod: "live" | "manual_none" },
): Promise<ActionResult & { id?: string }> {
  const { actor } = await getSession();
  if (!input.name.trim()) return { ok: false, error: "Give the source a name.", errorKind: "ValidationError" };
  const dupe = await db.discoverySource.findUnique({ where: { name: input.name.trim() } });
  if (dupe) return { ok: false, error: "A source with that name already exists.", errorKind: "ValidationError" };
  try {
    const created = await audited(
      { actor, action: "source.manually_added", targetType: "DiscoverySource", targetId: input.name.trim(), eventDescription: `Manually registered source ${input.name.trim()}`, payload: { kind: input.kind, connectionMethod: input.connectionMethod } },
      (tx: TxClient) => tx.discoverySource.create({
        data: {
          name: input.name.trim(),
          kind: input.kind,
          provenance: "manually_added",
          // Admin-owned in-product config — not gated on DLP scope approval.
          dpoApprovedForScanning: true,
          connectionState: input.connectionMethod === "live" ? "connected" : "untested",
          scanStatus: "pending",
          scanSchedule: "on_demand",
        },
      }),
    );
    revalidatePath("/data-map/sources");
    return { ok: true, id: created.id };
  } catch (e) {
    const err = e as Error;
    return { ok: false, error: err.message, errorKind: err.name };
  }
}

/** Per-source scan configuration for a MANUALLY-ADDED source (a DLP-synced source
 *  defers scheduling to DLP and is read-only here). */
export async function saveScanConfigAction(sourceId: string, schedule: string, depth: string): Promise<ActionResult> {
  const { actor } = await getSession();
  const source = await db.discoverySource.findUnique({ where: { id: sourceId } });
  if (!source) return { ok: false, error: "Source not found.", errorKind: "StateError" };
  if (source.provenance !== "manually_added") return { ok: false, error: "Scan configuration for a DLP-synced source lives in DLP, not here.", errorKind: "GateError" };
  if (!["on_demand", "daily", "weekly", "monthly"].includes(schedule)) return { ok: false, error: "Invalid schedule.", errorKind: "ValidationError" };
  if (!["shallow", "standard", "deep"].includes(depth)) return { ok: false, error: "Invalid depth.", errorKind: "ValidationError" };
  try {
    await audited(
      { actor, action: "source.scan_configured", targetType: "DiscoverySource", targetId: sourceId, eventDescription: `Configured scan for ${source.name} (${schedule}/${depth})`, payload: { schedule, depth } },
      (tx: TxClient) => tx.discoverySource.update({ where: { id: sourceId }, data: { scanSchedule: schedule, scanDepth: depth } }),
    );
    revalidatePath(`/data-map/sources/${sourceId}`);
    return { ok: true };
  } catch (e) {
    const err = e as Error;
    return { ok: false, error: err.message, errorKind: err.name };
  }
}

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
