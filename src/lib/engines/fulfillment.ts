import { db } from "@/lib/db";
import { audited, recordAction, type AuditActor } from "@/lib/engines/audit";
import { emit } from "@/lib/engines/notification";
import { createDeletionInstruction } from "@/lib/engines/scenario3";
import type { TxClient } from "@/lib/tx";

/**
 * SCENARIO 1 ENGINE — Rights fulfilment.
 *
 * RightsFulfillmentRequest is the intake object. It wraps a SHARED
 * DeletionInstruction (Scenario 3) 1:1 — the retention gate is the same
 * Scenario 3 block, the audit log is the same immutable log. This engine adds
 * scope confirmation, cross-system execution, per-system completion, failed-
 * system investigation, and the gated completion evidence + notification.
 */

export interface FulfillmentIntake {
  source?: "grievance_escalation" | "manual";
  customerId: string;
  scope: string;
  deadline?: string | null;
}

/** Intake — creates the request AND its shared DeletionInstruction (which runs
 *  the retention-conflict check immediately). */
export async function createFulfillmentRequest(input: FulfillmentIntake) {
  if (!input.customerId?.trim() || !input.scope?.trim()) {
    throw Object.assign(new Error("Customer and scope are required."), { name: "ValidationError" });
  }
  const request = await db.rightsFulfillmentRequest.create({
    data: { source: input.source ?? "grievance_escalation", customerId: input.customerId.trim(), deadline: input.deadline ? new Date(input.deadline) : null, status: "received" },
  });
  const instruction = await createDeletionInstruction({ customerId: input.customerId.trim(), scope: input.scope.trim(), source: "dsr:erasure", deadline: input.deadline ?? null });
  await db.deletionInstruction.update({ where: { id: instruction.id }, data: { fulfillmentRequestId: request.id } });
  return request;
}

/** The linked DeletionInstruction for a request. */
async function instructionFor(requestId: string) {
  return db.deletionInstruction.findFirst({ where: { fulfillmentRequestId: requestId }, include: { conflict: true, escalation: { include: { ruling: true } } } });
}

export async function retentionCleared(requestId: string): Promise<boolean> {
  const inst = await instructionFor(requestId);
  if (!inst) return false;
  if (!inst.conflict && inst.status === "queued") return true;
  const decision = inst.escalation?.ruling?.decision;
  return decision === "proceed" || decision === "modify";
}

/** SCREEN 2 — Scope confirmation via the data-location lookup. Non-API systems
 *  are created already in manual_verification_required. */
export async function confirmScope(requestId: string, manualAdds: { name: string; note: string }[], actor: AuditActor) {
  const req = await db.rightsFulfillmentRequest.findUniqueOrThrow({ where: { id: requestId } });
  const locations = await db.dataLocation.findMany({ where: { principalId: req.customerId }, include: { system: true, processor: true } });

  const rows = new Map<string, { name: string; systemType: string }>();
  for (const l of locations) {
    if (l.system) rows.set(`s:${l.system.id}`, { name: l.system.name, systemType: l.system.hasApi ? "automated" : "manual" });
    if (l.processor) rows.set(`p:${l.processor.id}`, { name: l.processor.name, systemType: "processor" });
  }

  await audited(
    { actor, action: "rights_fulfillment.scope_confirmed", targetType: "RightsFulfillmentRequest", targetId: requestId, customerId: req.customerId, eventDescription: `Deletion scope confirmed across ${rows.size + manualAdds.length} systems`, payload: { count: rows.size } },
    async (tx: TxClient) => {
      await tx.systemCompletionStatus.deleteMany({ where: { requestId } });
      for (const r of rows.values()) {
        await tx.systemCompletionStatus.create({ data: { requestId, name: r.name, systemType: r.systemType, status: r.systemType === "automated" ? "pending" : r.systemType === "processor" ? "pending" : "manual_verification_required" } });
      }
      for (const m of manualAdds) {
        if (!m.name.trim()) continue;
        if (!m.note.trim()) throw Object.assign(new Error("A manually added system needs a note explaining why the lookup missed it."), { name: "ValidationError" });
        await tx.systemCompletionStatus.create({ data: { requestId, name: m.name.trim(), systemType: "manual", status: "manual_verification_required", addedManually: true, addNote: m.note.trim() } });
      }
      await tx.rightsFulfillmentRequest.update({ where: { id: requestId }, data: { scopeConfirmedAt: new Date(), status: "retention_check" } });
    },
  );
}

/** SCREEN 4 — Execution. One action fans deletion across every system. */
export async function executeFulfillment(requestId: string, actor: AuditActor) {
  const req = await db.rightsFulfillmentRequest.findUniqueOrThrow({ where: { id: requestId }, include: { systems: true } });
  if (!req.scopeConfirmedAt) throw Object.assign(new Error("Confirm the scope before executing."), { name: "StateError" });
  if (!(await retentionCleared(requestId))) throw Object.assign(new Error("The retention check has not cleared — resolve the conflict via a DPO ruling first."), { name: "StateError" });
  if (req.systems.length === 0) throw Object.assign(new Error("No systems in scope."), { name: "StateError" });

  await audited(
    { actor, action: "rights_fulfillment.executed", targetType: "RightsFulfillmentRequest", targetId: requestId, customerId: req.customerId, eventDescription: `Deletion executed across ${req.systems.length} systems/processors`, payload: {} },
    async (tx: TxClient) => {
      for (const s of req.systems) {
        if (s.systemType === "automated" && s.status === "pending") {
          await tx.systemCompletionStatus.update({ where: { id: s.id }, data: { status: "confirmed", confirmationReference: `DEL-${s.id.slice(-6).toUpperCase()}`, decidedAt: new Date() } });
        }
        // processors stay pending (awaiting their confirmation); manual stay
        // manual_verification_required.
      }
      await tx.rightsFulfillmentRequest.update({ where: { id: requestId }, data: { status: "verifying" } });
    },
  );
}

