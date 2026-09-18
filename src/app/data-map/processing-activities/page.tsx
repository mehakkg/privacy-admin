import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { Notice, PageHead } from "@/components/ui";
import { ProcessingActivitiesTable, type ActivityRow, type HistoryItem } from "@/components/processingActivities";
import { EntitiesTable, type EntityRow } from "@/components/entityConfig";
import { decodeObject } from "@/lib/codec/json";

export const dynamic = "force-dynamic";

/** First significant word of an element name, used to match it to an inventory field. */
function matchKey(name: string): string {
  const t = name.trim().toLowerCase().split(/\s+/).find((w) => w.length >= 3);
  return t ?? name.trim().toLowerCase();
}

/**
 * SCREEN 2 — Processing Activities. Two tabs: Activities (the nested element →
 * purpose → processor table) and Fiduciaries (the anchor-entity registry that
 * absorbs the retired Entity Configuration). Purpose/Processor attach per
 * element; assignment is always a DPO-approved bundled request. Retention and
 * lawful basis travel with the purpose (DPO-owned, locked to Admin); jurisdiction
 * travels with the processor; the parent row rolls up element completeness and
 * carries lifecycle + entity.
 */
export default async function ProcessingActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; assign?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab === "fiduciaries" ? "fiduciaries" : "activities";

  const [activities, purposes, processors, entities, fields, auditRows, escalations] = await Promise.all([
    db.processingActivity.findMany({
      include: {
        entity: true,
        elements: {
          include: { purposeTag: true, processor: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.purposeTag.findMany({ where: { status: "approved" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.dataProcessor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.entity.findMany({ include: { _count: { select: { userMappings: true } } }, orderBy: { name: "asc" } }),
    db.classifiedField.findMany({ include: { source: true } }),
    db.auditLogEntry.findMany({ where: { OR: [{ targetType: "ActivityElement" }, { action: "activity.element_added" }] }, orderBy: { seq: "asc" } }),
    db.escalation.findMany({ where: { type: "purpose_request" }, include: { ruledBy: true }, orderBy: { createdAt: "asc" } }),
  ]);

  // Inventory match: element name → a classified field, by first significant word
  // against the field's path or detected type. Best-effort (no FK between them).
  const fieldMatch = (elementName: string) => {
    const k = matchKey(elementName);
    return (
      fields.find((f) => f.fieldPath.toLowerCase().includes(k) || f.detectedType.toLowerCase().includes(k)) ?? null
    );
  };

  // Per-element history: merge the audit trail (by element id or name) with the
  // purpose-request escalations that reference the element. Read-only, system-generated.
  const escByElement = new Map<string, typeof escalations>();
  for (const e of escalations) {
    const ctx = decodeObject<{ elementId?: string }>(e.contextJson);
    const id = ctx?.elementId;
    if (!id) continue;
    const list = escByElement.get(id) ?? [];
    list.push(e);
    escByElement.set(id, list);
  }
  const historyFor = (elementId: string, elementName: string): HistoryItem[] => {
    const items: HistoryItem[] = [];
    for (const a of auditRows) {
      if (a.targetId !== elementId && a.targetId !== elementName) continue;
      items.push({ at: a.timestamp.toISOString(), kind: "audit", title: AUDIT_TITLE[a.action] ?? a.action, actor: `${a.actorLabel} (${a.actorRole.toUpperCase()})`, detail: null });
    }
    for (const e of escByElement.get(elementId) ?? []) {
      const ctx = decodeObject<{ proposedPurposeName?: string | null; proposedRetention?: string | null; proposedLawfulBasis?: string | null }>(e.contextJson) ?? {};
      const proposed = [ctx.proposedPurposeName && `purpose “${ctx.proposedPurposeName}”`, ctx.proposedRetention && `retention ${ctx.proposedRetention}`, ctx.proposedLawfulBasis && `basis ${ctx.proposedLawfulBasis}`].filter(Boolean).join(" · ") || null;
      items.push({ at: e.createdAt.toISOString(), kind: "requested", title: "Purpose & processor requested", actor: e.sourceRole.toUpperCase(), detail: proposed });
      if (e.status === "ruled" && e.ruledAt) {
        items.push({ at: e.ruledAt.toISOString(), kind: e.ruling === "uphold_retention" ? "rejected" : "approved", title: e.ruling === "uphold_retention" ? "Request declined" : "Request approved", actor: e.ruledBy?.name ?? "DPO", detail: e.rulingRationale ?? null });
      }
    }
    return items.sort((x, y) => x.at.localeCompare(y.at));
  };

  const activityRows: ActivityRow[] = activities.map((a) => ({
    id: a.id,
    activity: a.activity,
    lifecycleState: a.lifecycleState,
    entityId: a.entityId,
    entityName: a.entity?.name ?? null,
    elements: a.elements.map((e) => {
      const inv = fieldMatch(e.elementName);
      return {
        id: e.id,
        elementName: e.elementName,
        purposeTagId: e.purposeTagId,
        purposeName: e.purposeTag?.name ?? null,
        retention: e.purposeTag?.retention ?? null,
        lawfulBasis: e.purposeTag?.lawfulBasis ?? null,
        processorId: e.processorId,
        processorName: e.processor?.name ?? null,
        processorJurisdiction: e.processor?.jurisdiction ?? null,
        processorHasDpa: e.processor ? e.processor.dpaStatus === "active" : true,
        processorDpaId: e.processor?.dpaId ?? null,
        subjectType: e.subjectType,
        requestState: e.requestState,
        inventory: inv ? { fieldPath: inv.fieldPath, category: inv.category, sensitivityTier: inv.sensitivityTier, sourceName: inv.source.name } : null,
        history: historyFor(e.id, e.elementName),
      };
    }),
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
        titleTip="Every processing activity, broken down to the PII element. Purpose and Processor attach per element — a Loan Application uses PAN for KYC and Phone for marketing at the same time — and are assigned only through a DPO-approved request. Retention and lawful basis travel with the purpose; jurisdiction with the processor."
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

const AUDIT_TITLE: Record<string, string> = {
  "activity.element_added": "Element added",
  "activity.subject_type_set": "Subject type set",
  "activity.purpose_processor_requested": "Purpose & processor requested",
};
