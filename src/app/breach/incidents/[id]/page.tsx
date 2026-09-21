import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { BreachWorkspace, type IncidentDetail } from "@/components/breach/BreachWorkspace";
import { getCurrentRole } from "@/lib/session";
import { isCombinedGovernance } from "@/lib/governance";
import { formatDate } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function BreachIncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [incident, purposes, processors, role, combined] = await Promise.all([
    db.breachIncident.findUnique({
      where: { id },
      include: { entity: true, impacts: true, cohorts: { orderBy: { snapshotTakenAt: "desc" } }, processorThreads: true, boardPackage: true, tasks: { orderBy: { dueDate: "asc" } } },
    }),
    db.purposeTag.findMany({ where: { status: "approved" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.dataProcessor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, jurisdiction: true } }),
    getCurrentRole(),
    isCombinedGovernance(),
  ]);
  if (!incident) notFound();

  const detail: IncidentDetail = {
    id: incident.id,
    reference: incident.reference,
    category: incident.category,
    severity: incident.severity,
    status: incident.status,
    reportedVia: incident.reportedVia,
    detectedAt: incident.detectedAt.toISOString(),
    entityId: incident.entityId,
    entityName: incident.entity?.name ?? null,
    owner: incident.owner,
    reporterNote: incident.reporterNote,
    isProcessorCaused: incident.isProcessorCaused,
    impacts: incident.impacts.map((m) => ({ id: m.id, elementName: m.elementName, purposeId: m.purposeId, processorId: m.processorId })),
    cohort: incident.cohorts[0] ? { count: incident.cohorts[0].count, takenAt: formatDate(incident.cohorts[0].snapshotTakenAt) } : null,
    threads: incident.processorThreads.map((t) => ({ id: t.id, processorId: t.processorId, processorName: t.processorName, outreachSentAt: t.outreachSentAt ? formatDate(t.outreachSentAt) : null, response: t.remediationResponse, responseAt: t.responseReceivedAt ? formatDate(t.responseReceivedAt) : null, confirmed: t.fiduciaryConfirmed, confirmedBy: t.confirmedBy })),
    pkg: incident.boardPackage ? {
      immediateDescription: incident.boardPackage.immediateDescription, immediateSentAt: incident.boardPackage.immediateSentAt ? formatDate(incident.boardPackage.immediateSentAt) : null,
      updatedDescription: incident.boardPackage.updatedDescription, factsAndCircumstances: incident.boardPackage.factsAndCircumstances,
      mitigationMeasures: incident.boardPackage.mitigationMeasures, causeFindings: incident.boardPackage.causeFindings,
      remedialMeasures: incident.boardPackage.remedialMeasures, principalIntimationReport: incident.boardPackage.principalIntimationReport,
      submittedAt: incident.boardPackage.submittedAt ? formatDate(incident.boardPackage.submittedAt) : null, approvedBy: incident.boardPackage.approvedBy, selfApproved: incident.boardPackage.selfApproved,
    } : null,
    tasks: incident.tasks.map((t) => ({ id: t.id, title: t.title, team: t.team, assignedTo: t.assignedTo, status: t.status, dueDate: t.dueDate ? formatDate(t.dueDate) : null })),
  };

  return (
    <Shell active="/breach/incidents" title={`Breach Management / ${incident.reference}`}>
      <PageHead title={incident.reference} titleTip="The incident workspace — triage, impact mapping, processor investigation, the two-stage Board notification, and remediation." />
      <BreachWorkspace incident={detail} purposes={purposes} processors={processors} role={role} combined={combined} />
    </Shell>
  );
}
