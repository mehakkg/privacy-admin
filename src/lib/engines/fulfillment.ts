import { db } from "@/lib/db";
import { audited, recordAction, type AuditActor } from "@/lib/engines/audit";
import { emit } from "@/lib/engines/notification";
import type { TxClient } from "@/lib/tx";

/**
 * SCENARIO 1 ENGINE — Rights fulfilment over the SHARED DeletionInstruction.
 *
 * Intake is the DeletionInstruction interface (Scenario 3). This layer adds
 * scope confirmation (from the existing data-location lookup), a single
 * cross-system execution, per-system completion tracking, failed-system
 * investigation, and the gated, immutable completion evidence + notification.
 */

/** Which of a DeletionInstruction's states count as "retention cleared" — a
 *  clean queued instruction, or a conflicted one whose DPO ruling allows it. */
export async function retentionCleared(instructionId: string): Promise<boolean> {
  const inst = await db.deletionInstruction.findUniqueOrThrow({
    where: { id: instructionId },
    include: { conflict: true, escalation: { include: { ruling: true } } },
  });
  if (!inst.conflict && inst.status === "queued") return true;
  const decision = inst.escalation?.ruling?.decision;
  return decision === "proceed" || decision === "modify";
}

/**
 * SCREEN 2 — Scope confirmation. Runs the existing data-location lookup for the
 * customer and materialises one checklist row per connected system / processor,
 * plus any manual additions (each with a required justification note).
 */
export async function confirmScope(instructionId: string, manualAdds: { name: string; note: string }[], actor: AuditActor) {
  const inst = await db.deletionInstruction.findUniqueOrThrow({ where: { id: instructionId } });
  const locations = await db.dataLocation.findMany({
    where: { principalId: inst.customerId },
    include: { system: true, processor: true },
  });

  const rows = new Map<string, { name: string; kind: string }>();
  for (const l of locations) {
    if (l.system) rows.set(`s:${l.system.id}`, { name: l.system.name, kind: l.system.hasApi ? "automated" : "manual" });
    if (l.processor) rows.set(`p:${l.processor.id}`, { name: l.processor.name, kind: "processor" });
  }

  await audited(
    { actor, action: "fulfillment.scope_confirmed", targetType: "DeletionInstruction", targetId: instructionId, customerId: inst.customerId, eventDescription: `Deletion scope confirmed across ${rows.size + manualAdds.length} systems`, payload: { count: rows.size } },
    async (tx: TxClient) => {
      await tx.deletionSystemStatus.deleteMany({ where: { instructionId } });
      for (const r of rows.values()) {
        await tx.deletionSystemStatus.create({ data: { instructionId, name: r.name, kind: r.kind, status: "pending" } });
      }
      for (const m of manualAdds) {
        if (!m.name.trim()) continue;
        if (!m.note.trim()) throw Object.assign(new Error("A manually added system needs a note explaining why the lookup missed it."), { name: "ValidationError" });
        await tx.deletionSystemStatus.create({ data: { instructionId, name: m.name.trim(), kind: "manual", status: "pending", addedManually: true, addNote: m.note.trim() } });
      }
      await tx.deletionInstruction.update({ where: { id: instructionId }, data: { scopeConfirmedAt: new Date() } });
    },
  );
}

/**
 * SCREEN 4 — Execution trigger. One action fans the deletion out to every
 * confirmed system and processor. Automated systems return a confirmation
 * reference; systems without an API drop to manual-verification-required;
 * processors are instructed and left pending their confirmation.
 */
export async function executeFulfillment(instructionId: string, actor: AuditActor) {
  const inst = await db.deletionInstruction.findUniqueOrThrow({ where: { id: instructionId }, include: { systems: true } });
  if (!inst.scopeConfirmedAt) throw Object.assign(new Error("Confirm the scope before executing."), { name: "StateError" });
  if (!(await retentionCleared(instructionId))) throw Object.assign(new Error("The retention check has not cleared — resolve the conflict via a DPO ruling first."), { name: "StateError" });
  if (inst.systems.length === 0) throw Object.assign(new Error("No systems in scope."), { name: "StateError" });

  await audited(
    { actor, action: "fulfillment.executed", targetType: "DeletionInstruction", targetId: instructionId, customerId: inst.customerId, eventDescription: `Deletion executed across ${inst.systems.length} systems/processors`, payload: { scope: inst.scope } },
    async (tx: TxClient) => {
      for (const s of inst.systems) {
        if (s.kind === "automated") {
          await tx.deletionSystemStatus.update({ where: { id: s.id }, data: { status: "confirmed", confirmationRef: `DEL-${s.id.slice(-6).toUpperCase()}`, decidedAt: new Date() } });
        } else if (s.kind === "processor") {
          await tx.deletionSystemStatus.update({ where: { id: s.id }, data: { status: "pending" } });
        } else {
          await tx.deletionSystemStatus.update({ where: { id: s.id }, data: { status: "manual_required" } });
        }
      }
      await tx.deletionInstruction.update({ where: { id: instructionId }, data: { status: "executed", executedAt: new Date(), executedBy: actor.label } });
    },
  );
}

