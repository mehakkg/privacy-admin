"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { assignPurposeToFields, removePurposeFromField, setFieldAttribute, suggestPurposes, getAssignActivityOptions, type AssignResult } from "@/lib/engines/inventory";
import { syncDlpNow } from "@/lib/engines/dlp";

export interface InvResult { ok: boolean; error?: string; errorKind?: string }
function fail(e: unknown): InvResult { const err = e as Error; return { ok: false, error: err.message, errorKind: err.name }; }
function touch() { revalidatePath("/discovery/inventory", "page"); revalidatePath("/data-map/processing-activities", "layout"); revalidatePath("/audit", "layout"); }

export async function getAssignActivityOptionsAction(purposeTagId: string) { return getAssignActivityOptions(purposeTagId); }

export async function assignPurposeAction(fieldIds: string[], purposeTagId: string, opts?: { activityId?: string; newActivity?: boolean }): Promise<InvResult & { result?: AssignResult & { activityId?: string } }> {
  const { actor } = await getSession();
  try { const result = await assignPurposeToFields(fieldIds, purposeTagId, actor, opts); touch(); return { ok: true, result }; } catch (e) { return fail(e); }
}
export async function removePurposeAction(fieldId: string, purposeTagId: string): Promise<InvResult> {
  const { actor } = await getSession();
  try { await removePurposeFromField(fieldId, purposeTagId, actor); touch(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function setFieldAttributeAction(fieldId: string, attr: "dataCategoryId" | "dataSubjectType", value: string | null): Promise<InvResult> {
  try { await setFieldAttribute(fieldId, attr, value); touch(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function suggestPurposesAction(fieldId: string): Promise<{ suggestions: { id: string; name: string; strong: boolean }[] }> {
  return { suggestions: await suggestPurposes(fieldId) };
}
export async function syncNowAction(): Promise<InvResult> {
  try { await syncDlpNow(); touch(); return { ok: true }; } catch (e) { return fail(e); }
}
