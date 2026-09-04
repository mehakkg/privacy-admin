"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { audited } from "@/lib/engines/audit";
import type { TxClient } from "@/lib/tx";
import { encodeList, decodeList } from "@/lib/codec/json";
import { evaluateRule3, type Rule3Key, type Rule3Manual } from "@/lib/notices";
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

/** Fiduciary / Category / Purpose — the structured metadata above the editor. */
export async function saveNoticeMetaAction(
  noticeId: string,
  fiduciaryId: string,
  dataCategory: string,
  purposeTagId: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(`/consent/notices/${noticeId}`, () =>
    audited(
      {
        actor,
        action: "notice.meta_saved",
        targetType: "Notice",
        targetId: noticeId,
        payload: { fiduciaryId, dataCategory, purposeTagId },
      },
      (tx: TxClient) =>
        tx.notice.update({
          where: { id: noticeId },
          data: {
            fiduciaryId: fiduciaryId || null,
            dataCategory: dataCategory || null,
            purposeTagId: purposeTagId || null,
          },
        }),
    ),
  );
}

/** Toggle a manual Rule 3 confirmation. `note` is required when turning one on. */
export async function setRule3ManualAction(
  noticeId: string,
  key: Rule3Key,
  on: boolean,
  note: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  if (on && !note.trim()) {
    return { ok: false, error: "A note is required — say where this requirement is met.", errorKind: "ValidationError" };
  }
  return run(`/consent/notices/${noticeId}`, () =>
    audited(
      {
        actor,
        action: on ? "notice.rule3_confirmed" : "notice.rule3_uncleared",
        targetType: "Notice",
        targetId: noticeId,
        payload: { key, on },
      },
      async (tx: TxClient) => {
        const notice = await tx.notice.findUniqueOrThrow({ where: { id: noticeId } });
        const manual: Rule3Manual = JSON.parse(notice.rule3ManualJson || "{}");
        if (on) manual[key] = { note: note.trim() };
        else delete manual[key];
        return tx.notice.update({
          where: { id: noticeId },
          data: { rule3ManualJson: JSON.stringify(manual) },
        });
      },
    ),
  );
}

/**
 * Restore a historical version — never an overwrite. It creates a NEW version
 * whose content matches the selected one, so the act of restoring is itself an
 * audited, reversible event, exactly like any other content change.
 */
export async function restoreNoticeVersionAction(
  noticeId: string,
  revisionId: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(`/consent/notices/${noticeId}`, () =>
    audited(
      {
        actor,
        action: "notice.version_restored",
        targetType: "Notice",
        targetId: noticeId,
        payload: { revisionId },
      },
      async (tx: TxClient) => {
        const notice = await tx.notice.findUniqueOrThrow({ where: { id: noticeId } });
        const source = await tx.noticeRevision.findUniqueOrThrow({ where: { id: revisionId } });
        const [maj, min] = notice.currentVersion.replace(/^v/, "").split(".").map(Number);
        const nextVersion = `v${maj || 1}.${(min || 0) + 1}`;
        await tx.noticeRevision.create({
          data: {
            noticeId,
            version: nextVersion,
            content: source.content,
            note: `Restored content from ${source.version}`,
            savedBy: actor.label,
          },
        });
        return tx.notice.update({
          where: { id: noticeId },
          data: { content: source.content, currentVersion: nextVersion },
        });
      },
    ),
  );
}

/**
 * Admin submits a publish (or unpublish) for DPO approval — never publishes
 * directly. For a publish, Rule 3 is enforced server-side: an incomplete notice
 * cannot even be submitted, regardless of what the UI allowed.
 */
