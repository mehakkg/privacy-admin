"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { purposeState } from "@/lib/activities/types";
import { tagToPurpose } from "@/lib/engines/purposes";
import { getPurposeData, getDataPicker, type PurposeDataView, type DataPickerView } from "@/lib/engines/activityData";

export interface DResult { ok: boolean; error?: string; added?: number }
function touch(activityId: string) { revalidatePath(`/data-map/processing-activities/${activityId}`, "page"); revalidatePath("/data-map/processing-activities", "page"); revalidatePath("/discovery/inventory", "page"); }

export async function getPurposeDataAction(activityId: string, purposeId: string): Promise<PurposeDataView> { return getPurposeData(activityId, purposeId); }
export async function getDataPickerAction(activityId: string, purposeId: string): Promise<DataPickerView> { return getDataPicker(activityId, purposeId); }

async function isApproved(purposeId: string): Promise<boolean> {
  const tag = await db.purposeTag.findUnique({ where: { id: purposeId }, include: { purposeVersions: true } });
  return tag ? purposeState(tagToPurpose(tag as never)).approvedForUse : false;
}
/** Keep Data inventory's field↔purpose links in sync: ACTIVE (confirmed + approved) only. */
async function syncInventory(fieldId: string | null, purposeId: string, active: boolean, actor: string) {
  if (!fieldId) return;
  if (active) await db.inventoryFieldPurpose.upsert({ where: { fieldId_purposeTagId: { fieldId, purposeTagId: purposeId } }, update: {}, create: { fieldId, purposeTagId: purposeId, assignedBy: actor } });
  else {
    // Remove only when no other confirmed link ties this field to this purpose.
    const others = await db.activityPurposeElement.count({ where: { classifiedFieldId: fieldId, linkState: "confirmed", activityPurpose: { purposeTagId: purposeId } } });
    if (others === 0) await db.inventoryFieldPurpose.deleteMany({ where: { fieldId, purposeTagId: purposeId } });
  }
}

export async function addDataAction(activityId: string, purposeId: string, fieldIds: string[]): Promise<DResult> {
  const { actor } = await getSession();
  const seg = await db.activityPurpose.findFirst({ where: { activityId, purposeTagId: purposeId } });
  if (!seg) return { ok: false, error: "This purpose is not on the activity." };
  const existing = new Set((await db.activityPurposeElement.findMany({ where: { activityPurposeId: seg.id }, select: { classifiedFieldId: true } })).map((e) => e.classifiedFieldId));
  const fields = await db.classifiedField.findMany({ where: { id: { in: fieldIds } }, select: { id: true, fieldPath: true } });
  const approved = await isApproved(purposeId);
  let added = 0;
  for (const f of fields) {
    if (existing.has(f.id)) continue;
    await db.activityPurposeElement.create({ data: { activityPurposeId: seg.id, fieldName: f.fieldPath, classifiedFieldId: f.id, linkState: "confirmed", addedBy: actor.label } });
    await syncInventory(f.id, purposeId, approved, actor.label);
    added++;
  }
  touch(activityId);
  return { ok: true, added };
}

export async function removeDataAction(activityId: string, linkId: string, purposeId: string): Promise<DResult> {
  const { actor } = await getSession();
  const el = await db.activityPurposeElement.findUnique({ where: { id: linkId } });
  await db.activityPurposeElement.delete({ where: { id: linkId } }).catch(() => {});
  if (el) await syncInventory(el.classifiedFieldId, purposeId, false, actor.label);
  touch(activityId);
  return { ok: true };
}

export async function acceptSuggestedDataAction(activityId: string, linkId: string, purposeId: string): Promise<DResult> {
  const { actor } = await getSession();
  const el = await db.activityPurposeElement.update({ where: { id: linkId }, data: { linkState: "confirmed" } });
  if (await isApproved(purposeId)) await syncInventory(el.classifiedFieldId, purposeId, true, actor.label);
  touch(activityId);
  return { ok: true };
}

export async function acceptAllSuggestedDataAction(activityId: string, purposeId: string): Promise<DResult> {
  const { actor } = await getSession();
  const seg = await db.activityPurpose.findFirst({ where: { activityId, purposeTagId: purposeId } });
  if (!seg) return { ok: false, error: "This purpose is not on the activity." };
  const suggested = await db.activityPurposeElement.findMany({ where: { activityPurposeId: seg.id, linkState: "suggested" } });
  const approved = await isApproved(purposeId);
  for (const e of suggested) { await db.activityPurposeElement.update({ where: { id: e.id }, data: { linkState: "confirmed" } }); if (approved) await syncInventory(e.classifiedFieldId, purposeId, true, actor.label); }
  touch(activityId);
  return { ok: true, added: suggested.length };
}