/** SCREEN 5 — explicit manual verification. Never inferred; a note is required. */
export async function verifyManualSystem(statusId: string, note: string, actor: AuditActor) {
  if (!note.trim()) throw Object.assign(new Error("A verification note is required — how was this confirmed?"), { name: "ValidationError" });
  const s = await db.deletionSystemStatus.findUnique({ where: { id: statusId }, include: { instruction: { select: { customerId: true } } } });
  if (!s) throw Object.assign(new Error("System not found."), { name: "StateError" });
  await audited(
    { actor, action: "fulfillment.manual_verified", targetType: "DeletionSystemStatus", targetId: statusId, customerId: s.instruction.customerId, eventDescription: `Manually verified deletion on ${s.name}` },
    (tx: TxClient) => tx.deletionSystemStatus.update({ where: { id: statusId }, data: { status: "confirmed", manualNote: note.trim(), verifiedBy: actor.label, confirmationRef: `MANUAL-${statusId.slice(-6).toUpperCase()}`, decidedAt: new Date() } }),
  );
}

/** SCREEN 6 — retry a failed system. */
export async function retrySystem(statusId: string, actor: AuditActor) {
  const s = await db.deletionSystemStatus.findUniqueOrThrow({ where: { id: statusId } });
  await audited(
    { actor, action: "fulfillment.system_retried", targetType: "DeletionSystemStatus", targetId: statusId, eventDescription: `Retried deletion on ${s.name} (attempt ${s.attemptCount + 1})` },
    // First retry resolves; the seed provides the repeated-failure state.
    (tx: TxClient) => tx.deletionSystemStatus.update({ where: { id: statusId }, data: { status: "confirmed", attemptCount: s.attemptCount + 1, confirmationRef: `DEL-${statusId.slice(-6).toUpperCase()}`, errorDetail: null, decidedAt: new Date() } }),
  );
}

/** SCREEN 6 — escalate a failed system to investigation (distinct from retry). */
export async function escalateSystem(statusId: string, actor: AuditActor) {
  const s = await db.deletionSystemStatus.findUniqueOrThrow({ where: { id: statusId } });
  await audited(
    { actor, action: "fulfillment.system_escalated", targetType: "DeletionSystemStatus", targetId: statusId, eventDescription: `Escalated failed deletion on ${s.name} to investigation`, payload: { error: s.errorDetail } },
    (tx: TxClient) => tx.deletionSystemStatus.update({ where: { id: statusId }, data: { errorDetail: `${s.errorDetail ?? "Failure"} — escalated to investigation by ${actor.label}.`, decidedAt: new Date() } }),
  );
}

/**
 * SCREEN 7 — compile completion evidence + notify. HARD GATE: refused unless
 * every system is confirmed (no pending or failed). Writes an immutable
 * completion AuditLogEntry and notifies the Grievance Officer and DPO in the
 * same action.
 */
export async function compileCompletion(instructionId: string, actor: AuditActor) {
  const inst = await db.deletionInstruction.findUniqueOrThrow({ where: { id: instructionId }, include: { systems: true } });
  const unfinished = inst.systems.filter((s) => s.status !== "confirmed");
  if (inst.systems.length === 0 || unfinished.length > 0) {
    throw Object.assign(new Error(`${unfinished.length} system(s) are not yet confirmed — completion evidence can't be compiled until every system is done.`), { name: "StateError" });
  }
  if (inst.completedAt) throw Object.assign(new Error("Completion evidence has already been compiled."), { name: "StateError" });

  await db.$transaction(async (tx) => {
    await recordAction(tx, {
      actor, action: "fulfillment.completed", targetType: "DeletionInstruction", targetId: instructionId,
      customerId: inst.customerId, eventDescription: `Erasure completed and verified across ${inst.systems.length} systems for ${inst.customerId}`,
      payload: { systems: inst.systems.map((s) => ({ name: s.name, ref: s.confirmationRef })) },
    });
    await tx.deletionInstruction.update({ where: { id: instructionId }, data: { completedAt: new Date() } });
    await emit(tx, { kind: "fulfillment.completed", instructionId, customerId: inst.customerId, systemCount: inst.systems.length });
  });
}
