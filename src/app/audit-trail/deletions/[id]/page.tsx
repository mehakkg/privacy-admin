import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, formatDate } from "@/components/ui";
import { ConflictDetail, type InstructionDetail } from "@/components/scenario3/ConflictDetail";

export const dynamic = "force-dynamic";

export default async function DeletionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inst = await db.deletionInstruction.findUnique({
    where: { id },
    include: { conflict: true, escalation: { include: { ruling: true } } },
  });
  if (!inst) notFound();

  const [principal, retention] = await Promise.all([
    db.dataPrincipal.findUnique({ where: { id: inst.customerId }, select: { displayName: true } }),
    inst.conflict?.retentionExceptionId
      ? db.retentionException.findUnique({ where: { id: inst.conflict.retentionExceptionId } })
      : Promise.resolve(null),
  ]);

  const detail: InstructionDetail = {
    id: inst.id,
    customerId: inst.customerId,
    customerName: principal?.displayName ?? inst.customerId,
    scope: inst.scope,
    source: inst.source,
    deadline: inst.deadline ? formatDate(inst.deadline) : null,
    status: inst.status,
    conflict: inst.conflict ? { obligationDescription: inst.conflict.obligationDescription, obligationReference: inst.conflict.obligationReference } : null,
    retention: retention ? {
      dataCategory: retention.dataCategory, legalBasis: retention.legalBasis, statuteRef: retention.statuteRef,
      fieldPaths: (() => { try { return JSON.parse(retention.fieldPathsJson); } catch { return []; } })(),
      expiryCondition: retention.expiryCondition,
    } : null,
    escalation: inst.escalation ? {
      id: inst.escalation.id, actionRequested: inst.escalation.actionRequested, obligationInConflict: inst.escalation.obligationInConflict,
      supportingEvidence: (() => { try { return JSON.parse(inst.escalation.supportingEvidenceJson); } catch { return []; } })(),
      compiledBy: inst.escalation.compiledBy, submittedAt: formatDate(inst.escalation.submittedAt), hasRuling: Boolean(inst.escalation.ruling),
    } : null,
  };

  return (
    <Shell active="/audit-trail/deletions" title={`Audit & Escalation / Deletion · ${detail.customerName}`}>
      <PageHead
        crumbs={[{ label: "Deletion instructions", href: "/audit-trail/deletions" }, { label: detail.customerName }]}
        title="Deletion instruction"
        titleTip="If a retention obligation conflicts with this deletion, the execution action is removed and the only path forward is a DPO ruling."
      />
      <ConflictDetail inst={detail} />
    </Shell>
  );
}
