"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import {
  tagFieldsToPurpose, createDataCategory, setCategoryMembership, deleteDataCategory, bulkTagCategory,
  overrideVariant, setVariantInherit, reviewVariant, runVariantQA, setDeviceCheck, publishVariant, publishAllVariants,
  proposeCookieCategory, decideCookieCategory, runScriptComplianceScan, categorizeScript, type PurposeTagInput,
} from "@/lib/engines/scenario6";
import type { ActionResult } from "@/app/actions/requests";

function ok(extra?: Record<string, unknown>): ActionResult { return { ok: true, ...extra }; }
function fail(e: unknown): ActionResult { const err = e as Error; return { ok: false, error: err.message, errorKind: err.name }; }
function touch(...p: string[]) { for (const x of p) revalidatePath(x, "layout"); }

// Data Map
export async function tagFieldsToPurposeAction(fieldIds: string[], choice: PurposeTagInput): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await tagFieldsToPurpose(fieldIds, choice, actor); touch("/discovery/inventory", "/data-map/categories"); return ok(); } catch (e) { return fail(e); }
}
export async function createDataCategoryAction(name: string, description: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await createDataCategory(name, description, actor); touch("/data-map/categories"); return ok(); } catch (e) { return fail(e); }
}
export async function setCategoryMembershipAction(categoryId: string, fieldIds: string[], add: boolean): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await setCategoryMembership(categoryId, fieldIds, add, actor); touch("/data-map/categories"); return ok(); } catch (e) { return fail(e); }
}
export async function deleteDataCategoryAction(categoryId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await deleteDataCategory(categoryId, actor); touch("/data-map/categories"); return ok(); } catch (e) { return fail(e); }
}
export async function bulkTagCategoryAction(categoryId: string, choice: PurposeTagInput): Promise<ActionResult & { count?: number }> {
  const { actor } = await getSession();
  try { const n = await bulkTagCategory(categoryId, choice, actor); touch("/data-map/categories", "/discovery/inventory"); return { ok: true, count: n }; } catch (e) { return fail(e); }
}

// Notices
export async function overrideVariantAction(variantId: string, content: string, noticeId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await overrideVariant(variantId, content, actor); touch(`/consent/notices/${noticeId}/release`); return ok(); } catch (e) { return fail(e); }
}
export async function setVariantInheritAction(variantId: string, noticeId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await setVariantInherit(variantId, actor); touch(`/consent/notices/${noticeId}/release`); return ok(); } catch (e) { return fail(e); }
}
export async function reviewVariantAction(variantId: string, noticeId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await reviewVariant(variantId, actor); touch(`/consent/notices/${noticeId}/release`); return ok(); } catch (e) { return fail(e); }
}
export async function runVariantQAAction(variantId: string, noticeId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await runVariantQA(variantId, actor); touch(`/consent/notices/${noticeId}/release`); return ok(); } catch (e) { return fail(e); }
}
export async function setDeviceCheckAction(checkId: string, status: "pass" | "fail", detail: string, noticeId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await setDeviceCheck(checkId, status, detail, actor); touch(`/consent/notices/${noticeId}/release`); return ok(); } catch (e) { return fail(e); }
}
export async function publishVariantAction(variantId: string, noticeId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await publishVariant(variantId, actor); touch(`/consent/notices/${noticeId}/release`); return ok(); } catch (e) { return fail(e); }
}
export async function publishAllVariantsAction(noticeId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await publishAllVariants(noticeId, actor); touch(`/consent/notices/${noticeId}/release`, "/consent/notices"); return ok(); } catch (e) { return fail(e); }
}

// Cookies
export async function proposeCookieCategoryAction(name: string, description: string, defaultState: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await proposeCookieCategory(name, description, defaultState, actor); touch("/consent/cookies"); return ok(); } catch (e) { return fail(e); }
}
export async function decideCookieCategoryAction(id: string, approve: boolean): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await decideCookieCategory(id, approve, actor); touch("/consent/cookies"); return ok(); } catch (e) { return fail(e); }
}
export async function runScriptComplianceScanAction(): Promise<ActionResult & { flagged?: number }> {
  const { actor } = await getSession();
  try { const r = await runScriptComplianceScan(actor, "manual"); touch("/consent/cookies", "/consent/script-scan"); return { ok: true, flagged: r.flagged }; } catch (e) { return fail(e); }
}
export async function categorizeScriptAction(findingId: string, categoryId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await categorizeScript(findingId, categoryId, actor); touch("/consent/script-scan", "/consent/cookies"); return ok(); } catch (e) { return fail(e); }
}
