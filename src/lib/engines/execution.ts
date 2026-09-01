import { db } from "@/lib/db";
import type { TxClient } from "@/lib/tx";
import { audited, type AuditActor } from "@/lib/engines/audit";
import { emit } from "@/lib/engines/notification";
import { computeCompletion } from "@/lib/engines/completion";
import { computePreNoticeDue, evaluatePreNotice } from "@/lib/engines/sla";
import {
  assertRetentionReviewed,
  excludedFieldsFor,
  getRetentionPosture,
} from "@/lib/guards/retentionGate";
import { assertMayRule } from "@/lib/guards/escalationGate";
import { executeAgainst, NoApiError } from "@/lib/connectors/simulated";
import { decodeList, encodeList, encodeObject } from "@/lib/codec/json";
import { COMPLETION_STATE_LABEL, type EscalationRuling } from "@/lib/domain";
import { ERASURE_PRE_NOTICE, PROCESSOR_RESPONSIBILITY } from "@/lib/dpdp/statute";

/**
 * EXECUTION ENGINE
 *
 * Every mutation Scenario 1 can perform lives here. Screens and server actions
 * call these functions; nothing outside this module and the seed writes to the
 * operational tables. That is what keeps the acceptance criteria from eroding:
 * the retention gate, the audit entry and the cross-persona notification are
 * properties of the operation, not of the screen that happened to call it.
 */

export class PreNoticeError extends Error {
  constructor(hoursRemaining: number) {
    super(
      `Erasure is not yet permitted: the ${ERASURE_PRE_NOTICE.hours}-hour notice to the ` +
        `Data Principal clears in ${Math.ceil(hoursRemaining)}h ` +
        `(${ERASURE_PRE_NOTICE.citation}).`,
    );
    this.name = "PreNoticeError";
  }
}

export class DpaScopeError extends Error {
  readonly outOfScope: string[];

  constructor(processorName: string, outOfScope: string[]) {
    super(
      `Cannot instruct ${processorName} on ${outOfScope.join(", ")}: ` +
        `${outOfScope.length === 1 ? "that category is" : "those categories are"} outside the ` +
        `scope of the Data Processing Agreement. The Data Fiduciary remains ` +
        `responsible for processing carried out on its behalf ` +
        `(${PROCESSOR_RESPONSIBILITY.citation}), so an instruction beyond the DPA ` +
        `cannot be dispatched. Have the DPO extend the DPA first.`,
    );
    this.name = "DpaScopeError";
    this.outOfScope = outOfScope;
  }
}

/**
 * A processor whose DPA is still draft cannot lawfully be instructed. DPDP
 * s.8(2) requires the contract before a Processor may process on the
 * Fiduciary's behalf, so this is a hard block at the point of dispatch — not a
 * warning on the registry screen. Enforcing it here is what makes Integrations'
 * Principle 2 real rather than communicated.
 */
export class DraftDpaError extends Error {
  constructor(processorName: string, dpaId: string) {
    super(
      `Cannot instruct ${processorName}: its DPA (${dpaId}) is still draft. ` +
        `DPDP s.8(2) permits a Processor to process personal data on the ` +
        `Fiduciary's behalf only under a valid contract, so no deletion or access ` +
        `instruction can be dispatched until the DPA is executed. Add the DPA ` +
        `reference and mark it active first.`,
    );
    this.name = "DraftDpaError";
  }
}

export class ChecklistIncompleteError extends Error {
  constructor(remaining: number) {
    super(
      `${remaining} checklist item${remaining === 1 ? "" : "s"} still unchecked. ` +
        `Manual verification is an attestation — it cannot be recorded until every ` +
        `step has actually been carried out.`,
    );
    this.name = "ChecklistIncompleteError";
  }
}

/**
 * Wrap an operation so that any resulting change in the request's completion
 * state notifies the roles waiting on it. Admin never performs a separate
 * "notify" step — the notification is a consequence of the state moving.
 */
async function withCompletionNotification<T>(
  requestId: string,
  requestRef: string,
  operation: () => Promise<T>,
): Promise<T> {
  const before = await computeCompletion(requestId);
  const result = await operation();
  const after = await computeCompletion(requestId);

  if (before.state !== after.state) {
    await emit(db, {
      kind: "completion.changed",
      requestId,
      requestRef,
      from: COMPLETION_STATE_LABEL[before.state],
      to: COMPLETION_STATE_LABEL[after.state],
    });
  }

  return result;
}

