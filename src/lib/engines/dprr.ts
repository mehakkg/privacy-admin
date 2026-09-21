import { db } from "@/lib/db";
import { audited, type AuditActor } from "@/lib/engines/audit";
import { emit } from "@/lib/engines/notification";
import { computeStatutoryCeiling, evaluateSla } from "@/lib/engines/sla";
import { GRIEVANCE_REDRESSAL_CEILING } from "@/lib/dpdp/statute";
import type { TxClient } from "@/lib/tx";

/**
 * DPRR ROUTING / SLA ENGINE (Scenario 10)
 *
 * This is the "auto-assignment engine" the DataPrincipalRequest schema comment
 * anticipated. It does not re-model the request or recompute its status/SLA —
 * it reuses evaluateSla / the statute constants and layers routing, extension
 * and automatic-escalation state onto a companion DPRRTicket.
 */

export const SUBTASK_TEAMS = ["fulfilment", "legal", "it"] as const;
export type SubtaskTeam = (typeof SUBTASK_TEAMS)[number];
export const SUBTASK_STATUSES = ["open", "in_progress", "done"] as const;
export const SUBTASK_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
};

/**
 * The routing rule. Deterministic and explainable — grievance-sourced requests
 * are the Grievance Officer's case, everything else lands with the fulfilment
 * desk (Admin). The reason string is stored so the assignment is auditable
 * rather than opaque.
 */
function decideAssignment(
  source: string,
  actorsByRole: Record<string, { id: string; name: string } | undefined>,
): { actorId: string | null; reason: string } {
  const grievanceSourced = source === "grievance_officer" || source === "dpb";
  if (grievanceSourced) {
    const go = actorsByRole["grievance_officer"];
    if (go) {
      return {
        actorId: go.id,
        reason:
          source === "dpb"
            ? "Board-referred request routed to the Grievance Officer, who answers for the case."
            : "Grievance-sourced request routed to the Grievance Officer, who owns the principal's case.",
      };
    }
  }
  const admin = actorsByRole["admin"];
  return {
    actorId: admin?.id ?? null,
    reason: "Standard rights request routed to the fulfilment desk (Admin).",
  };
}

/** Create the companion ticket if it does not exist. Idempotent. */
export async function ensureTicket(tx: TxClient, requestId: string) {
  const existing = await tx.dPRRTicket.findUnique({ where: { requestId } });
  if (existing) return existing;
  const request = await tx.dataPrincipalRequest.findUniqueOrThrow({ where: { id: requestId } });
  return tx.dPRRTicket.create({
    data: {
      requestId,
      originalDeadline: request.slaDeadline,
      currentDeadline: request.slaDeadline,
      routingState: request.assignedToActorId ? "assigned" : "unassigned",
      assignedToActorId: request.assignedToActorId ?? null,
    },
  });
}

/**
 * Materialise tickets for every open request and run the router over any that
 * are still unassigned. This is the "auto-assignment" pass — it never overrides
 * a human reassignment (routingState "reassigned" is left alone).
 */
export async function autoAssignAll(actor: AuditActor): Promise<number> {
  const [requests, actors] = await Promise.all([
    db.dataPrincipalRequest.findMany({
      where: { status: { notIn: ["closed", "rejected"] } },
      select: { id: true, escalationSource: true, slaDeadline: true, assignedToActorId: true },
    }),
    db.actor.findMany({ select: { id: true, name: true, role: true } }),
  ]);
  const byRole: Record<string, { id: string; name: string } | undefined> = {};
  for (const a of actors) if (!byRole[a.role]) byRole[a.role] = { id: a.id, name: a.name };

  let assigned = 0;
  for (const req of requests) {
    const { actorId, reason } = decideAssignment(req.escalationSource, byRole);
    await audited(
      { actor, action: "dprr.auto_assigned", targetType: "DataPrincipalRequest", targetId: req.id, requestId: req.id, payload: { actorId, reason } },
      async (tx: TxClient) => {
        const ticket = await ensureTicket(tx, req.id);
        // Only the router's own unassigned tickets are (re)assigned; a human
        // "reassigned" state is never overwritten by the automatic pass.
        if (ticket.routingState === "reassigned") return;
        await tx.dPRRTicket.update({
          where: { id: ticket.id },
          data: { assignedToActorId: actorId, autoAssignedReason: reason, routingState: actorId ? "assigned" : "unassigned" },
        });
        await tx.dataPrincipalRequest.update({ where: { id: req.id }, data: { assignedToActorId: actorId } });
      },
    );
    assigned += 1;
  }
  return assigned;
}

