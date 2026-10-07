"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import {
  startDraft, discardDraft, setBaseline, setFieldCategory, markReady, addAudience, renameAudience, removeAudience,
  addChannel, setGrant, bulkBaseline, activate, restoreAsDraft,
  checkFieldCode, addCustomField, removeCustomField, channelUsage, renameChannel, changeChannelIdentifier, removeChannel, changeAudienceIdentifier,
  setFieldStrength, setSensitivityRules, classifyField,
  type AddFieldInput, type ChannelUsage,
} from "@/lib/engines/maskingpolicy";
import type { Masking, FieldStatus, Tier } from "@/lib/maskingpolicy";

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
export async function setFieldStrengthAction(versionId: string, fieldCode: string, input: { mode: "follows" | "custom" | "held"; rank?: number; reason?: string }): Promise<MPResult> {
  try { await setFieldStrength(versionId, fieldCode, input); touch(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function setSensitivityRulesAction(versionId: string, rules: { tier: Tier; rank: number }[]): Promise<MPResult> {
  try { await setSensitivityRules(versionId, rules); touch(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function classifyFieldAction(code: string, tier: Tier): Promise<MPResult> {
  try { await classifyField(code, tier); touch(); return { ok: true }; } catch (e) { return fail(e); }
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
export async function setGrantAction(versionId: string, audienceId: string, fieldCode: string, input: { direction?: "more" | "less"; visibility: "more" | "full_raw" | "restrict"; masking?: Masking | null; channelScope: "ANY" | string[]; reason?: string } | null): Promise<MPResult> {
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

export async function checkFieldCodeAction(code: string): Promise<{ taken: "none" | "custom" | "platform"; categoryName?: string }> {
  return checkFieldCode(code);
}
export async function addFieldAction(draftId: string, input: AddFieldInput): Promise<MPResult & { code?: string }> {
  try { const r = await addCustomField(draftId, input); touch(); return { ok: true, code: r.code }; } catch (e) { return fail(e); }
}
export async function removeFieldAction(code: string): Promise<MPResult> {
  try { await removeCustomField(code); touch(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function channelUsageAction(draftId: string): Promise<{ channels: ChannelUsage[] }> {
  return { channels: await channelUsage(draftId) };
}
export async function renameChannelAction(id: string, label: string): Promise<MPResult> {
  try { await renameChannel(id, label); touch(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function changeChannelIdentifierAction(id: string, identifier: string): Promise<MPResult> {
  try { await changeChannelIdentifier(id, identifier); touch(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function removeChannelAction(id: string): Promise<MPResult> {
  try { await removeChannel(id); touch(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function changeAudienceIdentifierAction(id: string, identifier: string): Promise<MPResult> {
  try { await changeAudienceIdentifier(id, identifier); touch(); return { ok: true }; } catch (e) { return fail(e); }
}
