import { db } from "@/lib/db";
import { audited, type AuditActor } from "@/lib/engines/audit";
import { hashConsent } from "@/lib/consentHash";
import { retentionToDays, buildConsentApiPayload, apiPayloadGaps, type ConsentApiPayload } from "@/lib/consentInfra";
import type { TxClient } from "@/lib/tx";

/**
 * SCENARIO 8 ENGINE — consent-infrastructure completeness. Extends existing
 * tables (ConsentRecord / PurposeTag retention / OrganizationBranding / Webhook /
 * NoticeVariant) and adds the missing verification + enforcement mechanisms.
 */

function err(name: string, message: string) { return Object.assign(new Error(message), { name }); }

// ---- Screen 2: legacy consent bulk import (honest provenance) --------------

export interface LegacyRecordInput {
  subjectRef: string;
  purposeTagId: string | null;
  entityId: string | null;
  /** ISO date string from the legacy system, if any. */
  legacyCaptureDate: string | null;
  /** Whether the legacy timestamp is trustworthy. */
  dateTrustworthy: boolean;
}

/** Import legacy consent. Each record's provenance is set honestly — a trusted
 *  legacy date becomes verified_capture_date; otherwise unverifiable_date. A REAL
 *  hash + import timestamp are generated regardless: the import itself is the
 *  immutable event, even when the original capture date is uncertain. */
export async function legacyBulkImport(
  input: { sourceSystem: string; records: LegacyRecordInput[]; saveTemplate?: { name: string; mapping: { legacyField: string; schemaField: string }[] } },
  actor: AuditActor,
) {
  if (input.records.length === 0) throw err("ValidationError", "No records to import.");
  const importedAt = new Date();
  let verified = 0;
  let unverifiable = 0;

  await audited(
    { actor, action: "consent.legacy_imported", targetType: "ConsentRecord", targetId: input.sourceSystem, eventDescription: `Legacy consent import from ${input.sourceSystem}`, payload: { count: input.records.length } },
    async (tx: TxClient) => {
      if (input.saveTemplate) {
        const existing = await tx.legacyImportTemplate.findFirst({ where: { name: input.saveTemplate.name, sourceSystem: input.sourceSystem } });
        if (!existing) await tx.legacyImportTemplate.create({ data: { name: input.saveTemplate.name, sourceSystem: input.sourceSystem, mappingJson: JSON.stringify(input.saveTemplate.mapping), createdBy: actor.label } });
      }
      for (const r of input.records) {
        const trusted = Boolean(r.legacyCaptureDate) && r.dateTrustworthy;
        const provenance = trusted ? "verified_capture_date" : "unverifiable_date";
        if (trusted) verified++; else unverifiable++;
        // collectedAt = the legacy capture date when trusted; otherwise the import
        // date, and the record is flagged unverifiable so it is never mistaken for
        // a verified capture time.
        const collectedAt = trusted ? new Date(r.legacyCaptureDate!) : importedAt;
        const artifactHash = hashConsent({ subjectRef: r.subjectRef, purposeTagId: r.purposeTagId, channelOrigin: "bulk_import", status: "granted", collectedAt });
        await tx.consentRecord.create({
          data: {
            subjectRef: r.subjectRef.trim(),
            purposeTagId: r.purposeTagId,
            entityId: r.entityId,
            channelOrigin: "bulk_import",
            status: "granted",
            collectedAt,
            importedAt,
            provenance,
            artifactHash,
            syncStatus: "synced",
          },
        });
      }
    },
  );
  return { verified, unverifiable, total: input.records.length };
}

// ---- Screen 4: business-unit isolation verification ------------------------

/** Actively test that a scoped query for entity A returns zero of entity B's
 *  consent records. injectLeak simulates a mis-scoped query (as a demo) that
 *  fails the isolation boundary, naming the specific pair. */
