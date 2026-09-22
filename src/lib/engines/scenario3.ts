import { db } from "@/lib/db";
import { audited, recordAction, type AuditActor } from "@/lib/engines/audit";
import { emit } from "@/lib/engines/notification";
import type { TxClient } from "@/lib/tx";

/**
 * SCENARIO 3 ENGINE — evidence verification and retention-conflict escalation.
 *
 * Reads the shared AuditLogEntry (it does not create the modules' logging), and
 * owns the DeletionInstruction interface (defined once, here). Execution of a
 * ruling writes the escalation-raised and resolution-executed audit entries as
 * ONE linked thread (shared evidenceRef), not two independent lines.
 */

// ---- Evidence workstream --------------------------------------------------

export interface EvidenceIntake {
  requestedBy: string;
  customerId: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  claimedEvent: string;
  eventTypeHint?: string | null;
  source?: "api" | "manual";
}

export async function createEvidenceRequest(input: EvidenceIntake) {
  if (!input.customerId?.trim() || !input.claimedEvent?.trim()) {
    throw Object.assign(new Error("Customer id and claimed event are required."), { name: "ValidationError" });
  }
  return db.evidenceRequest.create({
    data: {
      requestedBy: input.requestedBy.trim() || "Grievance Officer",
      customerId: input.customerId.trim(),
      dateFrom: input.dateFrom ? new Date(input.dateFrom) : null,
      dateTo: input.dateTo ? new Date(input.dateTo) : null,
      claimedEvent: input.claimedEvent.trim(),
      eventTypeHint: input.eventTypeHint?.trim() || null,
      source: input.source ?? "api",
      status: "received",
    },
  });
}

/** Opening the search advances a fresh request from received → searching. */
export async function markSearching(requestId: string) {
  await db.evidenceRequest.updateMany({ where: { id: requestId, status: "received" }, data: { status: "searching" } });
}

/** One explicit confirm/reject decision on one entry. Never touches the log. */
export async function decideEntry(input: { requestId: string; logEntryId: string; confirmed: boolean; isSuggested: boolean }, actor: AuditActor) {
  await db.evidenceEntryConfirmation.upsert({
    where: { requestId_logEntryId: { requestId: input.requestId, logEntryId: input.logEntryId } },
    update: { confirmed: input.confirmed, decidedBy: actor.label, decidedAt: new Date() },
    create: { requestId: input.requestId, logEntryId: input.logEntryId, confirmed: input.confirmed, isSuggested: input.isSuggested, decidedBy: actor.label },
  });
  await db.evidenceRequest.updateMany({ where: { id: input.requestId, status: { in: ["received", "searching"] } }, data: { status: "verifying" } });
}

export async function markExported(requestId: string, format: string) {
  await db.evidenceRequest.update({ where: { id: requestId }, data: { status: "exported", exportFormat: format } });
}

/** Delivering closes the request AND logs the act of producing evidence itself. */
export async function markDelivered(requestId: string, format: string, actor: AuditActor) {
  const req = await db.evidenceRequest.findUniqueOrThrow({ where: { id: requestId } });
  await audited(
    {
      actor, action: "evidence.delivered", targetType: "EvidenceRequest", targetId: requestId,
      customerId: req.customerId, eventDescription: `Evidence package delivered (${format.toUpperCase()}) for ${req.customerId}`,
      payload: { format, claimedEvent: req.claimedEvent },
    },
    (tx: TxClient) => tx.evidenceRequest.update({ where: { id: requestId }, data: { status: "delivered", deliveredAt: new Date(), exportFormat: format } }),
  );
}

// ---- Conflict / escalation / ruling workstream ----------------------------

export interface DeletionIntake {
  customerId: string;
  scope: string;
  deadline?: string | null;
  source: string;
}

/**
 * Create a DeletionInstruction and IMMEDIATELY run the retention-conflict check.
 * This is the shared interface: a future DSR module calls this same function
 * rather than inventing its own deletion object.
 */