export async function submitNoticeForApprovalAction(
  noticeId: string,
  kind: "publish" | "unpublish",
  regions: string[],
  notify: boolean,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(`/consent/notices/${noticeId}`, () =>
    audited(
      {
        actor,
        action: kind === "publish" ? "notice.publish_requested" : "notice.unpublish_requested",
        targetType: "Notice",
        targetId: noticeId,
        payload: { kind, regions, notify },
      },
      async (tx: TxClient) => {
        const notice = await tx.notice.findUniqueOrThrow({ where: { id: noticeId } });
        if (kind === "publish") {
          if (!regions.length) {
            throw Object.assign(new Error("Select at least one region before submitting."), { name: "ValidationError" });
          }
          const manual: Rule3Manual = JSON.parse(notice.rule3ManualJson || "{}");
          const rule3 = evaluateRule3(notice.content, manual);
          if (!rule3.complete) {
            throw Object.assign(
              new Error(`Rule 3 is incomplete — ${rule3.satisfied}/5 requirements met. Finish the checklist first.`),
              { name: "ComplianceError" },
            );
          }
        }
        return tx.notice.update({
          where: { id: noticeId },
          data: {
            approvalState: kind === "publish" ? "pending_publish" : "pending_unpublish",
            pendingRegionsJson: kind === "publish" ? encodeList(regions) : encodeList([]),
            pendingNotify: kind === "publish" ? notify : false,
            submittedBy: actor.label,
            submittedAt: new Date(),
          },
        });
      },
    ),
  );
}

/** DPO approves the pending request, applying it. Admin role is refused. */
export async function approveNoticeAction(noticeId: string): Promise<ActionResult> {
  const { actor, role } = await getSession();
  if (role !== "dpo") {
    return { ok: false, error: "Only the DPO can approve a notice transition.", errorKind: "ForbiddenError" };
  }
  return run(`/consent/notices/${noticeId}`, () =>
    audited(
      {
        actor,
        action: "notice.approved",
        targetType: "Notice",
        targetId: noticeId,
        payload: {},
      },
      async (tx: TxClient) => {
        const notice = await tx.notice.findUniqueOrThrow({ where: { id: noticeId } });
        if (notice.approvalState === "pending_publish") {
          const regions = decodeList(notice.pendingRegionsJson ?? "[]");
          return tx.notice.update({
            where: { id: noticeId },
            data: {
              status: "published",
              regionsJson: encodeList(regions),
              notifyOnChange: notice.pendingNotify,
              approvalState: "none",
              pendingRegionsJson: null,
              submittedBy: null,
              submittedAt: null,
            },
          });
        }
        if (notice.approvalState === "pending_unpublish") {
          return tx.notice.update({
            where: { id: noticeId },
            data: {
              status: "draft",
              regionsJson: encodeList([]),
              approvalState: "none",
              pendingRegionsJson: null,
              submittedBy: null,
              submittedAt: null,
            },
          });
        }
        throw Object.assign(new Error("Nothing is pending approval on this notice."), { name: "StateError" });
      },
    ),
  );
}

/** DPO rejects the pending request, returning the notice to its prior state. */
export async function rejectNoticeApprovalAction(noticeId: string, note: string): Promise<ActionResult> {
  const { actor, role } = await getSession();
  if (role !== "dpo") {
    return { ok: false, error: "Only the DPO can reject a notice transition.", errorKind: "ForbiddenError" };
  }
  return run(`/consent/notices/${noticeId}`, () =>
    audited(
      {
        actor,
        action: "notice.approval_rejected",
        targetType: "Notice",
        targetId: noticeId,
        payload: { note },
      },
      (tx: TxClient) =>
        tx.notice.update({
          where: { id: noticeId },
          data: { approvalState: "none", pendingRegionsJson: null, submittedBy: null, submittedAt: null },
        }),
    ),
  );
}

/** Retire a live notice, recording what supersedes it. Terminal state. */
export async function retireNoticeAction(noticeId: string, supersededById: string | null): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(`/consent/notices/${noticeId}`, () =>
    audited(
      {
        actor,
        action: "notice.retired",
        targetType: "Notice",
        targetId: noticeId,
        payload: { supersededById },
      },
      (tx: TxClient) =>
        tx.notice.update({
          where: { id: noticeId },
          data: {
            status: "retired",
            retiredAt: new Date(),
            supersededById: supersededById || null,
            approvalState: "none",
          },
        }),
    ),
  );
}

/** Bring a retired notice back to draft so it can be reworked. */
export async function restoreRetiredNoticeAction(noticeId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(`/consent/notices/${noticeId}`, () =>
    audited(
      {
        actor,
        action: "notice.restored",
        targetType: "Notice",
        targetId: noticeId,
        payload: {},
      },
      (tx: TxClient) =>
        tx.notice.update({
          where: { id: noticeId },
          data: { status: "draft", retiredAt: null, supersededById: null },
        }),
    ),
  );
}