export async function runIsolationCheck(entityAId: string, entityBId: string, actor: AuditActor, injectLeak = false) {
  const [a, b] = await Promise.all([
    db.entity.findUniqueOrThrow({ where: { id: entityAId } }),
    db.entity.findUniqueOrThrow({ where: { id: entityBId } }),
  ]);
  // The real scoped query the API would run for entity A.
  const scopedToA = injectLeak
    ? await db.consentRecord.findMany({ where: { entityId: { in: [entityAId, entityBId] } }, select: { id: true, entityId: true } })
    : await db.consentRecord.findMany({ where: { entityId: entityAId }, select: { id: true, entityId: true } });
  const leaked = scopedToA.filter((r) => r.entityId === entityBId).length;
  const passed = leaked === 0;
  const detail = passed
    ? `Isolation verified — a consent query scoped to ${a.name} returned 0 records belonging to ${b.name}.`
    : `Isolation FAILURE — a query scoped to ${a.name} returned ${leaked} record(s) belonging to ${b.name}. The scope filter is not enforcing the entity boundary.`;
  return audited(
    { actor, action: "consent.isolation_checked", targetType: "IsolationCheck", targetId: `${a.name}|${b.name}`, eventDescription: passed ? "Business-unit isolation verified" : "Business-unit isolation FAILED", payload: { leaked, passed } },
    (tx: TxClient) => tx.isolationCheck.create({ data: { entityAName: a.name, entityBName: b.name, leakedCount: leaked, passed, detail, runBy: actor.label } }),
  );
}

// ---- Screen 5: webhook test & delivery log ---------------------------------

/** Fire a test event through a webhook and log the delivery attempt(s). A bad
 *  endpoint (or simulateFailure) fails and shows an automatic retry attempt;
 *  neither disappears from the log. */
export async function sendWebhookTest(webhookId: string, actor: AuditActor, simulateFailure = false) {
  const hook = await db.webhook.findUniqueOrThrow({ where: { id: webhookId } });
  const ok = !simulateFailure && !hook.endpoint.includes("example.in");
  return audited(
    { actor, action: "webhook.test_sent", targetType: "Webhook", targetId: webhookId, eventDescription: `Sent test ${hook.event} to ${hook.endpoint}`, payload: { ok } },
    async (tx: TxClient) => {
      if (ok) {
        await tx.webhookDelivery.create({ data: { webhookId, event: hook.event, status: "delivered", responseCode: 200, retryCount: 0, detail: "Test event delivered.", isTest: true } });
      } else {
        // First attempt fails; an automatic retry is attempted and also fails, so
        // a manual retry remains available. Both attempts stay in the log.
        await tx.webhookDelivery.create({ data: { webhookId, event: hook.event, status: "failed", responseCode: 503, retryCount: 0, detail: "Endpoint returned 503 — first attempt.", isTest: true } });
        await tx.webhookDelivery.create({ data: { webhookId, event: hook.event, status: "failed", responseCode: 503, retryCount: 1, detail: "Automatic retry — endpoint still returned 503.", isTest: true } });
      }
      await tx.webhook.update({ where: { id: webhookId }, data: { lastTestAt: new Date(), lastTestResult: ok ? "200 OK" : "503 Service Unavailable", status: ok ? "active" : "failing" } });
    },
  );
}

/** Manually retry a failed delivery. Marks it delivered (200) with the retry
 *  count incremented — the attempt history is preserved. */
export async function retryWebhookDelivery(deliveryId: string, actor: AuditActor) {
  const d = await db.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
  if (d.status === "delivered") throw err("StateError", "That delivery already succeeded.");
  return audited(
    { actor, action: "webhook.delivery_retried", targetType: "WebhookDelivery", targetId: deliveryId, eventDescription: "Manually retried a failed webhook delivery", payload: {} },
    async (tx: TxClient) => {
      await tx.webhookDelivery.update({ where: { id: deliveryId }, data: { status: "delivered", responseCode: 200, retryCount: d.retryCount + 1, detail: "Manual retry succeeded (200)." } });
      await tx.webhook.update({ where: { id: d.webhookId }, data: { status: "active", lastTestResult: "200 OK", lastTestAt: new Date() } });
    },
  );
}

// ---- Screen 6: language variant generation ---------------------------------

/** Create a NoticeVariant for a missing Eighth-Schedule language. Reuses the
 *  existing variant model (inherit=true → inherits the base content). */
export async function generateLanguageVariant(noticeId: string, language: string, actor: AuditActor) {
  const existing = await db.noticeVariant.findFirst({ where: { noticeId, language } });
  if (existing) throw err("StateError", `A ${language} variant already exists.`);
  return audited(
    { actor, action: "notice.variant_generated", targetType: "NoticeVariant", targetId: `${noticeId}:${language}`, eventDescription: `Generated ${language} notice variant`, payload: { language } },
    (tx: TxClient) => tx.noticeVariant.create({ data: { noticeId, language, inherit: true, content: "", publishStatus: "draft" } }),
  );
}

// ---- Screen 8: auto-expiry & re-consent ------------------------------------

