"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { scheduleScan, overrideClassification, bulkOnboardSources, quarantineField, requestShareApproval, decideShareApproval, saveIntegration, runIdentityResolution, type FieldMap } from "@/lib/engines/scenario4";
import type { ActionResult } from "@/app/actions/requests";

function ok(): ActionResult { return { ok: true }; }
function fail(e: unknown): ActionResult { const err = e as Error; return { ok: false, error: err.message, errorKind: err.name }; }
function touch(...paths: string[]) { for (const p of paths) revalidatePath(p, "layout"); }

export async function scheduleScanAction(sourceIds: string[], schedule: string, offPeakWindow: string | null): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await scheduleScan(sourceIds, schedule, offPeakWindow, actor); touch("/discovery/scan-config"); return ok(); } catch (e) { return fail(e); }
}

export async function overrideClassificationAction(fieldId: string, newType: string, category: string, note: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await overrideClassification(fieldId, newType, category, note, actor); touch("/discovery/scan-results", "/discovery/inventory"); return ok(); } catch (e) { return fail(e); }
}

export async function bulkOnboardSourcesAction(sourceIds: string[]): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await bulkOnboardSources(sourceIds, actor); touch("/discovery/scan-results", "/discovery/sources"); return ok(); } catch (e) { return fail(e); }
}

export async function quarantineFieldAction(fieldId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await quarantineField(fieldId, actor); touch("/discovery/scan-results", "/discovery/quarantine"); return ok(); } catch (e) { return fail(e); }
}

export async function requestShareApprovalAction(fieldId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await requestShareApproval(fieldId, actor); touch("/discovery/quarantine"); return ok(); } catch (e) { return fail(e); }
}

export async function decideShareApprovalAction(requestId: string, approve: boolean, note: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await decideShareApproval(requestId, approve, note, actor); touch("/discovery/quarantine"); return ok(); } catch (e) { return fail(e); }
}

export async function saveIntegrationAction(input: { id?: string; name: string; vendor: string; syncFrequency: string; mapping: FieldMap[]; monitoringEnabled: boolean; connect: boolean }): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await saveIntegration(input, actor); touch("/integrations/setup"); return ok(); } catch (e) { return fail(e); }
}

export async function runIdentityResolutionAction(): Promise<ActionResult & { flagged?: number }> {
  const { actor } = await getSession();
  try { const r = await runIdentityResolution(actor); touch("/discovery/identity-resolution", "/discovery/duplicates"); return { ok: true, flagged: r.flagged }; } catch (e) { return fail(e); }
}
