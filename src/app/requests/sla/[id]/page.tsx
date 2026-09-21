import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, formatDate } from "@/components/ui";
import { DprrWorkspace, type TicketDetail } from "@/components/dprr/DprrWorkspace";
import { evaluateSla, computeStatutoryCeiling } from "@/lib/engines/sla";
import {
  ESCALATION_SOURCE_LABEL, REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL,
  type EscalationSource, type RequestStatus, type RequestType,
} from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * SCREEN — DPRR ticket detail. Routing, append-only extensions, the reused
 * sub-task board, and the permanent automatic Board-escalation record. Renders
 * whether or not a DPRRTicket row exists yet; the first routing/extension/
 * sub-task action materialises it.
 */
export default async function DprrTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const request = await db.dataPrincipalRequest.findUnique({
    where: { id },
    include: {
      principal: true, assignedTo: true,
      dprrTicket: {
        include: {
          assignedTo: true,
          extensions: { include: { requestedBy: true }, orderBy: { createdAt: "asc" } },
          subtasks: { orderBy: { createdAt: "asc" } },
          escalations: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!request) notFound();

  const ticket = request.dprrTicket;
  const currentDeadline = ticket?.currentDeadline ?? request.slaDeadline;
  const originalDeadline = ticket?.originalDeadline ?? request.slaDeadline;
  const sla = evaluateSla(request.receivedAt, currentDeadline);
  const ceilingAt = computeStatutoryCeiling(request.receivedAt);

  const t: TicketDetail = {
    requestId: request.id,
    reference: request.referenceCode,
    typeLabel: REQUEST_TYPE_LABEL[request.type as RequestType],
    principal: request.principal?.displayName ?? request.rawIdentifier,
    statusLabel: REQUEST_STATUS_LABEL[request.status as RequestStatus] ?? request.status,
    sourceLabel: ESCALATION_SOURCE_LABEL[request.escalationSource as EscalationSource],
    routingState: ticket?.routingState ?? (request.assignedToActorId ? "assigned" : "unassigned"),
    assignee: ticket?.assignedTo?.name ?? request.assignedTo?.name ?? null,
    autoAssignedReason: ticket?.autoAssignedReason ?? null,
    originalDeadline: formatDate(originalDeadline),
    currentDeadline: formatDate(currentDeadline),
    currentDeadlineIso: formatDate(currentDeadline),
    slaLabel: sla.label,
    slaBand: sla.band,
    ceilingAt: formatDate(ceilingAt),
    boardEscalated: ticket?.boardEscalated ?? false,
    boardEscalatedAt: ticket?.boardEscalatedAt ? formatDate(ticket.boardEscalatedAt) : null,
    escalations: (ticket?.escalations ?? []).map((e) => ({ id: e.id, reason: e.reason, createdAt: formatDate(e.createdAt) })),
    extensions: (ticket?.extensions ?? []).map((e) => ({
      id: e.id,
      previousDeadline: formatDate(e.previousDeadline),
      newDeadline: formatDate(e.newDeadline),
      justification: e.justification,
      by: e.requestedBy?.name ?? null,
      createdAt: formatDate(e.createdAt),
    })),
    subtasks: (ticket?.subtasks ?? []).map((s) => ({
      id: s.id, title: s.title, team: s.team, assignedTo: s.assignedTo, status: s.status,
      dueDate: s.dueDate ? formatDate(s.dueDate) : null,
    })),
  };

  const assignableActors = (await db.actor.findMany({ where: { role: { not: "system" } }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }));

  return (
    <Shell active="/requests/sla" title={`DPRR queue / ${request.referenceCode}`}>
      <PageHead
        crumbs={[{ label: "DPRR queue", href: "/requests/sla" }, { label: request.referenceCode }]}
        title={`${t.typeLabel} — ${t.principal}`}
        subtitle={<span className="cell-sub">{t.sourceLabel}{request.linkedGrievanceCaseId ? ` · grievance ${request.linkedGrievanceCaseId}` : ""}</span>}
      />
      <DprrWorkspace ticket={t} assignableActors={assignableActors} />
    </Shell>
  );
}