/** Manual reassignment — an explicit human override; marks the ticket so the
 *  automatic router won't clobber it later. */
export async function reassign(requestId: string, actorId: string, actor: AuditActor) {
  const target = await db.actor.findUnique({ where: { id: actorId }, select: { id: true, name: true } });
  if (!target) throw Object.assign(new Error("Unknown assignee."), { name: "ValidationError" });
  await audited(
    { actor, action: "dprr.reassigned", targetType: "DataPrincipalRequest", targetId: requestId, requestId, payload: { actorId } },
    async (tx: TxClient) => {
      const ticket = await ensureTicket(tx, requestId);
      await tx.dPRRTicket.update({
        where: { id: ticket.id },
        data: { assignedToActorId: actorId, routingState: "reassigned", autoAssignedReason: `Manually reassigned to ${target.name}.` },
      });
      await tx.dataPrincipalRequest.update({ where: { id: requestId }, data: { assignedToActorId: actorId } });
    },
  );
}

export async function addSubtask(
  requestId: string,
  input: { title: string; team: string; assignedTo: string; dueDate: string },
  actor: AuditActor,
) {
  if (!input.title.trim()) throw Object.assign(new Error("Name the sub-task."), { name: "ValidationError" });
  const team = (SUBTASK_TEAMS as readonly string[]).includes(input.team) ? input.team : "fulfilment";
  await audited(
    { actor, action: "dprr.subtask_added", targetType: "DataPrincipalRequest", targetId: requestId, requestId, payload: { team } },
    async (tx: TxClient) => {
      const ticket = await ensureTicket(tx, requestId);
      await tx.dPRRSubtask.create({
        data: { ticketId: ticket.id, title: input.title.trim(), team, assignedTo: input.assignedTo.trim() || null, dueDate: input.dueDate ? new Date(input.dueDate) : null },
      });
    },
  );
}

export async function setSubtaskStatus(subtaskId: string, status: string, requestId: string, actor: AuditActor) {
  const clean = (SUBTASK_STATUSES as readonly string[]).includes(status) ? status : "open";
  await audited(
    { actor, action: "dprr.subtask_status", targetType: "DPRRSubtask", targetId: subtaskId, requestId, payload: { status: clean } },
    (tx: TxClient) => tx.dPRRSubtask.update({ where: { id: subtaskId }, data: { status: clean } }),
  );
}

/**
 * Append a deadline extension. current_deadline moves; original_deadline is
 * never touched. Justification is required. After moving the deadline we run the
 * automatic-escalation check in the SAME transaction — an extension that pushes
 * a ticket past the statutory ceiling triggers Board escalation with no separate
 * step and no way to opt out.
 */
