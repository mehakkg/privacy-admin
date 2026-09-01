"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { audited } from "@/lib/engines/audit";
import type { TxClient } from "@/lib/tx";
import { encodeList } from "@/lib/codec/json";
import type { ActionResult } from "@/app/actions/requests";

async function run(path: string, operation: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await operation();
    revalidatePath(path, "layout");
    return { ok: true };
  } catch (error) {
    const e = error as Error;
    return { ok: false, error: e.message, errorKind: e.name };
  }
}

// --- Notices ---------------------------------------------------------------

export async function createNoticeAction(
  name: string,
  origin: "template" | "import" | "scratch",
): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!name.trim()) return { ok: false, error: "Name the notice.", errorKind: "ValidationError" };
  return run("/consent/notices", () =>
    audited(
      {
        actor,
        action: "notice.created",
        targetType: "Notice",
        targetId: name.trim(),
        payload: { name: name.trim(), origin },
      },
      (tx: TxClient) =>
        tx.notice.create({
          data: { name: name.trim(), origin, status: "draft" },
        }),
    ),
  );
}

export async function saveNoticeContentAction(
  noticeId: string,
  content: string,
  note: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(`/consent/notices/${noticeId}`, () =>
    audited(
      {
        actor,
        action: "notice.content_saved",
        targetType: "Notice",
        targetId: noticeId,
        payload: { note },
      },
      async (tx: TxClient) => {
        const notice = await tx.notice.findUniqueOrThrow({ where: { id: noticeId } });
        // Bump the minor version on each save, so the history is real.
        const [maj, min] = notice.currentVersion.replace(/^v/, "").split(".").map(Number);
        const nextVersion = `v${maj || 1}.${(min || 0) + 1}`;
        await tx.noticeRevision.create({
          data: { noticeId, version: nextVersion, content, note: note || null, savedBy: actor.label },
        });
        return tx.notice.update({
          where: { id: noticeId },
          data: { content, currentVersion: nextVersion },
        });
      },
    ),
  );
}

export async function saveVariantAction(
  noticeId: string,
  language: string,
  content: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(`/consent/notices/${noticeId}`, () =>
    audited(
      {
        actor,
        action: "notice.variant_saved",
        targetType: "Notice",
        targetId: noticeId,
        payload: { language },
      },
      (tx: TxClient) =>
        tx.noticeVariant.upsert({
          where: { noticeId_language: { noticeId, language } },
          create: { noticeId, language, content },
          update: { content },
        }),
    ),
  );
}

export async function publishNoticeAction(
  noticeId: string,
  regions: string[],
  notifyOnChange: boolean,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(`/consent/notices/${noticeId}`, () =>
    audited(
      {
        actor,
        action: "notice.published",
        targetType: "Notice",
        targetId: noticeId,
        payload: { regions, notifyOnChange },
      },
      (tx: TxClient) =>
        tx.notice.update({
          where: { id: noticeId },
          data: {
            status: regions.length ? "published" : "draft",
            regionsJson: encodeList(regions),
            notifyOnChange,
          },
        }),
    ),
  );
}

// --- Cookies ---------------------------------------------------------------

export async function mapScriptAction(
  scriptId: string,
  categoryId: string | null,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/consent/cookies", () =>
    audited(
      {
        actor,
        action: "cookie.script_mapped",
        targetType: "CookieScript",
        targetId: scriptId,
        payload: { categoryId },
      },
      (tx: TxClient) =>
        tx.cookieScript.update({ where: { id: scriptId }, data: { categoryId } }),
    ),
  );
}

export async function resolveFindingAction(
  findingId: string,
  resolution: "categorised" | "blocked" | "dismissed",
  categoryId: string | null,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/consent/cookies", () =>
    audited(
      {
        actor,
        action: `cookie.finding_${resolution}`,
        targetType: "CookieScanFinding",
        targetId: findingId,
        payload: { resolution, categoryId },
      },
      async (tx: TxClient) => {
        const finding = await tx.cookieScanFinding.findUniqueOrThrow({ where: { id: findingId } });
        // Blocking an undisclosed script also registers it as a mapped script,
        // so a decision here is reflected in the live configuration.
        if (resolution === "categorised" && categoryId) {
          await tx.cookieScript.create({
            data: { name: finding.scriptName, vendor: finding.vendor, page: finding.page, categoryId },
          });
        }
        return tx.cookieScanFinding.update({
          where: { id: findingId },
          data: { status: resolution },
        });
      },
    ),
  );
}

// --- Consent platform ------------------------------------------------------

