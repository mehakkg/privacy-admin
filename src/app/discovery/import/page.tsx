import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import {
  ProcessingActivitiesTable,
  type SavedActivity,
} from "@/components/ProcessingActivitiesTable";
import { decodeList } from "@/lib/codec/json";

export const dynamic = "force-dynamic";

/**
 * SCREEN 7 — Processing Activities.
 *
 * One editable table replaces the old two-tile chooser and the 4-step
 * questionnaire. Activity / Purpose / Data elements / Subject type are columns
 * of one record, not sequential questions, and CSV import lands in the same
 * unsaved-row state as a manually added row — the questionnaire-vs-CSV split
 * was always two ways into one record.
 */
export default async function ProcessingActivitiesPage() {
  const [activities, purposes, fields] = await Promise.all([
    db.processingActivity.findMany({
      include: { purposeTag: true },
      orderBy: { createdAt: "desc" },
    }),
    db.purposeTag.findMany({ where: { status: "approved" }, orderBy: { name: "asc" } }),
    db.classifiedField.findMany({ select: { fieldPath: true }, distinct: ["fieldPath"] }),
  ]);

  const saved: SavedActivity[] = activities.map((a) => ({
    id: a.id,
    activity: a.activity,
    purposeTagId: a.purposeTagId,
    purposeName: a.purposeTag?.name ?? null,
    subjectType: a.subjectType,
    dataElements: decodeList(a.dataElementsJson),
    origin: a.origin,
  }));

  return (
    <Shell active="/discovery" title="Discovery / Processing activities">
      <PageHead
        crumbs={[
          { label: "Data Discovery", href: "/discovery" },
          { label: "Processing activities" },
        ]}
        title="Processing activities"
        titleTip="For data no scanner can reach — a new initiative with no system yet, or an inventory kept by hand. Add rows or import a CSV; both land in the same table and commit together."
      />

      <ProcessingActivitiesTable
        saved={saved}
        purposes={purposes.map((p) => ({ id: p.id, name: p.name }))}
        inventoryFields={fields.map((f) => f.fieldPath)}
      />
    </Shell>
  );
}
