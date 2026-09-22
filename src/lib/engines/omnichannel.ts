import { db } from "@/lib/db";
import { audited, type AuditActor } from "@/lib/engines/audit";
import { hoursToMs, DPRR_FULFILMENT_PERIOD } from "@/lib/dpdp/statute";
import { idMethodRequirement, initialDeliveryStatus } from "@/lib/omnichannel";
import type { TxClient } from "@/lib/tx";

/**
 * SCENARIO 7 ENGINE — assisted / omnichannel intake, in-person identity
 * verification, branch & offline consent capture, unification, and multi-channel
 * notification delivery.
 *
 * It EXTENDS the existing tables (DPRRTicket / ConsentRecord / Notification) via
 * their new fields; it never creates a parallel ticket or consent store. The
 * OfflineConsentQueue is a staging queue whose rows become ConsentRecord rows on
 * sync — the consent of record always lives in ConsentRecord.
 */

function err(name: string, message: string) {
  return Object.assign(new Error(message), { name });
}

// A tiny deterministic hash for the demo artifact fingerprint (same style the
// existing consent actions use — not security-critical here).
function fingerprint(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return `sha256:${Math.abs(h).toString(16)}…`;
}

// ---- Screen 2: in-person identity verification ----------------------------

/** Record a documented identity verification. "Verified" is only reachable via a
 *  specific method path with its mandatory field present — never a bare flag. */
export async function recordIdentityVerification(
  input: { method: string; documentType?: string; attestingEmployeeId?: string },
  actor: AuditActor,
) {
  const method = input.method;
  if (!["otp", "in_person_document", "assisted_attestation"].includes(method)) {
    throw err("ValidationError", "Choose a verification method.");
  }
  const need = idMethodRequirement(method);
  if (need === "document_type" && !input.documentType?.trim()) {
    throw err("ValidationError", "An in-person document check requires the document type.");
  }
  if (need === "attesting_employee_id" && !input.attestingEmployeeId?.trim()) {
    throw err("ValidationError", "An attestation requires the attesting employee's ID.");
  }
  return audited(
    { actor, action: "identity.verified", targetType: "IdentityVerification", targetId: method, eventDescription: `Recorded ${method} identity verification`, payload: { method } },
    (tx: TxClient) =>
      tx.identityVerification.create({
        data: {
          method,
          documentType: need === "document_type" ? input.documentType!.trim() : null,
          attestingEmployeeId: need === "attesting_employee_id" ? input.attestingEmployeeId!.trim() : null,
          createdBy: actor.label,
        },
      }),
  );
}

// ---- Screen 1: assisted request intake (hard-gated on verification) --------

