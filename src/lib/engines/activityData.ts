import { db } from "@/lib/db";
import { purposeState } from "@/lib/activities/types";
import { tagToPurpose } from "@/lib/engines/purposes";

/**
 * Data links for a purpose segment (Screen 6 — Data) + the data picker's
 * suggestions and browse tree. A data link is an ActivityPurposeElement row.
 */

export interface DataRow { linkId: string; fieldId: string | null; path: string; system: string; dataType: string; sensitivity: string; state: "confirmed" | "suggested" }
export interface PurposeDataView { segmentId: string | null; approved: boolean; rows: DataRow[]; suggestedCount: number }

async function findSegment(activityId: string, purposeId: string) {
  return db.activityPurpose.findFirst({ where: { activityId, purposeTagId: purposeId } });
}

export async function getPurposeData(activityId: string, purposeId: string): Promise<PurposeDataView> {
  const [seg, tag] = await Promise.all([
    findSegment(activityId, purposeId),
    db.purposeTag.findUnique({ where: { id: purposeId }, include: { purposeVersions: true } }),
  ]);
  const approved = tag ? purposeState(tagToPurpose(tag as never)).approvedForUse : false;
  if (!seg) return { segmentId: null, approved, rows: [], suggestedCount: 0 };
  const els = await db.activityPurposeElement.findMany({ where: { activityPurposeId: seg.id } });
  const fieldIds = els.map((e) => e.classifiedFieldId).filter(Boolean) as string[];
  const fields = fieldIds.length ? await db.classifiedField.findMany({ where: { id: { in: fieldIds } }, include: { source: { select: { name: true } } } }) : [];
  const byId = new Map(fields.map((f) => [f.id, f]));
  const rows: DataRow[] = els.map((e) => {
    const f = e.classifiedFieldId ? byId.get(e.classifiedFieldId) : null;
    return { linkId: e.id, fieldId: e.classifiedFieldId, path: f?.fieldPath ?? e.fieldName, system: f?.source.name ?? "—", dataType: f ? (f.overriddenType ?? f.detectedType) : "—", sensitivity: f?.sensitivityTier ?? "Not classified", state: e.linkState === "suggested" ? "suggested" : "confirmed" };
  }).sort((a, b) => a.system.localeCompare(b.system) || a.path.localeCompare(b.path));
  return { segmentId: seg.id, approved, rows, suggestedCount: rows.filter((r) => r.state === "suggested").length };
}

export interface PickerField { id: string; path: string; dataType: string; sensitivity: string; reason?: string }
export interface PickerSystem { name: string; tables: { name: string; fields: PickerField[] }[] }
export interface DataPickerView { suggested: PickerField[]; systems: PickerSystem[] }

export async function getDataPicker(activityId: string, purposeId: string): Promise<DataPickerView> {
  const seg = await findSegment(activityId, purposeId);
  const linkedIds = new Set<string>();
  if (seg) { const els = await db.activityPurposeElement.findMany({ where: { activityPurposeId: seg.id }, select: { classifiedFieldId: true } }); for (const e of els) if (e.classifiedFieldId) linkedIds.add(e.classifiedFieldId); }

  const all = await db.classifiedField.findMany({ include: { source: { select: { name: true } } } });
  const avail = all.filter((f) => !linkedIds.has(f.id));

  // Systems the activity already uses (from its other segments' linked fields).
  const otherEls = await db.activityPurposeElement.findMany({ where: { activityPurpose: { activityId } }, select: { classifiedFieldId: true } });
  const usedFieldIds = new Set(otherEls.map((e) => e.classifiedFieldId).filter(Boolean) as string[]);
  const usedSystems = new Set(all.filter((f) => usedFieldIds.has(f.id)).map((f) => f.source.name));

  // Fields linked to THIS purpose in OTHER activities → strong suggestion.
  const samePurposeEls = await db.activityPurposeElement.findMany({ where: { activityPurpose: { purposeTagId: purposeId, activityId: { not: activityId } } }, select: { classifiedFieldId: true } });
  const samePurposeFieldIds = new Set(samePurposeEls.map((e) => e.classifiedFieldId).filter(Boolean) as string[]);

  const suggested: PickerField[] = [];
  for (const f of avail) {
    let reason: string | null = null;
    if (samePurposeFieldIds.has(f.id)) reason = "Linked to this purpose elsewhere";
    else if (usedSystems.has(f.source.name)) reason = "Same system as linked fields";
    if (reason) suggested.push({ id: f.id, path: f.fieldPath, dataType: f.overriddenType ?? f.detectedType, sensitivity: f.sensitivityTier, reason });
    if (suggested.length >= 5) break;
  }

  // Browse tree: system → table (path prefix before the first dot) → fields.
  const bySystem = new Map<string, Map<string, PickerField[]>>();
  for (const f of avail) {
    const sys = f.source.name; const table = f.fieldPath.includes(".") ? f.fieldPath.split(".")[0] : "(root)";
    const tables = bySystem.get(sys) ?? bySystem.set(sys, new Map()).get(sys)!;
    (tables.get(table) ?? tables.set(table, []).get(table)!).push({ id: f.id, path: f.fieldPath, dataType: f.overriddenType ?? f.detectedType, sensitivity: f.sensitivityTier });
  }
  const systems: PickerSystem[] = [...bySystem.entries()].map(([name, tables]) => ({ name, tables: [...tables.entries()].map(([t, fields]) => ({ name: t, fields: fields.sort((a, b) => a.path.localeCompare(b.path)) })).sort((a, b) => a.name.localeCompare(b.name)) })).sort((a, b) => a.name.localeCompare(b.name));

  return { suggested, systems };
}
