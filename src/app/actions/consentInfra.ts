"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import {
  legacyBulkImport, runIsolationCheck, sendWebhookTest, retryWebhookDelivery,
  generateLanguageVariant, setExpiryBehavior, runExpirySweep, apiRetrievabilityCheck,
  type LegacyRecordInput, type ApiCheckResult,
} from "@/lib/engines/consentInfra";
import type { ActionResult } from "@/app/actions/requests";

function fail(e: unknown): ActionResult { const err = e as Error; return { ok: false, error: err.message, errorKind: err.name }; }
function touch(...p: string[]) { for (const x of p) revalidatePath(x, "layout"); }

export async function legacyBulkImportAction(
  input: { sourceSystem: string; records: LegacyRecordInput[]; saveTemplate?: { name: string; mapping: { legacyField: string; schemaField: string }[] } },
): Promise<ActionResult & { verified?: number; unverifiable?: number; total?: number }> {
  const { actor } = await getSession();
  try { const r = await legacyBulkImport(input, actor); touch("/consent/legacy-import", "/consent/records"); return { ok: true, ...r }; } catch (e) { return fail(e); }
}

export async function runIsolationCheckAction(entityAId: string, entityBId: string, injectLeak = false): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await runIsolationCheck(entityAId, entityBId, actor, injectLeak); touch("/consent/isolation"); return { ok: true }; } catch (e) { return fail(e); }
}

export async function sendWebhookTestAction(webhookId: string, simulateFailure = false): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await sendWebhookTest(webhookId, actor, simulateFailure); touch("/consent/webhooks"); return { ok: true }; } catch (e) { return fail(e); }
}

export async function retryWebhookDeliveryAction(deliveryId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await retryWebhookDelivery(deliveryId, actor); touch("/consent/webhooks"); return { ok: true }; } catch (e) { return fail(e); }
}

export async function generateLanguageVariantAction(noticeId: string, language: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await generateLanguageVariant(noticeId, language, actor); touch("/consent/languages", "/consent/language-qa"); return { ok: true }; } catch (e) { return fail(e); }
}

export async function setExpiryBehaviorAction(purposeTagId: string, behavior: "auto_withdraw" | "trigger_reconsent"): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await setExpiryBehavior(purposeTagId, behavior, actor); touch("/consent/expiry"); return { ok: true }; } catch (e) { return fail(e); }
}

export async function runExpirySweepAction(): Promise<ActionResult & { processed?: number; withdrawn?: number; reconsent?: number }> {
  const { actor } = await getSession();
  try { const r = await runExpirySweep(actor); touch("/consent/expiry", "/consent/records"); return { ok: true, ...r }; } catch (e) { return fail(e); }
}

export async function apiRetrievabilityCheckAction(artifactId: string): Promise<ApiCheckResult> {
  await getSession();
  try { return await apiRetrievabilityCheck(artifactId); } catch (e) { const err = e as Error; return { ok: false, error: err.message, errorKind: err.name }; }
}