async function loadRequest(requestId: string) {
  return db.dataPrincipalRequest.findUniqueOrThrow({
    where: { id: requestId },
    select: {
      id: true,
      referenceCode: true,
      type: true,
      principalId: true,
      preNoticeSentAt: true,
      preNoticeDueAt: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Pre-erasure notice (DPDP Rules 2025, Rule 8)
// ---------------------------------------------------------------------------

export async function sendPreErasureNotice(requestId: string, actor: AuditActor) {
  const sentAt = new Date();
  const dueAt = computePreNoticeDue(sentAt);

  return audited(
    {
      actor,
      action: "erasure.pre_notice_sent",
      targetType: "DataPrincipalRequest",
      targetId: requestId,
      requestId,
      payload: {
        sentAt: sentAt.toISOString(),
        clearsAt: dueAt.toISOString(),
        basis: ERASURE_PRE_NOTICE.citation,
      },
    },
    (tx: TxClient) =>
      tx.dataPrincipalRequest.update({
        where: { id: requestId },
        data: { preNoticeSentAt: sentAt, preNoticeDueAt: dueAt },
      }),
  );
}

// ---------------------------------------------------------------------------
// Retention exceptions (criteria 4 and 5)
// ---------------------------------------------------------------------------

export async function acknowledgeException(
  exceptionId: string,
  actor: AuditActor,
) {
  const exception = await db.retentionException.findUniqueOrThrow({
    where: { id: exceptionId },
  });

  return audited(
    {
      actor,
      action: "retention.acknowledged",
      targetType: "RetentionException",
      targetId: exceptionId,
      requestId: exception.requestId,
      payload: {
        dataCategory: exception.dataCategory,
        statuteRef: exception.statuteRef,
        fieldPaths: decodeList(exception.fieldPathsJson),
        effect: "Fields withheld from deletion; the rest of the record proceeds.",
      },
    },
    (tx: TxClient) =>
      tx.retentionException.update({
        where: { id: exceptionId },
        data: {
          reviewStatus: "acknowledged",
          reviewedByActorId: actor.id ?? null,
          reviewedAt: new Date(),
        },
      }),
  );
}

/**
 * Admin cannot override a retention obligation. This is the only route towards
 * one: it raises an escalation carrying the full context and leaves the
 * exception awaiting a DPO ruling.
 */
export async function requestRetentionOverride(
  exceptionId: string,
  reason: string,
  actor: AuditActor,
) {
  const exception = await db.retentionException.findUniqueOrThrow({
    where: { id: exceptionId },
    include: { request: { select: { referenceCode: true, id: true } } },
  });

  const context = {
    exceptionId,
    dataCategory: exception.dataCategory,
    fieldPaths: decodeList(exception.fieldPathsJson),
    legalBasis: exception.legalBasis,
    statuteRef: exception.statuteRef,
    expiryCondition: exception.expiryCondition,
    expiresAt: exception.expiresAt?.toISOString() ?? null,
    requestRef: exception.request?.referenceCode ?? null,
    requestedBy: actor.label,
    adminReason: reason,
  };

  const escalation = await audited(
    {
      actor,
      action: "retention.override_requested",
      targetType: "RetentionException",
      targetId: exceptionId,
      requestId: exception.requestId,
      payload: context,
    },
    async (tx: TxClient) => {
      const created = await tx.escalation.create({
        data: {
          requestId: exception.requestId,
          retentionExceptionId: exceptionId,
          sourceRole: actor.role,
          targetRole: "dpo",
          reason,
          contextJson: encodeObject(context),
          status: "open",
        },
      });

      await tx.retentionException.update({
        where: { id: exceptionId },
        data: {
          reviewStatus: "override_requested",
          reviewedByActorId: actor.id ?? null,
          reviewedAt: new Date(),
        },
      });

      return created;
    },
  );

  await emit(db, {
    kind: "escalation.raised",
    requestId: exception.requestId,
    requestRef: exception.request?.referenceCode ?? "Retention conflict",
    reason,
    targetRole: "dpo",
  });

  return escalation;
}

/**
 * Record a DPO ruling. `assertMayRule` refuses an admin-role actor outright, so
 * there is no path — UI or otherwise — by which Admin resolves this alone.
 */
export async function recordRuling(
  escalationId: string,
  ruling: EscalationRuling,
  rationale: string,
  actor: AuditActor,
) {
  assertMayRule(actor.role);

  const escalation = await db.escalation.findUniqueOrThrow({
    where: { id: escalationId },
    include: { request: { select: { referenceCode: true } } },
  });

  const result = await audited(
    {
      actor,
      action: "escalation.ruled",
      targetType: "Escalation",
      targetId: escalationId,
      requestId: escalation.requestId,
      payload: { ruling, rationale, ruledBy: actor.label },
    },
    async (tx: TxClient) => {
      const updated = await tx.escalation.update({
        where: { id: escalationId },
        data: {
          status: "ruled",
          ruling,
          rulingRationale: rationale,
          ruledByActorId: actor.id ?? null,
          ruledAt: new Date(),
        },
      });

      if (escalation.retentionExceptionId) {
        await tx.retentionException.update({
          where: { id: escalation.retentionExceptionId },
          data: {
            reviewStatus: ruling === "approve_override" ? "overridden" : "upheld",
            reviewedByActorId: actor.id ?? null,
            reviewedAt: new Date(),
          },
        });
      }

      return updated;
    },
  );

  await emit(db, {
    kind: "escalation.ruled",
    requestId: escalation.requestId,
    requestRef: escalation.request?.referenceCode ?? "Escalation",
    ruling,
  });

  return result;
}

export async function raiseFailureEscalation(
  requestId: string,
  executionRecordId: string,
  reason: string,
  actor: AuditActor,
) {
  const record = await db.executionRecord.findUniqueOrThrow({
    where: { id: executionRecordId },
    include: { system: true, request: { select: { referenceCode: true } } },
  });

  const context = {
    executionRecordId,
    system: record.system?.name ?? null,
    failureCode: record.failureCode,
    failureDetail: record.failureDetail,
    failureRawResponse: record.failureRawResponse,
    attempts: record.attempt,
  };

  const escalation = await audited(
    {
      actor,
      action: "escalation.raised",
      targetType: "ExecutionRecord",
      targetId: executionRecordId,
      requestId,
      payload: context,
    },
    (tx: TxClient) =>
      tx.escalation.create({
        data: {
          requestId,
          sourceRole: actor.role,
          targetRole: "dpo",
          reason,
          contextJson: encodeObject(context),
          attachedEvidenceJson: encodeList([executionRecordId]),
          status: "open",
        },
      }),
  );

  await emit(db, {
    kind: "escalation.raised",
    requestId,
    requestRef: record.request.referenceCode,
    reason,
    targetRole: "dpo",
  });

  return escalation;
}

// ---------------------------------------------------------------------------
// Execution against connected systems
// ---------------------------------------------------------------------------

export async function dispatchSystemExecution(
  requestId: string,
  systemId: string,
  actor: AuditActor,
) {
  const request = await loadRequest(requestId);

  // Criterion 4: the gate runs before anything else, on the server. Reaching
  // this function by URL, replay or any other route still fails.
  const posture = await assertRetentionReviewed(request.principalId, requestId);

  if (request.type === "erasure") {
    const preNotice = evaluatePreNotice(
      request.preNoticeSentAt,
      request.preNoticeDueAt,
    );
    if (!preNotice.cleared) throw new PreNoticeError(preNotice.hoursRemaining);
  }

  const system = await db.connectedSystem.findUniqueOrThrow({
    where: { id: systemId },
  });

  const location = await db.dataLocation.findFirst({
    where: { principalId: request.principalId ?? "", systemId },
  });
  const categories = decodeList(location?.dataCategoriesJson);
  const excluded = excludedFieldsFor(posture, categories);

  const now = new Date();
  const scheduledFor =
    system.executionMode === "delayed" && system.delayDays
      ? new Date(now.getTime() + system.delayDays * 24 * 60 * 60 * 1000)
      : null;

  const outcome = executeAgainst(system, now); // throws NoApiError for manual systems

  // Repeat dispatch must not stack duplicate records: one target, one record.
  const existing = await db.executionRecord.findFirst({
    where: { requestId, systemId },
    select: { id: true },
  });

  return withCompletionNotification(requestId, request.referenceCode, async () => {
    const record = await audited(
      {
        actor,
        action: "execution.dispatched",
        targetType: "ConnectedSystem",
        targetId: systemId,
        requestId,
        payload: {
          system: system.name,
          mode: system.executionMode,
          dataCategories: categories,
          excludedFields: excluded,
          partialDeletion: excluded.length > 0,
          outcome: outcome.status,
          failureCode: outcome.failureCode,
          scheduledFor: scheduledFor?.toISOString() ?? null,
        },
      },
      (tx: TxClient) => {
        const payload = {
          mode: system.executionMode,
          status: outcome.status,
          excludedFieldsJson: encodeList(excluded),
          scheduledFor,
          dispatchedAt: now,
          confirmedAt: outcome.confirmedAt,
          confirmedByActorId: outcome.confirmedAt ? (actor.id ?? null) : null,
          verificationMethod: outcome.verificationMethod,
          failureCode: outcome.failureCode,
          failureDetail: outcome.failureDetail,
          failureRawResponse: outcome.failureRawResponse,
        };

        return existing
          ? tx.executionRecord.update({
              where: { id: existing.id },
              data: { ...payload, attempt: { increment: 1 } },
            })
          : tx.executionRecord.create({
              data: { requestId, systemId, ...payload },
            });
      },
    );

    if (outcome.status === "failed") {
      await emit(db, {
        kind: "execution.failed",
        requestId,
        requestRef: request.referenceCode,
        systemName: system.name,
        failureCode: outcome.failureCode ?? "unknown",
      });
    } else if (outcome.status === "verified") {
      await emit(db, {
        kind: "execution.verified",
        requestId,
        requestRef: request.referenceCode,
        systemName: system.name,
      });
    }

    return record;
  });
}

export async function retryExecution(
  executionRecordId: string,
  actor: AuditActor,
) {
  const record = await db.executionRecord.findUniqueOrThrow({
    where: { id: executionRecordId },
    include: { system: true, request: { select: { referenceCode: true, id: true } } },
  });

  if (!record.system) throw new Error("Only system executions can be retried here.");

  const outcome = executeAgainst(record.system);

  return withCompletionNotification(
    record.requestId,
    record.request.referenceCode,
    async () => {
      const updated = await audited(
        {
          actor,
          action: "execution.retried",
          targetType: "ExecutionRecord",
          targetId: executionRecordId,
          requestId: record.requestId,
          payload: {
            system: record.system?.name,
            attempt: record.attempt + 1,
            previousFailureCode: record.failureCode,
            outcome: outcome.status,
          },
        },
        (tx: TxClient) =>
          tx.executionRecord.update({
            where: { id: executionRecordId },
            data: {
              status: outcome.status,
              attempt: { increment: 1 },
              dispatchedAt: new Date(),
              confirmedAt: outcome.confirmedAt,
              confirmedByActorId: outcome.confirmedAt ? (actor.id ?? null) : null,
              verificationMethod: outcome.verificationMethod,
              failureCode: outcome.failureCode,
              failureDetail: outcome.failureDetail,
              failureRawResponse: outcome.failureRawResponse,
            },
          }),
      );

      if (outcome.status === "failed") {
        await emit(db, {
          kind: "execution.failed",
          requestId: record.requestId,
          requestRef: record.request.referenceCode,
          systemName: record.system!.name,
          failureCode: outcome.failureCode ?? "unknown",
        });
      }

      return updated;
    },
  );
}

// ---------------------------------------------------------------------------
// Manual verification (non-API systems)
// ---------------------------------------------------------------------------

export async function setChecklistItem(
  itemId: string,
  checked: boolean,
  actor: AuditActor,
) {
  const item = await db.verificationChecklistItem.findUniqueOrThrow({
    where: { id: itemId },
    include: { executionRecord: { select: { requestId: true } } },
  });

  return audited(
    {
      actor,
      action: checked ? "manual.step_checked" : "manual.step_unchecked",
      targetType: "VerificationChecklistItem",
      targetId: itemId,
      requestId: item.executionRecord.requestId,
      payload: { label: item.label, checked },
    },
    (tx: TxClient) =>
      tx.verificationChecklistItem.update({
        where: { id: itemId },
        data: {
          checked,
          checkedAt: checked ? new Date() : null,
          checkedByActorId: checked ? (actor.id ?? null) : null,
        },
      }),
  );
}

export async function confirmManualVerification(
  executionRecordId: string,
  actor: AuditActor,
) {
  const record = await db.executionRecord.findUniqueOrThrow({
    where: { id: executionRecordId },
    include: {
      checklist: true,
      system: true,
      request: { select: { referenceCode: true } },
    },
  });

  const remaining = record.checklist.filter((i) => !i.checked).length;
  if (remaining > 0) throw new ChecklistIncompleteError(remaining);

  return withCompletionNotification(
    record.requestId,
    record.request.referenceCode,
    async () => {
      const updated = await audited(
        {
          actor,
          action: "execution.manually_verified",
          targetType: "ExecutionRecord",
          targetId: executionRecordId,
          requestId: record.requestId,
          payload: {
            system: record.system?.name,
            attestedBy: actor.label,
            steps: record.checklist.map((i) => i.label),
          },
        },
        (tx: TxClient) =>
          tx.executionRecord.update({
            where: { id: executionRecordId },
            data: {
              status: "verified",
              confirmedAt: new Date(),
              confirmedByActorId: actor.id ?? null,
              verificationMethod: "manual_attestation",
            },
          }),
      );

      await emit(db, {
        kind: "execution.verified",
        requestId: record.requestId,
        requestRef: record.request.referenceCode,
        systemName: record.system?.name ?? "Manual system",
      });

      return updated;
    },
  );
}

// ---------------------------------------------------------------------------
// Processor instructions (DPDP s.8(2))
// ---------------------------------------------------------------------------

export async function dispatchProcessorInstruction(
  requestId: string,
  processorId: string,
  actor: AuditActor,
) {
  const request = await loadRequest(requestId);
  const posture = await assertRetentionReviewed(request.principalId, requestId);

  const processor = await db.dataProcessor.findUniqueOrThrow({
    where: { id: processorId },
  });

  // Principle 2: a draft-DPA processor is a hard block on dispatch, checked
  // before anything else touches it — a draft contract is no contract.
  if (processor.dpaStatus === "draft") throw new DraftDpaError(processor.name, processor.dpaId);

  const location = await db.dataLocation.findFirst({
    where: { principalId: request.principalId ?? "", processorId },
  });

  const categories = decodeList(location?.dataCategoriesJson);
  const dpaScope = decodeList(processor.dpaScopeJson);
  const outOfScope = categories.filter((c) => !dpaScope.includes(c));

  if (outOfScope.length > 0) throw new DpaScopeError(processor.name, outOfScope);

  const excluded = excludedFieldsFor(posture, categories);
  const now = new Date();

  return withCompletionNotification(requestId, request.referenceCode, () =>
    audited(
      {
        actor,
        action: "processor.instruction_dispatched",
        targetType: "DataProcessor",
        targetId: processorId,
        requestId,
        payload: {
          processor: processor.name,
          dpaId: processor.dpaId,
          channel: processor.contactChannel,
          dataCategories: categories,
          dpaScope,
          excludedFields: excluded,
          basis: PROCESSOR_RESPONSIBILITY.citation,
        },
      },
      (tx: TxClient) =>
        tx.executionRecord.create({
          data: {
            requestId,
            processorId,
            mode: "processor_instruction",
            status: "pending",
            excludedFieldsJson: encodeList(excluded),
            dispatchedAt: now,
            deliveredAt: now,
          },
        }),
    ),
  );
}

export async function confirmProcessorAction(
  executionRecordId: string,
  actor: AuditActor,
) {
  const record = await db.executionRecord.findUniqueOrThrow({
    where: { id: executionRecordId },
    include: { processor: true, request: { select: { referenceCode: true } } },
  });

  return withCompletionNotification(
    record.requestId,
    record.request.referenceCode,
    async () => {
      const updated = await audited(
        {
          actor,
          action: "processor.action_confirmed",
          targetType: "ExecutionRecord",
          targetId: executionRecordId,
          requestId: record.requestId,
          payload: {
            processor: record.processor?.name,
            dpaId: record.processor?.dpaId,
            recordedBy: actor.label,
          },
        },
        (tx: TxClient) =>
          tx.executionRecord.update({
            where: { id: executionRecordId },
            data: {
              status: "verified",
              confirmedAt: new Date(),
              confirmedByActorId: actor.id ?? null,
              verificationMethod: "processor_confirmation",
            },
          }),
      );

      await emit(db, {
        kind: "processor.confirmed",
        requestId: record.requestId,
        requestRef: record.request.referenceCode,
        processorName: record.processor?.name ?? "Processor",
      });

      return updated;
    },
  );
}

// ---------------------------------------------------------------------------
// Identity resolution (multi-account conflict)
// ---------------------------------------------------------------------------

export async function resolveIdentity(
  requestId: string,
  principalId: string,
  note: string,
  actor: AuditActor,
) {
  const principal = await db.dataPrincipal.findUniqueOrThrow({
    where: { id: principalId },
  });

  return audited(
    {
      actor,
      action: "identity.resolved",
      targetType: "DataPrincipalRequest",
      targetId: requestId,
      requestId,
      payload: { principalId, principal: principal.displayName, note },
    },
    (tx: TxClient) =>
      tx.dataPrincipalRequest.update({
        where: { id: requestId },
        data: {
          principalId,
          requiresIdentityReview: false,
          identityNote: note,
          status: "retention_review",
        },
      }),
  );
}

// ---------------------------------------------------------------------------
// Scheduler tick — delayed execution, SLA thresholds, retention expiry
// ---------------------------------------------------------------------------

export interface TickResult {
  delayedCompleted: number;
  slaNotified: number;
  retentionExpired: number;
}

/**
 * Advances time-driven work.
 *
 * DEVIATION FROM SPEC: the spec suggests BullMQ, which needs Redis. No Redis is
 * available here, so this runs as an idempotent tick invoked by
 * /api/cron/tick — the same semantics, driven by Vercel Cron in a deployment or
 * by hand in a demo. Swapping in BullMQ means calling this from a worker.
 */
export async function runTick(now: Date = new Date()): Promise<TickResult> {
  const systemActor: AuditActor = { id: null, label: "Scheduler", role: "system" };

  const due = await db.executionRecord.findMany({
    where: { status: "pending", scheduledFor: { lte: now } },
    include: { system: true, request: { select: { referenceCode: true, id: true } } },
  });

  for (const record of due) {
    await audited(
      {
        actor: systemActor,
        action: "execution.delayed_window_reached",
        targetType: "ExecutionRecord",
        targetId: record.id,
        requestId: record.requestId,
        payload: {
          system: record.system?.name,
          scheduledFor: record.scheduledFor?.toISOString(),
        },
      },
      (tx: TxClient) =>
        tx.executionRecord.update({
          where: { id: record.id },
          data: {
            status: "verified",
            confirmedAt: now,
            verificationMethod: "api_ack",
          },
        }),
    );

    await emit(db, {
      kind: "execution.verified",
      requestId: record.requestId,
      requestRef: record.request.referenceCode,
      systemName: record.system?.name ?? "Backup",
    });
  }

  const expired = await db.retentionException.findMany({
    where: { expiresAt: { lte: now }, reviewStatus: { not: "overridden" } },
  });

  for (const exception of expired) {
    await audited(
      {
        actor: systemActor,
        action: "retention.expired",
        targetType: "RetentionException",
        targetId: exception.id,
        requestId: exception.requestId,
        payload: {
          dataCategory: exception.dataCategory,
          statuteRef: exception.statuteRef,
          expiredAt: exception.expiresAt?.toISOString(),
        },
      },
      (tx: TxClient) =>
        tx.retentionException.update({
          where: { id: exception.id },
          data: { reviewStatus: "overridden" },
        }),
    );
  }

  return {
    delayedCompleted: due.length,
    slaNotified: 0,
    retentionExpired: expired.length,
  };
}

export async function retentionPostureFor(
  principalId: string | null,
  requestId?: string,
) {
  return getRetentionPosture(principalId, requestId);
}

export { NoApiError };
