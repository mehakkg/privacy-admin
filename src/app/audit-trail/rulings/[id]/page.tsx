import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, formatDate } from "@/components/ui";
import { RulingDetail, type RulingView } from "@/components/scenario3/RulingDetail";
import { getCurrentRole } from "@/lib/session";

export const dynamic = "force-dynamic";

/** SCREENS 7–8 — DPO ruling + execution + linked audit thread. [id] = escalationId. */
export default async function RulingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [escalation, role] = await Promise.all([
    db.conflictEscalation.findUnique({
      where: { id },
      include: { instruction: { include: { conflict: true } }, ruling: { include: { execution: true } } },
    }),
    getCurrentRole(),
  ]);
  if (!escalation) notFound();

  const principal = await db.dataPrincipal.findUnique({ where: { id: escalation.instruction.customerId }, select: { displayName: true } });

  const v: RulingView = {
    escalationId: escalation.id,
    customerName: principal?.displayName ?? escalation.instruction.customerId,
    scope: escalation.instruction.scope,
    actionRequested: escalation.actionRequested,
    obligationInConflict: escalation.obligationInConflict,
    supportingEvidence: (() => { try { return JSON.parse(escalation.supportingEvidenceJson); } catch { return []; } })(),
    compiledBy: escalation.compiledBy,
    submittedAt: formatDate(escalation.submittedAt),
    conflictDetectedAt: escalation.instruction.conflict ? formatDate(escalation.instruction.conflict.detectedAt) : formatDate(escalation.instruction.createdAt),
    role,
    ruling: escalation.ruling ? {
      id: escalation.ruling.id, decision: escalation.ruling.decision, reasoning: escalation.ruling.reasoning,
      legalBasis: escalation.ruling.legalBasis, ruledBy: escalation.ruling.ruledBy, ruledAt: formatDate(escalation.ruling.ruledAt),
    } : null,
    execution: escalation.ruling?.execution ? {
      executedBy: escalation.ruling.execution.executedBy, executedAt: formatDate(escalation.ruling.execution.executedAt), threadRef: escalation.ruling.execution.threadRef,
    } : null,
  };

  return (
    <Shell active="/audit-trail/rulings" title={`Audit & Escalation / Ruling · ${v.customerName}`}>
      <PageHead
        crumbs={[{ label: "DPO rulings", href: "/audit-trail/rulings" }, { label: v.customerName }]}
        title="DPO ruling"
        titleTip="The DPO rules on the retention-vs-erasure conflict with reasoning and a legal basis. The ruling is immutable; executing it writes the escalation and resolution as one linked audit thread."
      />
      <RulingDetail v={v} />
    </Shell>
  );
}