export async function requestExtension(
  requestId: string,
  input: { newDeadline: string; justification: string },
  actor: AuditActor,
) {
  if (!input.justification.trim()) throw Object.assign(new Error("A justification is required to extend a deadline."), { name: "ValidationError" });
  const newDeadline = new Date(input.newDeadline);
  if (Number.isNaN(newDeadline.getTime())) throw Object.assign(new Error("Enter a valid new deadline."), { name: "ValidationError" });

  await audited(
    { actor, action: "dprr.extension_added", targetType: "DataPrincipalRequest", targetId: requestId, requestId, payload: { newDeadline: newDeadline.toISOString() } },
    async (tx: TxClient) => {
      const ticket = await ensureTicket(tx, requestId);
      if (newDeadline.getTime() <= ticket.currentDeadline.getTime()) {
        throw Object.assign(new Error("An extension must move the deadline later than the current one."), { name: "ValidationError" });
      }
      await tx.dPRRExtension.create({
        data: { ticketId: ticket.id, previousDeadline: ticket.currentDeadline, newDeadline, justification: input.justification.trim(), requestedByActorId: actor.id ?? null },
      });
      await tx.dPRRTicket.update({ where: { id: ticket.id }, data: { currentDeadline: newDeadline } });
      // Re-read with the request so the ceiling check uses the moved deadline.
      const fresh = await tx.dPRRTicket.findUniqueOrThrow({ where: { id: ticket.id }, include: { request: true } });
      await escalateIfPastCeiling(tx, fresh);
    },
  );
}

interface TicketWithRequest {
  id: string;
  currentDeadline: Date;
  boardEscalated: boolean;
  request: { referenceCode: string; receivedAt: Date };
}

/**
 * The automatic Board-escalation rule, run by the system — never invoked as a
 * user "escalate" decision. If the ticket's current deadline is at or past the
 * 90-day statutory ceiling (DPDP Rules 2025, Rule 14) and it has not already
 * been escalated, create the permanent DPRREscalation, flag the ticket, and
 * notify. There is no inverse operation anywhere.
 */
async function escalateIfPastCeiling(tx: TxClient, ticket: TicketWithRequest): Promise<boolean> {
  if (ticket.boardEscalated) return false;
  const ceiling = computeStatutoryCeiling(ticket.request.receivedAt);
  const now = Date.now();
  // Escalate when the ceiling itself has passed, or a booked extension already
  // commits the deadline beyond it (a deadline you've promised past the ceiling
  // is already a ceiling breach in the making).
  const pastCeiling = now >= ceiling.getTime() || ticket.currentDeadline.getTime() > ceiling.getTime();
  if (!pastCeiling) return false;

  const reason = `Automatically escalated to the Data Protection Board: the request passed the ${GRIEVANCE_REDRESSAL_CEILING.label} (${GRIEVANCE_REDRESSAL_CEILING.citation}).`;
  await tx.dPRREscalation.create({ data: { ticketId: ticket.id, targetRole: "board", trigger: "statutory_ceiling_exceeded", reason } });
  await tx.dPRRTicket.update({ where: { id: ticket.id }, data: { boardEscalated: true, boardEscalatedAt: new Date() } });
  await emit(tx, { kind: "dprr.board_escalated", ticketId: ticket.id, requestRef: ticket.request.referenceCode, reason });
  return true;
}

/**
 * System tick: re-evaluate every ticket for automatic Board escalation and emit
 * SLA-threshold notifications. This stands in for the scheduled job — running it
 * is "time passing", not a decision, so nothing here asks a human whether to
 * escalate.
 */
export async function runDprrTick(actor: AuditActor): Promise<{ escalated: number; notified: number }> {
  const tickets = await db.dPRRTicket.findMany({ include: { request: true } });
  let escalated = 0;
  let notified = 0;
  for (const t of tickets) {
    const sla = evaluateSla(t.request.receivedAt, t.currentDeadline);
    await audited(
      { actor, action: "dprr.tick", targetType: "DPRRTicket", targetId: t.id, requestId: t.requestId, payload: { band: sla.band } },
      async (tx: TxClient) => {
        const did = await escalateIfPastCeiling(tx, t);
        if (did) escalated += 1;
        if (sla.band !== "ok" && t.request.status !== "closed" && t.request.status !== "rejected") {
          await emit(tx, { kind: "sla.threshold", requestId: t.requestId, requestRef: t.request.referenceCode, band: sla.band, hoursRemaining: sla.hoursRemaining });
          notified += 1;
        }
      },
    );
  }
  return { escalated, notified };
}
