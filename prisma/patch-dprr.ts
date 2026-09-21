/**
 * DPRR Queue & SLA/Routing demo — idempotent, seeded once. Materialises a
 * DPRRTicket for every existing rights request and dresses a few with the states
 * the screens need to show: an auto-assigned ticket, a reassigned one, one with
 * an append-only extension, one already automatically escalated to the Board
 * (permanent), and one with sub-tasks spread across the board.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DAY = 86_400_000;

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-dprr: no DATABASE_URL, skipping."); return; }
  if ((await prisma.dPRRTicket.count()) > 0) { console.log("patch-dprr: tickets present, skipping."); return; }

  const requests = await prisma.dataPrincipalRequest.findMany({ orderBy: { receivedAt: "asc" } });
  if (requests.length === 0) { console.log("patch-dprr: no requests to build tickets from, skipping."); return; }

  const actors = await prisma.actor.findMany({ select: { id: true, name: true, role: true } });
  const byRole: Record<string, { id: string; name: string } | undefined> = {};
  for (const a of actors) if (!byRole[a.role]) byRole[a.role] = { id: a.id, name: a.name };
  const admin = byRole["admin"];
  const grievance = byRole["grievance_officer"];

  // 1) Materialise + auto-assign every ticket by the routing rule.
  for (const r of requests) {
    const grievanceSourced = r.escalationSource === "grievance_officer" || r.escalationSource === "dpb";
    const owner = grievanceSourced && grievance ? grievance : admin;
    const reason = grievanceSourced && grievance
      ? "Grievance-sourced request routed to the Grievance Officer, who owns the principal's case."
      : "Standard rights request routed to the fulfilment desk (Admin).";
    await prisma.dPRRTicket.create({
      data: {
        requestId: r.id,
        originalDeadline: r.slaDeadline,
        currentDeadline: r.slaDeadline,
        routingState: owner ? "assigned" : "unassigned",
        assignedToActorId: owner?.id ?? null,
        autoAssignedReason: reason,
      },
    });
    if (owner) await prisma.dataPrincipalRequest.update({ where: { id: r.id }, data: { assignedToActorId: owner.id } });
  }

  const tickets = await prisma.dPRRTicket.findMany({ include: { request: true }, orderBy: { request: { receivedAt: "asc" } } });

  // 2) Reassignment + one append-only extension on the 2nd ticket.
  if (tickets[1] && grievance) {
    const t = tickets[1];
    await prisma.dPRRTicket.update({ where: { id: t.id }, data: { routingState: "reassigned", assignedToActorId: grievance.id, autoAssignedReason: `Manually reassigned to ${grievance.name}.` } });
    await prisma.dataPrincipalRequest.update({ where: { id: t.requestId }, data: { assignedToActorId: grievance.id } });
    const newDeadline = new Date(t.currentDeadline.getTime() + 20 * DAY);
    await prisma.dPRRExtension.create({ data: { ticketId: t.id, previousDeadline: t.currentDeadline, newDeadline, justification: "Awaiting the Legacy Loan Archive team's manual confirmation; 20 additional working days needed.", requestedByActorId: admin?.id ?? null } });
    await prisma.dPRRTicket.update({ where: { id: t.id }, data: { currentDeadline: newDeadline } });
  }

  // 3) Automatic Board escalation on the 3rd ticket — extension pushes the
  //    deadline past the 90-day ceiling, so it escalates permanently.
  if (tickets[2]) {
    const t = tickets[2];
    const ceiling = new Date(t.request.receivedAt.getTime() + 90 * DAY);
    const newDeadline = new Date(ceiling.getTime() + 5 * DAY); // past the ceiling
    await prisma.dPRRExtension.create({ data: { ticketId: t.id, previousDeadline: t.currentDeadline, newDeadline, justification: "Cross-border processor dependency unresolved; extension requested beyond the statutory ceiling.", requestedByActorId: admin?.id ?? null } });
    const reason = "Automatically escalated to the Data Protection Board: the request passed the 90-day grievance-redressal ceiling (DPDP Rules, 2025 — Rule 14).";
    await prisma.dPRRTicket.update({ where: { id: t.id }, data: { currentDeadline: newDeadline, boardEscalated: true, boardEscalatedAt: new Date() } });
    await prisma.dPRREscalation.create({ data: { ticketId: t.id, targetRole: "board", trigger: "statutory_ceiling_exceeded", reason } });
  }

  // 4) Sub-tasks across the board on the 4th ticket (else reuse the 1st).
  const subTicket = tickets[3] ?? tickets[0];
  if (subTicket) {
    await prisma.dPRRSubtask.createMany({
      data: [
        { ticketId: subTicket.id, title: "Confirm deletion in Core Banking", team: "fulfilment", assignedTo: "A. Rao", status: "done" },
        { ticketId: subTicket.id, title: "Instruct email processor to purge", team: "it", assignedTo: "N. Gupta", status: "in_progress" },
        { ticketId: subTicket.id, title: "Verify no legal-hold overlaps", team: "legal", assignedTo: "S. Menon", status: "open" },
      ],
    });
  }

  console.log(`patch-dprr: seeded ${requests.length} DPRR tickets with demo states.`);
}

main().catch((e) => console.error("patch-dprr failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