export async function createDeletionInstruction(input: DeletionIntake) {
  const instruction = await db.deletionInstruction.create({
    data: { customerId: input.customerId.trim(), scope: input.scope.trim(), deadline: input.deadline ? new Date(input.deadline) : null, source: input.source.trim() || "manual", status: "queued" },
  });
  await runConflictCheck(instruction.id);
  return db.deletionInstruction.findUniqueOrThrow({ where: { id: instruction.id }, include: { conflict: true } });
}

/**
 * Check the instruction against active retention flags for its customer. On a
 * hit, the instruction becomes conflict_detected and a RetentionConflict naming
 * the specific obligation is created — which is what removes the normal
 * execution action from the UI (the pages render no execute control in that
 * state; only "Escalate to DPO").
 */
export async function runConflictCheck(instructionId: string) {
  const instruction = await db.deletionInstruction.findUniqueOrThrow({ where: { id: instructionId } });
  if (instruction.status !== "queued") return;
  const flag = await db.retentionException.findFirst({
    where: { principalId: instruction.customerId, reviewStatus: { in: ["unreviewed", "acknowledged", "upheld"] } },
    orderBy: { autoFlagged: "desc" },
  });
  if (!flag) return;
  await db.$transaction(async (tx) => {
    await tx.retentionConflict.create({
      data: {
        instructionId,
        obligationDescription: `${flag.dataCategory} data is under a statutory retention obligation (${flag.legalBasis}).`,
        obligationReference: flag.statuteRef,
        retentionExceptionId: flag.id,
      },
    });
    await tx.deletionInstruction.update({ where: { id: instructionId }, data: { status: "conflict_detected" } });
  });
}

/** Happy path: no conflict. Only reachable while status is still queued. */
export async function executeDeletion(instructionId: string, actor: AuditActor) {
  const instruction = await db.deletionInstruction.findUniqueOrThrow({ where: { id: instructionId } });
  if (instruction.status !== "queued") {
    throw Object.assign(new Error("This instruction is not in a clean queued state — it has a conflict and must be escalated."), { name: "StateError" });
  }
  await audited(
    {
      actor, action: "deletion.executed", targetType: "DeletionInstruction", targetId: instructionId,
      customerId: instruction.customerId, eventDescription: `Deletion executed (no retention conflict) — ${instruction.scope}`,
      payload: { scope: instruction.scope, source: instruction.source },
    },
    (tx: TxClient) => tx.deletionInstruction.update({ where: { id: instructionId }, data: { status: "executed", executedAt: new Date(), executedBy: actor.label } }),
  );
}

/** Compile the escalation. All fields required; evidence auto-attaches the
 *  retention record and the original instruction. Routes to the DPO. */
export async function escalateConflict(input: { instructionId: string; actionRequested: string; extraEvidence?: string[] }, actor: AuditActor) {
  if (!input.actionRequested?.trim()) throw Object.assign(new Error("State the action requested."), { name: "ValidationError" });
  const instruction = await db.deletionInstruction.findUniqueOrThrow({ where: { id: input.instructionId }, include: { conflict: true } });
  if (!instruction.conflict) throw Object.assign(new Error("No conflict to escalate."), { name: "StateError" });
  if (instruction.status !== "conflict_detected") throw Object.assign(new Error("This instruction is not in the conflict_detected state."), { name: "StateError" });

  const evidence = [
    `Retention record: ${instruction.conflict.obligationReference}`,
    `Deletion instruction: ${instruction.id} (${instruction.scope})`,
    ...(input.extraEvidence ?? []).map((e) => e.trim()).filter(Boolean),
  ];

  const escalation = await audited(
    {
      actor, action: "conflict.escalation_compiled", targetType: "DeletionInstruction", targetId: input.instructionId,
      customerId: instruction.customerId, eventDescription: "Retention-vs-erasure conflict compiled and escalated to the DPO",
      payload: { obligation: instruction.conflict.obligationReference },
    },
    async (tx: TxClient) => {
      const esc = await tx.conflictEscalation.create({
        data: {
          instructionId: input.instructionId,
          actionRequested: input.actionRequested.trim(),
          obligationInConflict: `${instruction.conflict!.obligationDescription} (${instruction.conflict!.obligationReference})`,
          supportingEvidenceJson: JSON.stringify(evidence),
          compiledBy: actor.label,
        },
      });
      await tx.deletionInstruction.update({ where: { id: input.instructionId }, data: { status: "escalated" } });
      return esc;
    },
  );

  await emit(db, { kind: "conflict.escalation_raised", escalationId: escalation.id, customerId: instruction.customerId, obligation: instruction.conflict.obligationReference });
  return escalation;
}