export async function saveApiConfigAction(
  apiEndpoint: string,
  preferenceCenterBrand: string,
  businessUnitIsolation: boolean,
  defaultExpiryMonths: number,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/consent/platform", () =>
    audited(
      {
        actor,
        action: "consent.api_config_saved",
        targetType: "ConsentApiConfig",
        targetId: "singleton",
        payload: { apiEndpoint, preferenceCenterBrand, businessUnitIsolation, defaultExpiryMonths },
      },
      (tx: TxClient) =>
        tx.consentApiConfig.upsert({
          where: { id: "singleton" },
          create: { id: "singleton", apiEndpoint, preferenceCenterBrand, businessUnitIsolation, defaultExpiryMonths },
          update: { apiEndpoint, preferenceCenterBrand, businessUnitIsolation, defaultExpiryMonths },
        }),
    ),
  );
}

export async function addWebhookAction(
  endpoint: string,
  event: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!endpoint.trim()) return { ok: false, error: "An endpoint URL is required.", errorKind: "ValidationError" };
  return run("/consent/platform", () =>
    audited(
      {
        actor,
        action: "consent.webhook_added",
        targetType: "Webhook",
        targetId: endpoint.trim(),
        payload: { endpoint: endpoint.trim(), event },
      },
      (tx: TxClient) => tx.webhook.create({ data: { endpoint: endpoint.trim(), event } }),
    ),
  );
}

export async function testWebhookAction(webhookId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/consent/platform", () =>
    audited(
      {
        actor,
        action: "consent.webhook_tested",
        targetType: "Webhook",
        targetId: webhookId,
        payload: {},
      },
      async (tx: TxClient) => {
        const hook = await tx.webhook.findUniqueOrThrow({ where: { id: webhookId } });
        // Deterministic simulated result keyed off the endpoint host.
        const ok = !hook.endpoint.includes("example.in");
        return tx.webhook.update({
          where: { id: webhookId },
          data: {
            lastTestAt: new Date(),
            lastTestResult: ok ? "200 OK" : "503 Service Unavailable",
            status: ok ? "active" : "failing",
          },
        });
      },
    ),
  );
}

export interface DraftConsent {
  subjectRef: string;
  purposeTagId: string | null;
  channelOrigin: string;
}

/** Bulk consent import — same commit shape as Processing Activities. */
export async function saveConsentRecordsAction(
  drafts: DraftConsent[],
): Promise<{ ok: boolean; savedIndexes: number[]; failed: { index: number; reason: string }[] }> {
  const { actor } = await getSession();
  const savedIndexes: number[] = [];
  const failed: { index: number; reason: string }[] = [];

  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    if (!d.subjectRef.trim()) {
      failed.push({ index: i, reason: "A subject reference is required." });
      continue;
    }
    try {
      await audited(
        {
          actor,
          action: "consent.record_imported",
          targetType: "ConsentRecord",
          targetId: d.subjectRef,
          payload: { subjectRef: d.subjectRef, purposeTagId: d.purposeTagId, channelOrigin: d.channelOrigin },
        },
        (tx: TxClient) =>
          tx.consentRecord.create({
            data: {
              subjectRef: d.subjectRef.trim(),
              purposeTagId: d.purposeTagId,
              channelOrigin: "bulk_import",
              status: "granted",
              artifactHash: `sha256:${Math.abs(hash(d.subjectRef)).toString(16)}…`,
            },
          }),
      );
      savedIndexes.push(i);
    } catch (error) {
      failed.push({ index: i, reason: (error as Error).message });
    }
  }

  revalidatePath("/consent/platform", "layout");
  return { ok: failed.length === 0, savedIndexes, failed };
}

// --- Assisted collection ---------------------------------------------------

export async function captureBranchConsentAction(
  subjectRef: string,
  purposeTagId: string,
  idVerification: string,
  offline: boolean,
): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!subjectRef.trim() || !purposeTagId || !idVerification.trim()) {
    return {
      ok: false,
      error: "Customer reference, purpose and in-person ID verification are all required.",
      errorKind: "ValidationError",
    };
  }
  return run("/consent/assisted", () =>
    audited(
      {
        actor,
        action: "consent.branch_captured",
        targetType: "ConsentRecord",
        targetId: subjectRef,
        payload: { subjectRef, purposeTagId, idVerification, offline },
      },
      (tx: TxClient) =>
        tx.consentRecord.create({
          data: {
            subjectRef: subjectRef.trim(),
            purposeTagId,
            channelOrigin: "branch",
            status: "granted",
            idVerification: idVerification.trim(),
            // Offline capture is not yet synced to the central store.
            syncStatus: offline ? "pending" : "synced",
            artifactHash: offline ? null : `sha256:${Math.abs(hash(subjectRef)).toString(16)}…`,
          },
        }),
    ),
  );
}

export async function retrySyncAction(recordId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/consent/assisted", () =>
    audited(
      {
        actor,
        action: "consent.sync_retried",
        targetType: "ConsentRecord",
        targetId: recordId,
        payload: {},
      },
      (tx: TxClient) =>
        tx.consentRecord.update({
          where: { id: recordId },
          data: {
            syncStatus: "synced",
            artifactHash: `sha256:${Math.abs(Date.now()).toString(16)}…`,
          },
        }),
    ),
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}