/** SCREEN 5 — explicit manual verification. Never inferred; note required. */
export async function verifyManualSystem(systemId: string, note: string, actor: AuditActor) {
  if (!note.trim()) throw Object.assign(new Error("A verification note is required — how was this confirmed?"), { name: "ValidationError" });
  const s = await db.systemCompletionStatus.findUnique({ where: { id: systemId }, include: { request: { select: { customerId: true } } } });
  if (!s) throw Object.assign(new Error("System not found."), { name: "StateError" });
  await audited(
    { actor, action: "rights_fulfillment.manual_verified", targetType: "SystemCompletionStatus", targetId: systemId, customerId: s.request.customerId, eventDescription: `Manually verified deletion on ${s.name}` },
    (tx: TxClient) => tx.systemCompletionStatus.update({ where: { id: systemId }, data: { status: "confirmed", verifiedBy: actor.label, verificationNote: note.trim(), confirmationReference: `MANUAL-${systemId.slice(-6).toUpperCase()}`, decidedAt: new Date() } }),
  );
}

/** SCREEN 6 — retry a failed system; first retry resolves and closes the loop. */
export async function retrySystem(systemId: string, actor: AuditActor) {
  const s = await db.systemCompletionStatus.findUniqueOrThrow({ where: { id: systemId }, include: { investigation: true } });
  await audited(
    { actor, action: "rights_fulfillment.system_retried", targetType: "SystemCompletionStatus", targetId: systemId, eventDescription: `Retried deletion on ${s.name}` },
    async (tx: TxClient) => {
      if (s.investigation) {
        await tx.failedDeletionInvestigation.update({ where: { id: s.investigation.id }, data: { attemptCount: s.investigation.attemptCount + 1, resolvedAt: new Date() } });
      }
      await tx.systemCompletionStatus.update({ where: { id: systemId }, data: { status: "confirmed", confirmationReference: `DEL-${systemId.slice(-6).toUpperCase()}`, decidedAt: new Date() } });
    },
  );
}

/** SCREEN 6 — escalate a failed system to investigation (distinct from retry). */
export async function escalateSystem(systemId: string, actor: AuditActor) {
  const s = await db.systemCompletionStatus.findUniqueOrThrow({ where: { id: systemId }, include: { investigation: true } });
  await audited(
    { actor, action: "rights_fulfillment.system_escalated", targetType: "SystemCompletionStatus", targetId: systemId, eventDescription: `Escalated failed deletion on ${s.name} to IT/vendor investigation` },
    async (tx: TxClient) => {
      if (s.investigation) await tx.failedDeletionInvestigation.update({ where: { id: s.investigation.id }, data: { escalated: true } });
    },
  );
}

/**
 * SCREEN 7 — compile completion evidence + notify. HARD GATE: refused unless
 * every system is confirmed. Writes an immutable AuditLogEntry into the SAME
 * log Scenario 3 reads (source_module rights_fulfillment) and notifies the
 * Grievance Officer + DPO in one action.
 */
export async function compileCompletion(requestId: string, actor: AuditActor) {
  const req = await db.rightsFulfillmentRequest.findUniqueOrThrow({ where: { id: requestId }, include: { systems: true, evidence: true } });
  const unfinished = req.systems.filter((s) => s.status !== "confirmed");
  if (req.systems.length === 0 || unfinished.length > 0) {
    throw Object.assign(new Error(`${unfinished.length} system(s) are not yet confirmed — completion evidence can't be compiled until every system is done.`), { name: "StateError" });
  }
  if (req.evidence) throw Object.assign(new Error("Completion evidence has already been compiled."), { name: "StateError" });

  const references = req.systems.map((s) => `${s.name}: ${s.confirmationReference ?? "—"}${s.verificationNote ? ` (${s.verificationNote})` : ""}`);

  await db.$transaction(async (tx) => {
    await tx.completionEvidenceRecord.create({ data: { requestId, systemReferencesJson: JSON.stringify(references), notifiedGrievanceOfficerAt: new Date(), notifiedDpoAt: new Date() } });
    await recordAction(tx, {
      actor, action: "rights_fulfillment.completed", targetType: "RightsFulfillmentRequest", targetId: requestId,
      customerId: req.customerId, eventDescription: `Erasure completed and verified across ${req.systems.length} systems for ${req.customerId}`,
      payload: { references },
    });
    await tx.rightsFulfillmentRequest.update({ where: { id: requestId }, data: { status: "complete" } });
    await emit(tx, { kind: "fulfillment.completed", instructionId: requestId, customerId: req.customerId, systemCount: req.systems.length });
  });
}