/** Record the DPO ruling — immutable. A correction is a new ruling that
 *  supersedes this one, never an edit. */
export async function recordRuling(input: { escalationId: string; decision: string; reasoning: string; legalBasis: string; supersedesId?: string }, actor: AuditActor) {
  if (actor.role !== "dpo") throw Object.assign(new Error("Only the DPO can issue a ruling. Switch role to rule."), { name: "UnauthorisedRulingError" });
  if (!["proceed", "deny", "modify"].includes(input.decision)) throw Object.assign(new Error("Pick a decision."), { name: "ValidationError" });
  if (!input.reasoning?.trim() || !input.legalBasis?.trim()) throw Object.assign(new Error("Reasoning and legal basis are both required."), { name: "ValidationError" });
  const escalation = await db.conflictEscalation.findUniqueOrThrow({ where: { id: input.escalationId }, include: { ruling: true, instruction: true } });
  if (escalation.ruling && !input.supersedesId) throw Object.assign(new Error("A ruling already exists. A correction must supersede it, not overwrite it."), { name: "StateError" });

  const ruling = await audited(
    {
      actor, action: "conflict.ruling_recorded", targetType: "ConflictEscalation", targetId: input.escalationId,
      customerId: escalation.instruction.customerId, eventDescription: `DPO ruling recorded: ${input.decision}`,
      payload: { decision: input.decision, legalBasis: input.legalBasis },
    },
    (tx: TxClient) => tx.dPORuling.create({
      data: { escalationId: input.escalationId, decision: input.decision, reasoning: input.reasoning.trim(), legalBasis: input.legalBasis.trim(), ruledBy: actor.label, supersedesId: input.supersedesId ?? null },
    }),
  );

  await emit(db, { kind: "conflict.ruling_issued", escalationId: input.escalationId, decision: input.decision });
  return ruling;
}

/**
 * Execute the ruling. Writes the escalation-raised and resolution-executed
 * entries as ONE linked thread (shared evidenceRef = threadRef), and moves the
 * instruction to executed. The execution action is constrained to a specific
 * ruling — there is no generic execute path.
 */
export async function executeRuling(rulingId: string, actor: AuditActor) {
  const ruling = await db.dPORuling.findUniqueOrThrow({
    where: { id: rulingId },
    include: { execution: true, escalation: { include: { instruction: true } } },
  });
  if (ruling.execution) throw Object.assign(new Error("This ruling has already been executed."), { name: "StateError" });
  const instruction = ruling.escalation.instruction;
  const threadRef = `THREAD-${instruction.id.slice(-8)}`;

  await db.$transaction(async (tx) => {
    await tx.rulingExecution.create({ data: { rulingId, executedBy: actor.label, threadRef } });
    // The linked pair — both entries share evidenceRef so the history renders as
    // one continuous thread, not two lines that happen to match.
    await recordAction(tx, {
      actor, action: "conflict.escalation_raised", targetType: "DeletionInstruction", targetId: instruction.id,
      customerId: instruction.customerId, evidenceRef: threadRef, eventDescription: `Retention conflict raised for ${instruction.customerId}`,
      payload: { obligation: ruling.escalation.obligationInConflict },
    });
    await recordAction(tx, {
      actor, action: "conflict.resolution_executed", targetType: "DeletionInstruction", targetId: instruction.id,
      customerId: instruction.customerId, evidenceRef: threadRef, eventDescription: `Resolution executed per DPO ruling: ${ruling.decision}`,
      payload: { decision: ruling.decision, legalBasis: ruling.legalBasis },
    });
    await tx.deletionInstruction.update({ where: { id: instruction.id }, data: { status: "executed", executedAt: new Date(), executedBy: actor.label } });
  });
  return threadRef;
}