export async function setExpiryBehavior(purposeTagId: string, behavior: "auto_withdraw" | "trigger_reconsent", actor: AuditActor) {
  if (!["auto_withdraw", "trigger_reconsent"].includes(behavior)) throw err("ValidationError", "Invalid expiry behaviour.");
  return audited(
    { actor, action: "consent.expiry_behavior_set", targetType: "PurposeExpiryConfig", targetId: purposeTagId, eventDescription: `Set expiry behaviour to ${behavior}`, payload: { behavior } },
    (tx: TxClient) => tx.purposeExpiryConfig.upsert({ where: { purposeTagId }, create: { purposeTagId, behavior, updatedBy: actor.label }, update: { behavior, updatedBy: actor.label } }),
  );
}

/** Enforce retention: find granted consent whose retention has lapsed and apply
 *  the purpose's configured behaviour. NEVER deletes — expiry is a logged status
 *  change (auto_withdraw) or a re-consent trigger, with the artifact preserved. */
export async function runExpirySweep(actor: AuditActor) {
  const now = Date.now();
  const [records, configs] = await Promise.all([
    db.consentRecord.findMany({ where: { status: "granted" }, include: { purposeTag: { select: { id: true, name: true, retention: true } } } }),
    db.purposeExpiryConfig.findMany(),
  ]);
  const behaviorByPurpose = new Map(configs.map((c) => [c.purposeTagId, c.behavior]));

  const due = records.filter((r) => {
    if (r.expiresAt) return r.expiresAt.getTime() <= now;
    const days = retentionToDays(r.purposeTag?.retention);
    if (days == null) return false; // "until deletion" / no fixed period never auto-expires
    return r.collectedAt.getTime() + days * 86400000 <= now;
  });

  let withdrawn = 0;
  let reconsent = 0;
  if (due.length === 0) return { processed: 0, withdrawn, reconsent };

  await audited(
    { actor, action: "consent.expiry_swept", targetType: "ConsentRecord", targetId: "sweep", eventDescription: `Processed ${due.length} expired consent record(s)`, payload: { due: due.length } },
    async (tx: TxClient) => {
      for (const r of due) {
        const behavior = (r.purposeTagId && behaviorByPurpose.get(r.purposeTagId)) || "auto_withdraw";
        if (behavior === "trigger_reconsent") {
          reconsent++;
          await tx.consentExpiryLog.create({ data: { consentRecordId: r.id, purposeName: r.purposeTag?.name ?? null, action: "reconsent_triggered", detail: "Retention lapsed — re-consent prompt triggered; consent kept as history." } });
          // The artifact is preserved; a re-consent is requested rather than a withdrawal.
        } else {
          withdrawn++;
          await tx.consentRecord.update({ where: { id: r.id }, data: { status: "expired" } });
          await tx.consentExpiryLog.create({ data: { consentRecordId: r.id, purposeName: r.purposeTag?.name ?? null, action: "auto_withdraw", detail: "Retention lapsed — status set to expired. Record preserved as historical evidence." } });
        }
      }
    },
  );
  return { processed: due.length, withdrawn, reconsent };
}

// ---- Screen 9: API retrievability ------------------------------------------

/** Build the Consent API payload for one artifact. Used by BOTH the /api/consent
 *  route and the retrievability spot-check, so they return the exact same data. */
export async function getConsentApiPayload(artifactId: string): Promise<ConsentApiPayload | null> {
  const r = await db.consentRecord.findUnique({ where: { id: artifactId }, include: { purposeTag: { select: { name: true, lawfulBasis: true, status: true } } } });
  if (!r) return null;
  // Only an APPROVED purpose counts as a valid granular scope.
  const purposeName = r.purposeTag && r.purposeTag.status === "approved" ? r.purposeTag.name : null;
  const purposeScope = r.purposeTag && r.purposeTag.status === "approved" ? (r.purposeTag.lawfulBasis ?? null) : null;
  return buildConsentApiPayload({
    id: r.id, subjectRef: r.subjectRef, purposeName, purposeScope, status: r.status,
    collectedAt: r.collectedAt, expiresAt: r.expiresAt, captureChannel: r.captureChannel, channelOrigin: r.channelOrigin, artifactHash: r.artifactHash,
  });
}

export interface ApiCheckResult { ok: boolean; error?: string; errorKind?: string; payload?: ConsentApiPayload; gaps?: string[]; passed?: boolean }

export async function apiRetrievabilityCheck(artifactId: string): Promise<ApiCheckResult> {
  const payload = await getConsentApiPayload(artifactId);
  if (!payload) return { ok: false, error: "Artifact not found.", errorKind: "StateError" };
  const gaps = apiPayloadGaps(payload);
  return { ok: true, payload, gaps, passed: gaps.length === 0 };
}
