"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { audited } from "@/lib/engines/audit";
import type { TxClient } from "@/lib/tx";
import {
  approveFields,
  assignPurpose,
  overrideField,
  resolveDuplicate,
  resolveRot,
  resolveTriageItems,
  runScan,
  type BulkOutcome,
} from "@/lib/engines/discovery";
import type { ActionResult } from "@/app/actions/requests";

async function run(path: string, operation: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await operation();
    revalidatePath(path, "layout");
    revalidatePath("/discovery", "layout");
    return { ok: true };
  } catch (error) {
    const e = error as Error;
    return { ok: false, error: e.message, errorKind: e.name };
  }
}

export async function runScanAction(sourceId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(`/discovery/sources/${sourceId}`, () => runScan(sourceId, actor));
}

export async function saveScanConfigAction(
  sourceId: string,
  schedule: string,
  depth: string,
  offPeakWindow: string | null,
): Promise<ActionResult> {
  const { actor } = await getSession();
  const source = await db.discoverySource.findUniqueOrThrow({ where: { id: sourceId } });

  if (!source.dpoApprovedForScanning) {
    return {
      ok: false,
      error:
        `${source.name} has not been approved for scanning by the DPO. Scan ` +
        `configuration stays read-only until the scope is approved.`,
      errorKind: "ScanNotApprovedError",
    };
  }

  return run(`/discovery/sources/${sourceId}`, () =>
    audited(
      {
        actor,
        action: "discovery.scan_config_saved",
        targetType: "DiscoverySource",
        targetId: sourceId,
        payload: { source: source.name, schedule, depth, offPeakWindow },
      },
      (tx: TxClient) =>
        tx.discoverySource.update({
          where: { id: sourceId },
          data: { scanSchedule: schedule, scanDepth: depth, offPeakWindow },
        }),
    ),
  );
}

export async function approveFieldsAction(fieldIds: string[]): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/discovery/review", () => approveFields(fieldIds, actor));
}

export async function overrideFieldAction(
  fieldId: string,
  newType: string,
  reason: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/discovery/review", () => overrideField(fieldId, newType, reason, actor));
}

export async function assignPurposeAction(
  fieldId: string,
  purposeTagId: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/discovery/review", () => assignPurpose(fieldId, purposeTagId, actor));
}

/**
 * Bulk triage. Returns the per-item outcome rather than a pass/fail, so the UI
 * can say which three of twenty failed and why.
 */
export async function resolveTriageAction(
  itemIds: string[],
  resolution: "resolved" | "dismissed" | "escalated",
): Promise<{ ok: boolean; outcome?: BulkOutcome; error?: string }> {
  const { actor } = await getSession();
  try {
    const outcome = await resolveTriageItems(itemIds, resolution, actor);
    revalidatePath("/discovery/triage", "layout");
    return { ok: outcome.failed.length === 0, outcome };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function resolveDuplicateAction(
  pairId: string,
  resolution: "merge" | "keep_both" | "keep_one",
  keptFieldId: string | null,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/discovery/duplicates", () =>
    resolveDuplicate(pairId, resolution, keptFieldId, actor),
  );
}

export async function resolveRotAction(
  candidateId: string,
  resolution: "quarantine" | "delete" | "retain",
  reason: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!reason.trim()) {
    return {
      ok: false,
      error: "A reason is required — this decision is reviewable later.",
      errorKind: "ValidationError",
    };
  }
  return run("/discovery/rot", () => resolveRot(candidateId, resolution, reason, actor));
}
