import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, formatDate } from "@/components/ui";
import { FulfillmentWorkspace, type FulfillmentView } from "@/components/fulfillment/FulfillmentWorkspace";
import type { ChecklistSystem } from "@/components/shared/MultiSystemCompletionChecklist";
import { evaluateSla } from "@/lib/engines/sla";

export const dynamic = "force-dynamic";

export default async function FulfillmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const req = await db.rightsFulfillmentRequest.findUnique({
    where: { id },
    include: {
      systems: { include: { investigation: true }, orderBy: { name: "asc" } },
      instruction: { include: { conflict: true, escalation: { include: { ruling: true } } } },
      evidence: true,
    },
  });
  if (!req) notFound();

  const [principal, locations] = await Promise.all([
    db.dataPrincipal.findUnique({ where: { id: req.customerId }, select: { displayName: true } }),
    db.dataLocation.findMany({ where: { principalId: req.customerId }, include: { system: true, processor: true } }),
  ]);

  const preview = new Map<string, { name: string; systemType: string }>();
  for (const l of locations) {
    if (l.system) preview.set(`s:${l.system.id}`, { name: l.system.name, systemType: l.system.hasApi ? "automated" : "manual" });
    if (l.processor) preview.set(`p:${l.processor.id}`, { name: l.processor.name, systemType: "processor" });
  }

  const inst = req.instruction;
  const cleared = Boolean(inst && ((!inst.conflict && inst.status === "queued") || inst.escalation?.ruling?.decision === "proceed" || inst.escalation?.ruling?.decision === "modify"));
  const sla = req.deadline ? evaluateSla(req.createdAt, req.deadline) : null;
  const deadlineDays = req.deadline ? Math.max(0, Math.round((req.deadline.getTime() - req.createdAt.getTime()) / 86_400_000)) : null;

  const systems: ChecklistSystem[] = req.systems.map((s) => ({
    id: s.id, name: s.name, systemType: s.systemType, status: s.status,
    confirmationReference: s.confirmationReference, verifiedBy: s.verifiedBy, verificationNote: s.verificationNote,
    errorDetail: s.investigation?.errorDetail ?? null, attemptCount: s.investigation?.attemptCount ?? 0, addedManually: s.addedManually,
  }));

  const v: FulfillmentView = {
    requestId: req.id, customerId: req.customerId, customerName: principal?.displayName ?? req.customerId,
    scope: inst?.scope ?? "—", source: req.source,
    deadlineLabel: sla?.label ?? null, deadlineBand: sla?.band ?? null, deadlineDays,
    status: req.status,
    retention: { conflicted: Boolean(inst?.conflict), cleared, rulingDecision: inst?.escalation?.ruling?.decision ?? null, deletionHref: inst ? `/audit-trail/deletions/${inst.id}` : "/audit-trail/deletions" },
    scopeConfirmed: Boolean(req.scopeConfirmedAt),
    lookupPreview: [...preview.values()],
    systems,
    executed: req.status === "verifying" || req.status === "complete",
    completed: req.status === "complete",
    completedAt: req.evidence?.compiledAt ? formatDate(req.evidence.compiledAt) : null,
  };

  return (
    <Shell active="/fulfillment" title={`Rights Fulfillment / ${v.customerName}`}>
      <PageHead
        crumbs={[{ label: "Deletion requests", href: "/fulfillment" }, { label: v.customerName }]}
        title="Fulfil deletion request"
        titleTip="Confirm scope from the data-location lookup, pass the shared retention gate, execute across every system at once, track per-system completion via the shared checklist, and compile the immutable completion evidence."
      />
      <FulfillmentWorkspace v={v} />
    </Shell>
  );
}
