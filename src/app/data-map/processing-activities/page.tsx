import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { Notice, PageHead } from "@/components/ui";
import { ProcessingActivitiesTable, type ActivityRow, type PurposeSegment, type SegElement } from "@/components/processingActivities";
import { EntitiesTable, type EntityRow } from "@/components/entityConfig";
import { decodeObject } from "@/lib/codec/json";

export const dynamic = "force-dynamic";

/** First significant word of a field name, used to match it to an inventory record. */
function matchKey(name: string): string {
  const t = name.trim().toLowerCase().split(/\s+/).find((w) => w.length >= 3);
  return t ?? name.trim().toLowerCase();
}

/**
 * SCREEN 2 — Processing Activities, PURPOSE-FIRST. Activity → Purpose segment(s)
 * → Elements scoped to that purpose. Retention + legal basis are DPO-owned on the
 * purpose; the Processor lives on the purpose. Legacy (element-first) rows surface
 * under an "Unassigned" grouping for deliberate re-assignment.
 */
export default async function ProcessingActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; assign?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab === "fiduciaries" ? "fiduciaries" : "activities";

  const [activities, purposes, processors, entities, fields] = await Promise.all([
    db.processingActivity.findMany({
      include: {
        entity: true,
        elements: { include: { purposeTag: true }, orderBy: { createdAt: "asc" } },
        purposeSegments: {
          include: { purposeTag: true, processor: true, elements: { orderBy: { createdAt: "asc" } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.purposeTag.findMany({ where: { status: "approved" }, orderBy: { name: "asc" }, select: { id: true, name: true, retention: true, lawfulBasis: true } }),
    db.dataProcessor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.entity.findMany({ include: { _count: { select: { userMappings: true } } }, orderBy: { name: "asc" } }),
    db.classifiedField.findMany({ include: { source: true } }),
  ]);

  // Inventory match: field name → a classified field, by first significant word.
  const fieldMatch = (name: string): SegElement["inventory"] => {
    const k = matchKey(name);
    const f = fields.find((x) => x.fieldPath.toLowerCase().includes(k) || x.detectedType.toLowerCase().includes(k));
    return f ? { fieldPath: f.fieldPath, category: f.category, sensitivityTier: f.sensitivityTier, sourceName: f.source.name } : null;
  };

  const activityRows: ActivityRow[] = activities.map((a) => ({
    id: a.id,
    activity: a.activity,
    lifecycleState: a.lifecycleState,
    entityId: a.entityId,
    entityName: a.entity?.name ?? null,
    segments: a.purposeSegments.map((s): PurposeSegment => ({
      id: s.id,
      purposeName: s.purposeTag?.name ?? null,
      purposeStatus: s.purposeTag?.status ?? null,
      legalBasis: s.purposeTag?.lawfulBasis ?? null,
      retention: s.purposeTag?.retention ?? null,
      processorName: s.processor?.name ?? null,
      processorJurisdiction: s.processor?.jurisdiction ?? null,
      processorHasDpa: s.processor ? s.processor.dpaStatus === "active" : true,
      requestState: s.requestState,
      elements: s.elements.map((e): SegElement => ({ id: e.id, fieldName: e.fieldName, inventory: fieldMatch(e.fieldName) })),
    })),
    // Old element-first rows → surfaced as legacy, never silently migrated.
    legacyElements: a.elements.map((e) => ({ id: e.id, elementName: e.elementName, purposeName: e.purposeTag?.name ?? null })),
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
        titleTip="Purpose-first: you declare why (the purpose) before what (the fields). Each purpose under an activity carries its own retention, legal basis and processor (DPO-owned). The same field can sit under two purposes — it shows as two rows, one per purpose."
      />

      <nav className="stepper" style={{ marginBottom: 16 }}>
        <Link href="/data-map/processing-activities" className={`step${tab === "activities" ? " active" : ""}`}><span className="step-label">Activities</span></Link>
        <Link href="/data-map/processing-activities?tab=fiduciaries" className={`step${tab === "fiduciaries" ? " active" : ""}`}><span className="step-label">Fiduciaries</span></Link>
      </nav>

      {tab === "activities" ? (
        <ProcessingActivitiesTable
          activities={activityRows}
          purposes={purposes}
          processors={processors}
          entities={entities.map((e) => ({ id: e.id, name: e.name }))}
          inventoryFields={fields.map((f) => ({ id: f.id, path: f.fieldPath }))}
          assignField={params.assign ?? null}
        />
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