function makeReference(): string {
  return `AR-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/** Create an assisted DPRR request. HARD GATE: a completed, unconsumed
 *  IdentityVerification must be supplied — no assisted request exists without
 *  documented verification. Produces a standard DataPrincipalRequest + DPRRTicket
 *  (with channelOrigin + preferredNotificationChannel) that flows into the
 *  existing Central Queue unmodified, then fires the acknowledgment. */
export async function createAssistedRequest(
  input: {
    verificationId: string;
    type: string; // access | correction | erasure | nomination
    rawIdentifier: string;
    rawIdentifierKind: string;
    channelOrigin: string; // assisted_branch | assisted_phone
    preferredNotificationChannel: string;
  },
  actor: AuditActor,
) {
  if (!input.rawIdentifier.trim()) throw err("ValidationError", "Enter the data principal's identifier.");
  if (!["access", "correction", "erasure", "nomination"].includes(input.type)) throw err("ValidationError", "Choose a request type.");
  if (!["assisted_branch", "assisted_phone"].includes(input.channelOrigin)) throw err("ValidationError", "Assisted intake must be a branch or phone channel.");

  // HARD GATE — server-side, not a UI reminder.
  const verification = await db.identityVerification.findUnique({ where: { id: input.verificationId } });
  if (!verification) throw err("VerificationRequiredError", "This assisted request cannot be created without a completed identity verification.");
  if (verification.consumed || verification.requestId) throw err("VerificationRequiredError", "That identity verification has already been used for another request. Verify identity again.");

  const now = new Date();
  const slaDeadline = new Date(now.getTime() + hoursToMs(DPRR_FULFILMENT_PERIOD.hours));
  const preNoticeDueAt = input.type === "erasure" ? new Date(slaDeadline.getTime() - hoursToMs(48)) : null;
  const deliveryStatus = initialDeliveryStatus(input.preferredNotificationChannel);

  return audited(
    { actor, action: "dprr.assisted_created", targetType: "DataPrincipalRequest", targetId: input.rawIdentifier.trim(), eventDescription: `Created assisted ${input.type} request via ${input.channelOrigin}`, payload: { channelOrigin: input.channelOrigin, preferredNotificationChannel: input.preferredNotificationChannel } },
    async (tx: TxClient) => {
      const request = await tx.dataPrincipalRequest.create({
        data: {
          referenceCode: makeReference(),
          type: input.type,
          status: "received",
          rawIdentifier: input.rawIdentifier.trim(),
          rawIdentifierKind: input.rawIdentifierKind || "other",
          receivedAt: now,
          slaDeadline,
          preNoticeDueAt,
          escalationSource: "branch",
        },
      });
      await tx.dPRRTicket.create({
        data: {
          requestId: request.id,
          originalDeadline: slaDeadline,
          currentDeadline: slaDeadline,
          routingState: "unassigned",
          channelOrigin: input.channelOrigin,
          preferredNotificationChannel: input.preferredNotificationChannel,
        },
      });
      // Consume the verification and link it to the request it unblocked.
      await tx.identityVerification.update({ where: { id: verification.id }, data: { requestId: request.id, consumed: true } });

      // Auto-acknowledgment, dispatched on the preferred channel. branch_handoff
      // is flagged for manual delivery, never auto-delivered.
      await tx.notification.create({
        data: {
          targetRole: "admin",
          triggerEvent: "dprr.request_acknowledged",
          category: "general_activity",
          title: `Request ${request.referenceCode} acknowledged`,
          body: `Acknowledgment for the ${input.type} request raised via ${input.channelOrigin}.`,
          requestId: request.id,
          linkedHref: `/requests/sla/${request.id}`,
          deliveryChannel: input.preferredNotificationChannel,
          deliveryStatus,
          deliveryDetail: input.preferredNotificationChannel === "branch_handoff"
            ? "Flagged for manual in-person delivery at the originating branch."
            : `Dispatched via ${input.preferredNotificationChannel}.`,
          deliveredAt: deliveryStatus === "delivered" ? new Date() : null,
        },
      });
      return request;
    },
  );
}

// ---- Screen 3: connected branch / BC-point consent capture -----------------

/** Immediate write to ConsentRecord — this path has connectivity, so
 *  collectedAt = now and there is no queuing and no syncTimestamp. */
export async function captureBranchConsentConnected(
  input: { subjectRef: string; purposeTagId: string | null; captureChannel: string; idVerification: string; templateId?: string | null },
  actor: AuditActor,
) {
  if (!input.subjectRef.trim()) throw err("ValidationError", "A subject reference is required.");
  if (!input.idVerification.trim()) throw err("ValidationError", "In-person ID verification is required.");
  if (!["assisted_branch", "assisted_bc_point"].includes(input.captureChannel)) throw err("ValidationError", "Choose a capture channel.");
  const now = new Date();
  return audited(
    { actor, action: "consent.branch_captured", targetType: "ConsentRecord", targetId: input.subjectRef.trim(), eventDescription: `Captured ${input.captureChannel} consent (connected)`, payload: { captureChannel: input.captureChannel } },
    (tx: TxClient) =>
      tx.consentRecord.create({
        data: {
          subjectRef: input.subjectRef.trim(),
          purposeTagId: input.purposeTagId,
          channelOrigin: "branch",
          captureChannel: input.captureChannel,
          status: "granted",
          idVerification: input.idVerification.trim(),
          collectedAt: now, // capture time — connected path, no separate sync time
          syncStatus: "synced",
          syncTimestamp: null,
          artifactHash: fingerprint(input.subjectRef + now.toISOString()),
        },
      }),
  );
}

// ---- Screen 4: offline capture + local queue + sync ------------------------

/** Local (offline) capture. Writes to the device queue with capturedAt LOCKED at
 *  the moment of capture. It does NOT create a ConsentRecord yet. */
export async function queueOfflineConsent(
  input: { consentDraftId: string; deviceId: string; subjectRef: string; purposeTagId: string | null; captureChannel: string; idVerification: string; capturedAt: Date },
  actor: AuditActor,
) {
  if (!input.subjectRef.trim()) throw err("ValidationError", "A subject reference is required.");
  return audited(
    { actor, action: "consent.offline_queued", targetType: "OfflineConsentQueue", targetId: input.consentDraftId, eventDescription: "Queued an offline consent capture", payload: { deviceId: input.deviceId, capturedAt: input.capturedAt.toISOString() } },
    (tx: TxClient) =>
      tx.offlineConsentQueue.create({
        data: {
          consentDraftId: input.consentDraftId,
          deviceId: input.deviceId,
          subjectRef: input.subjectRef.trim(),
          purposeTagId: input.purposeTagId,
          captureChannel: input.captureChannel,
          idVerification: input.idVerification.trim() || null,
          capturedAt: input.capturedAt, // LOCKED — becomes ConsentRecord.collectedAt on sync
          syncStatus: "queued",
        },
      }),
  );
}

/** Promote one queued/failed item to a real ConsentRecord. capture time is the
 *  item's ORIGINAL capturedAt; the upload time goes into syncTimestamp. The two
 *  are never conflated. */
async function promoteQueueItem(tx: TxClient, itemId: string): Promise<string> {
  const item = await tx.offlineConsentQueue.findUniqueOrThrow({ where: { id: itemId } });
  const uploadedAt = new Date();
  const record = await tx.consentRecord.create({
    data: {
      subjectRef: item.subjectRef,
      purposeTagId: item.purposeTagId,
      channelOrigin: "branch",
      captureChannel: item.captureChannel,
      status: "granted",
      idVerification: item.idVerification,
      collectedAt: item.capturedAt, // ← the original OFFLINE capture time, verbatim
      syncStatus: "synced",
      syncTimestamp: uploadedAt, // ← the actual upload time, kept DISTINCT
      artifactHash: fingerprint(item.subjectRef + item.capturedAt.toISOString()),
    },
  });
  await tx.offlineConsentQueue.update({ where: { id: item.id }, data: { syncStatus: "synced", syncedConsentId: record.id, lastError: null } });
  return record.id;
}

/** Sync all pending (queued + previously failed) items for a device. When
 *  simulateFailure is set, the first still-queued item fails this run — it
 *  increments retryCount and stays visibly Failed with a retry path; it is never
 *  dropped. */
export async function syncOfflineQueue(deviceId: string, actor: AuditActor, simulateFailure = false) {
  const items = await db.offlineConsentQueue.findMany({ where: { deviceId, syncStatus: { in: ["queued", "failed"] } }, orderBy: { createdAt: "asc" } });
  let synced = 0;
  let failed = 0;
  let failApplied = false;
  await audited(
    { actor, action: "consent.offline_synced", targetType: "OfflineConsentQueue", targetId: deviceId, eventDescription: `Synced offline queue for ${deviceId}`, payload: { count: items.length, simulateFailure } },
    async (tx: TxClient) => {
      for (const item of items) {
        if (simulateFailure && !failApplied && item.syncStatus === "queued") {
          failApplied = true;
          failed++;
          await tx.offlineConsentQueue.update({ where: { id: item.id }, data: { syncStatus: "failed", retryCount: { increment: 1 }, lastError: "Connectivity dropped mid-upload — item kept in the queue for retry." } });
          continue;
        }
        await promoteQueueItem(tx, item.id);
        synced++;
      }
    },
  );
  return { synced, failed };
}

/** Retry a single failed item. On success it becomes a ConsentRecord with the
 *  original capture time preserved. */
export async function retryOfflineItem(itemId: string, actor: AuditActor) {
  const item = await db.offlineConsentQueue.findUniqueOrThrow({ where: { id: itemId } });
  if (item.syncStatus === "synced") throw err("StateError", "That item is already synced.");
  return audited(
    { actor, action: "consent.offline_retried", targetType: "OfflineConsentQueue", targetId: itemId, eventDescription: "Retried a failed offline sync", payload: {} },
    (tx: TxClient) => promoteQueueItem(tx, itemId),
  );
}

// ---- Screen 5: omnichannel unification monitor -----------------------------

/** Run an ACTIVE unification check comparing tickets and consent across every
 *  channel. It surfaces a real discrepancy when offline items failed to land, or
 *  a demo one when injectDiscrepancy is set — never a static "all good". */
export async function runUnificationCheck(actor: AuditActor, injectDiscrepancy = false) {
  const [tickets, consents, queue] = await Promise.all([
    db.dPRRTicket.findMany({ select: { channelOrigin: true } }),
    db.consentRecord.findMany({ select: { captureChannel: true, channelOrigin: true, syncStatus: true } }),
    db.offlineConsentQueue.findMany({ select: { id: true, subjectRef: true, syncStatus: true } }),
  ]);

  const ticketByChannel: Record<string, number> = {};
  for (const t of tickets) ticketByChannel[t.channelOrigin] = (ticketByChannel[t.channelOrigin] ?? 0) + 1;
  const consentByChannel: Record<string, number> = {};
  for (const c of consents) { const k = c.captureChannel ?? c.channelOrigin; consentByChannel[k] = (consentByChannel[k] ?? 0) + 1; }

  const failedItems = queue.filter((q) => q.syncStatus === "failed");
  const pendingItems = queue.filter((q) => q.syncStatus === "queued" || q.syncStatus === "syncing");

  let discrepancyFound = false;
  let discrepancyDetail: string | null = null;

  if (failedItems.length > 0) {
    discrepancyFound = true;
    discrepancyDetail = `Offline queue: ${failedItems.length} record(s) failed to sync and are NOT present as ConsentArtifacts — ${failedItems.map((q) => q.subjectRef).join(", ")}. These captures exist on-device but never landed centrally.`;
  } else if (injectDiscrepancy) {
    discrepancyFound = true;
    discrepancyDetail = "Branch channel: 2 assisted_branch consent captures have a DPRRTicket routed but no matching ConsentArtifact in the shared table (subjectRef CUST-4471, CUST-4472). The branch capture wrote to a stale local template and did not unify.";
  }

  const summary = {
    tickets: ticketByChannel,
    consent: consentByChannel,
    offlineQueue: { queued: pendingItems.length, failed: failedItems.length, total: queue.length },
    injected: injectDiscrepancy,
  };

  return audited(
    { actor, action: "omnichannel.unification_checked", targetType: "UnificationCheck", targetId: new Date().toISOString(), eventDescription: discrepancyFound ? "Unification check found a discrepancy" : "Unification check — all channels unified", payload: { discrepancyFound } },
    (tx: TxClient) =>
      tx.unificationCheck.create({
        data: { discrepancyFound, discrepancyDetail, summaryJson: JSON.stringify(summary), runBy: actor.label },
      }),
  );
}

// ---- Screen 6: multi-channel notification delivery -------------------------

/** Retry delivery of a failed notification. */
export async function retryNotificationDelivery(notificationId: string, actor: AuditActor) {
  const n = await db.notification.findUnique({ where: { id: notificationId } });
  if (!n) throw err("StateError", "Notification not found.");
  if (n.deliveryStatus !== "failed") throw err("StateError", "Only a failed delivery can be retried.");
  const status = initialDeliveryStatus(n.deliveryChannel ?? "email");
  return audited(
    { actor, action: "notification.delivery_retried", targetType: "Notification", targetId: notificationId, eventDescription: "Retried a failed notification delivery", payload: { channel: n.deliveryChannel } },
    (tx: TxClient) =>
      tx.notification.update({
        where: { id: notificationId },
        data: { deliveryStatus: status, deliveredAt: status === "delivered" ? new Date() : null, deliveryRetries: { increment: 1 }, deliveryDetail: `Retry succeeded via ${n.deliveryChannel}.` },
      }),
  );
}