/** Duplicate a notice as a fresh draft — content copied, lifecycle reset. */
export async function duplicateNoticeAction(sourceId: string, newName?: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/consent/notices", () =>
    audited(
      {
        actor,
        action: "notice.duplicated",
        targetType: "Notice",
        targetId: sourceId,
        payload: { newName },
      },
      async (tx: TxClient) => {
        const src = await tx.notice.findUniqueOrThrow({ where: { id: sourceId } });
        return tx.notice.create({
          data: {
            name: newName?.trim() || `${src.name} (copy)`,
            status: "draft",
            content: src.content,
            currentVersion: "v0.1",
            origin: "scratch",
            fiduciaryId: src.fiduciaryId,
            dataCategory: src.dataCategory,
            purposeTagId: src.purposeTagId,
            rule3ManualJson: src.rule3ManualJson,
          },
        });
      },
    ),
  );
}

/**
 * Type-to-confirm delete. The caller must echo the exact title — a Notice tied
 * to live consent flows is not a single-click delete.
 */
export async function deleteNoticeAction(noticeId: string, confirmTitle: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/consent/notices", () =>
    audited(
      {
        actor,
        action: "notice.deleted",
        targetType: "Notice",
        targetId: noticeId,
        payload: {},
      },
      async (tx: TxClient) => {
        const notice = await tx.notice.findUniqueOrThrow({ where: { id: noticeId } });
        if (confirmTitle.trim() !== notice.name) {
          throw Object.assign(new Error("The title you typed doesn't match. Delete cancelled."), { name: "ValidationError" });
        }
        // Clear anything pointing at this notice before removing it.
        await tx.notice.updateMany({ where: { supersededById: noticeId }, data: { supersededById: null } });
        await tx.noticeVariant.deleteMany({ where: { noticeId } });
        await tx.noticeRevision.deleteMany({ where: { noticeId } });
        return tx.notice.delete({ where: { id: noticeId } });
      },
    ),
  );
}

/** Bulk: add a region to several published notices' pending payload at once. */
export async function addRegionToNoticesAction(noticeIds: string[], region: string): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!noticeIds.length || !region) {
    return { ok: false, error: "Pick at least one notice and a region.", errorKind: "ValidationError" };
  }
  return run("/consent/notices", async () => {
    for (const id of noticeIds) {
      await audited(
        { actor, action: "notice.region_added_bulk", targetType: "Notice", targetId: id, payload: { region } },
        async (tx: TxClient) => {
          const n = await tx.notice.findUniqueOrThrow({ where: { id } });
          const regions = new Set(decodeList(n.regionsJson));
          // Adding a specific state is exclusive with the all-India umbrella.
          if (region === "IN") { regions.clear(); regions.add("IN"); }
          else { regions.delete("IN"); regions.add(region); }
          return tx.notice.update({ where: { id }, data: { regionsJson: encodeList([...regions]) } });
        },
      );
    }
  });
}

/**
 * Bulk: submit several notices for publish approval. Each stays individually
 * DPO-gated — this requests approval for the batch, it does not bypass it, and
 * a notice failing Rule 3 is skipped rather than force-published.
 */
export async function bulkSubmitPublishAction(
  noticeIds: string[],
): Promise<{ ok: boolean; submitted: string[]; skipped: { id: string; reason: string }[] }> {
  const { actor } = await getSession();
  const submitted: string[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const id of noticeIds) {
    try {
      const notice = await db.notice.findUniqueOrThrow({ where: { id } });
      const regions = decodeList(notice.regionsJson);
      if (!regions.length) { skipped.push({ id, reason: "No regions set" }); continue; }
      const manual: Rule3Manual = JSON.parse(notice.rule3ManualJson || "{}");
      if (!evaluateRule3(notice.content, manual).complete) { skipped.push({ id, reason: "Rule 3 incomplete" }); continue; }
      await audited(
        { actor, action: "notice.publish_requested", targetType: "Notice", targetId: id, payload: { bulk: true, regions } },
        (tx: TxClient) =>
          tx.notice.update({
            where: { id },
            data: {
              approvalState: "pending_publish",
              pendingRegionsJson: encodeList(regions),
              pendingNotify: notice.notifyOnChange,
              submittedBy: actor.label,
              submittedAt: new Date(),
            },
          }),
      );
      submitted.push(id);
    } catch (e) {
      skipped.push({ id, reason: (e as Error).message });
    }
  }
  revalidatePath("/consent/notices", "layout");
  return { ok: skipped.length === 0, submitted, skipped };
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
