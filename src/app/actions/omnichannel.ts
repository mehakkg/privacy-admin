"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import {
  recordIdentityVerification, createAssistedRequest,
  captureBranchConsentConnected, queueOfflineConsent, syncOfflineQueue, retryOfflineItem,
  runUnificationCheck, retryNotificationDelivery,
} from "@/lib/engines/omnichannel";
import type { ActionResult } from "@/app/actions/requests";

function fail(e: unknown): ActionResult { const err = e as Error; return { ok: false, error: err.message, errorKind: err.name }; }
function touch(...p: string[]) { for (const x of p) revalidatePath(x, "layout"); }

export async function recordIdentityVerificationAction(
  input: { method: string; documentType?: string; attestingEmployeeId?: string },
): Promise<ActionResult & { verificationId?: string }> {
  const { actor } = await getSession();
  try {
    const v = await recordIdentityVerification(input, actor);
    touch("/intake/identity-verification", "/intake/assisted");
    return { ok: true, verificationId: v.id };
  } catch (e) { return fail(e); }
}

export async function createAssistedRequestAction(
  input: { verificationId: string; type: string; rawIdentifier: string; rawIdentifierKind: string; channelOrigin: string; preferredNotificationChannel: string },
): Promise<ActionResult & { reference?: string }> {
  const { actor } = await getSession();
  try {
    const r = await createAssistedRequest(input, actor);
    touch("/intake/assisted", "/requests/sla", "/notifications/delivery");
    return { ok: true, reference: r.referenceCode };
  } catch (e) { return fail(e); }
}

export async function captureBranchConsentAction(
  input: { subjectRef: string; purposeTagId: string | null; captureChannel: string; idVerification: string; templateId?: string | null },
): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await captureBranchConsentConnected(input, actor); touch("/consent/branch-capture", "/consent/unification"); return { ok: true }; } catch (e) { return fail(e); }
}

export async function queueOfflineConsentAction(
  input: { consentDraftId: string; deviceId: string; subjectRef: string; purposeTagId: string | null; captureChannel: string; idVerification: string; capturedAt: string },
): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await queueOfflineConsent({ ...input, capturedAt: new Date(input.capturedAt) }, actor); touch("/consent/branch-capture"); return { ok: true }; } catch (e) { return fail(e); }
}

export async function syncOfflineQueueAction(deviceId: string, simulateFailure = false): Promise<ActionResult & { synced?: number; failed?: number }> {
  const { actor } = await getSession();
  try { const r = await syncOfflineQueue(deviceId, actor, simulateFailure); touch("/consent/branch-capture", "/consent/unification"); return { ok: true, synced: r.synced, failed: r.failed }; } catch (e) { return fail(e); }
}

export async function retryOfflineItemAction(itemId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await retryOfflineItem(itemId, actor); touch("/consent/branch-capture", "/consent/unification"); return { ok: true }; } catch (e) { return fail(e); }
}

export async function runUnificationCheckAction(injectDiscrepancy = false): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await runUnificationCheck(actor, injectDiscrepancy); touch("/consent/unification"); return { ok: true }; } catch (e) { return fail(e); }
}

export async function retryNotificationDeliveryAction(notificationId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await retryNotificationDelivery(notificationId, actor); touch("/notifications/delivery"); return { ok: true }; } catch (e) { return fail(e); }
}
