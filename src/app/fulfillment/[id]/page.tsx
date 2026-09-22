import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, formatDate } from "@/components/ui";
import { FulfillmentWorkspace, type FulfillmentView, type SystemRow } from "@/components/fulfillment/FulfillmentWorkspace";
import { evaluateSla } from "@/lib/engines/sla";

export const dynamic = "force-dynamic";

export default async function FulfillmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inst = await db.deletionInstruction.findUnique({
    where: { id },
    include: { systems: { orderBy: { name: "asc" } }, conflict: true, escalation: { include: { ruling: true } } },
  });
  if (!inst) notFound();

  const [principal, locations] = await Promise.all([
    db.dataPrincipal.findUnique({ where: { id: inst.customerId }, select: { displayName: true } }),
    db.dataLocation.findMany({ where: { principalId: inst.customerId }, include: { system: true, processor: true } }),
  ]);

  // Data-location lookup preview (Screen 2) — what would be included on confirm.
  const preview = new Map<string, { name: string; kind: string }>();
  for (const l of locations) {
    if (l.system) preview.set(`s:${l.system.id}`, { name: l.system.name, kind: l.system.hasApi ? "automated" : "manual" });
    if (l.processor) preview.set(`p:${l.processor.id}`, { name: l.processor.name, kind: "processor" });
  }

  const cleared = (!inst.conflict && inst.status === "queued") || inst.escalation?.ruling?.decision === "proceed" || inst.escalation?.ruling?.decision === "modify";
  const sla = inst.deadline ? evaluateSla(inst.createdAt, inst.deadline) : null;

  const systems: SystemRow[] = inst.systems.map((s) => ({
    id: s.id, name: s.name, kind: s.kind, status: s.status, confirmationRef: s.confirmationRef,
    errorDetail: s.errorDetail, manualNote: s.manualNote, verifiedBy: s.verifiedBy, addedManually: s.addedManually,
    addNote: s.addNote, attemptCount: s.attemptCount,
  }));

  const v: FulfillmentView = {
    id: inst.id, customerId: inst.customerId, customerName: principal?.displayName ?? inst.customerId,
    scope: inst.scope, source: inst.source,
    deadlineLabel: sla?.label ?? null, deadlineBand: sla?.band ?? null,
    status: inst.status,
    retention: {
      conflicted: Boolean(inst.conflict), cleared,
      rulingDecision: inst.escalation?.ruling?.decision ?? null,
      deletionHref: `/audit-trail/deletions/${inst.id}`,
    },
    scopeConfirmed: Boolean(inst.scopeConfirmedAt),
    lookupPreview: [...preview.values()],
    systems,
    executed: inst.status === "executed" && inst.systems.length > 0,
    completedAt: inst.completedAt ? formatDate(inst.completedAt) : null,
  };

  return (
    <Shell active="/fulfillment" title={`Rights Fulfillment / ${v.customerName}`}>
      <PageHead
        crumbs={[{ label: "Deletion requests", href: "/fulfillment" }, { label: v.customerName }]}
        title="Fulfil deletion request"
        titleTip="Confirm scope from the data-location lookup, pass the shared retention gate, execute across every system at once, track per-system completion, and compile the immutable completion evidence."
      />
      <FulfillmentWorkspace v={v} />
    </Shell>
  );
}
