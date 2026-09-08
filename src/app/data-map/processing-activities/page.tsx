import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { Notice, PageHead } from "@/components/ui";
import { ProcessingActivitiesTable, type ActivityRow } from "@/components/processingActivities";
import { EntitiesTable, type EntityRow } from "@/components/entityConfig";
import { decodeObject } from "@/lib/codec/json";

export const dynamic = "force-dynamic";

/**
 * SCREEN 2 — Processing Activities. Two tabs: Activities (the nested element →
 * purpose → processor table) and Fiduciaries (the anchor-entity registry that
 * absorbs the retired Entity Configuration). Purpose/Processor attach per
 * element; assignment is always a DPO-approved bundled request.
 */
export default async function ProcessingActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab === "fiduciaries" ? "fiduciaries" : "activities";

  const [activities, purposes, processors, entities] = await Promise.all([
    db.processingActivity.findMany({
      include: { elements: { include: { purposeTag: true, processor: true }, orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
    }),
    db.purposeTag.findMany({ where: { status: "approved" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.dataProcessor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.entity.findMany({ include: { _count: { select: { userMappings: true } } }, orderBy: { name: "asc" } }),
  ]);

  const activityRows: ActivityRow[] = activities.map((a) => ({
    id: a.id,
    activity: a.activity,
    elements: a.elements.map((e) => ({
      id: e.id,
      elementName: e.elementName,
      purposeTagId: e.purposeTagId,
      purposeName: e.purposeTag?.name ?? null,
      processorId: e.processorId,
      processorName: e.processor?.name ?? null,
      subjectType: e.subjectType,
      requestState: e.requestState,
    })),
  }));

  const nameById = new Map(entities.map((e) => [e.id, e.name]));
  const entityRows: EntityRow[] = entities.map((e) => ({
    id: e.id,
    name: e.name,
    kind: e.kind,
    parentName: e.hierarchyParentId ? (nameById.get(e.hierarchyParentId) ?? null) : null,
    sdfStatus: e.sdfStatus,
    sdfHistory: decodeObject<{ status: string; note: string; at: string }[]>(e.sdfHistoryJson) ?? [],
    mergerPending: e.mergerPending,
    usersMapped: e._count.userMappings,
  }));

  return (
    <Shell active="/data-map/processing-activities" title="Data Map / Processing activities">
      <PageHead
        title="Processing activities"
        titleTip="Every processing activity, broken down to the PII element. Purpose and Processor attach per element — a Loan Application uses PAN for KYC and Phone for marketing at the same time — and are assigned only through a DPO-approved request."
      />

      <nav className="stepper" style={{ marginBottom: 16 }}>
        <Link href="/data-map/processing-activities" className={`step${tab === "activities" ? " active" : ""}`}><span className="step-label">Activities</span></Link>
        <Link href="/data-map/processing-activities?tab=fiduciaries" className={`step${tab === "fiduciaries" ? " active" : ""}`}><span className="step-label">Fiduciaries</span></Link>
      </nav>

      {tab === "activities" ? (
        <ProcessingActivitiesTable activities={activityRows} purposes={purposes} processors={processors} />
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <Notice tone="info" title="Fiduciary registry — full detail page is the next increment">
              The working entities registry is below (SDF status with history, parent/child, merger flag). The full anchor-entity detail — General Info / Contact / Address / Linked Users with Add Fiduciary·Grievance Officer·DPO / independently-assessed SDF / <em>Reconcile After Merger</em> — is being built next; it absorbs everything the retired Entity Configuration covered.
            </Notice>
          </div>
          <EntitiesTable rows={entityRows} parents={entities.map((e) => ({ id: e.id, name: e.name }))} />
        </>
      )}
    </Shell>
  );
}
