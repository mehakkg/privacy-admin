"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import {
  startDraft, discardDraft, setBaseline, setFieldCategory, markReady, addAudience, renameAudience, removeAudience,
  addChannel, setGrant, bulkBaseline, activate, restoreAsDraft,
} from "@/lib/engines/maskingpolicy";
import type { Masking, FieldStatus } from "@/lib/maskingpolicy";

/** Masking Policy server actions — thin adapters over the engine. */
export interface MPResult { ok: boolean; error?: string; errorKind?: string }
function fail(e: unknown): MPResult { const err = e as Error; return { ok: false, error: err.message, errorKind: err.name }; }
function touch() { revalidatePath("/data-flow/masking-policy", "layout"); revalidatePath("/audit", "layout"); }

export async function startDraftAction(): Promise<MPResult & { id?: string }> {
  const { actor } = await getSession();
  try { const id = await startDraft(actor); touch(); return { ok: true, id }; } catch (e) { return fail(e); }
}
export async function discardDraftAction(): Promise<MPResult> {
  try { await discardDraft(); touch(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function setBaselineAction(versionId: string, fieldCode: string, masking: Masking | null, status: FieldStatus): Promise<MPResult> {
  try { await setBaseline(versionId, fieldCode, masking, status); touch(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function setFieldCategoryAction(code: string, categoryId: string): Promise<MPResult> {
  try { await setFieldCategory(code, categoryId); touch(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function markReadyAction(versionId: string, fieldCodes: string[]): Promise<MPResult> {
  try { await markReady(versionId, fieldCodes); touch(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function addAudienceAction(versionId: string, label: string, identifier: string): Promise<MPResult & { id?: string }> {
  try { const id = await addAudience(versionId, label, identifier); touch(); return { ok: true, id }; } catch (e) { return fail(e); }
}
export async function renameAudienceAction(audienceId: string, label: string): Promise<MPResult> {
  try { await renameAudience(audienceId, label); touch(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function removeAudienceAction(audienceId: string): Promise<MPResult> {
  try { await removeAudience(audienceId); touch(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function addChannelAction(versionId: string, label: string, identifier: string): Promise<MPResult & { id?: string }> {
  try { const id = await addChannel(versionId, label, identifier); touch(); return { ok: true, id }; } catch (e) { return fail(e); }
}
export async function setGrantAction(versionId: string, audienceId: string, fieldCode: string, input: { visibility: "more" | "full_raw"; masking?: Masking | null; channelScope: "ANY" | string[]; reason?: string } | null): Promise<MPResult> {
  try { await setGrant(versionId, audienceId, fieldCode, input); touch(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function bulkBaselineAction(versionId: string, fieldCodes: string[], masking: Masking | null, status: FieldStatus) {
  try { const r = await bulkBaseline(versionId, fieldCodes, masking, status); touch(); return { ok: true, result: r }; } catch (e) { return { ...fail(e), result: null }; }
}
export async function activateAction(versionId: string, whyNote: string): Promise<MPResult> {
  const { actor } = await getSession();
  try { await activate(versionId, whyNote, actor); touch(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function restoreAsDraftAction(number: number): Promise<MPResult & { id?: string }> {
  const { actor } = await getSession();
  try { const id = await restoreAsDraft(number, actor); touch(); return { ok: true, id }; } catch (e) { return fail(e); }
}
