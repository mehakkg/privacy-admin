"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getPurposeProcessors, getVendorOptions, type PurposeProcessorsView, type VendorOption } from "@/lib/engines/activityProcessors";

export interface PrResult { ok: boolean; error?: string }
function touch(activityId: string) { revalidatePath(`/data-map/processing-activities/${activityId}`, "page"); revalidatePath("/data-map/processing-activities", "page"); }

export async function getPurposeProcessorsAction(activityId: string, purposeId: string): Promise<PurposeProcessorsView> { return getPurposeProcessors(activityId, purposeId); }
export async function getVendorOptionsAction(): Promise<VendorOption[]> { return getVendorOptions(); }

async function seg(activityId: string, purposeId: string) { return db.activityPurpose.findFirst({ where: { activityId, purposeTagId: purposeId } }); }

export async function setProcessorModeAction(activityId: string, purposeId: string, mode: "uses_processors" | "none"): Promise<PrResult> {
  const { actor } = await getSession();
  const s = await seg(activityId, purposeId);
  if (!s) return { ok: false, error: "This purpose is not on the activity." };
  if (mode === "none") {
    await db.activityPurposeProcessor.deleteMany({ where: { activityPurposeId: s.id } });
    await db.activityPurpose.update({ where: { id: s.id }, data: { processorMode: "none", processorId: null, noProcessorBy: actor.label, noProcessorAt: new Date() } });
  } else {
    await db.activityPurpose.update({ where: { id: s.id }, data: { processorMode: "uses_processors", noProcessorBy: null, noProcessorAt: null } });
  }
  touch(activityId);
  return { ok: true };
}

export async function addProcessorAction(activityId: string, purposeId: string, vendorIds: string[]): Promise<PrResult> {
  const { actor } = await getSession();
  const s = await seg(activityId, purposeId);
  if (!s) return { ok: false, error: "This purpose is not on the activity." };
  for (const vid of vendorIds) {
    await db.activityPurposeProcessor.upsert({ where: { activityPurposeId_vendorId: { activityPurposeId: s.id, vendorId: vid } }, update: { linkState: "confirmed" }, create: { activityPurposeId: s.id, vendorId: vid, linkState: "confirmed", addedBy: actor.label } });
  }
  await db.activityPurpose.update({ where: { id: s.id }, data: { processorMode: "uses_processors", noProcessorBy: null, noProcessorAt: null } });
  touch(activityId);
  return { ok: true };
}

export async function acceptSuggestedProcessorAction(activityId: string, purposeId: string, vendorId: string): Promise<PrResult> {
  return addProcessorAction(activityId, purposeId, [vendorId]);
}

export async function removeProcessorAction(activityId: string, purposeId: string, linkId: string): Promise<PrResult> {
  const s = await seg(activityId, purposeId);
  if (!s) return { ok: false, error: "This purpose is not on the activity." };
  if (linkId.startsWith("legacy:")) await db.activityPurpose.update({ where: { id: s.id }, data: { processorId: null } });
  else await db.activityPurposeProcessor.delete({ where: { id: linkId } }).catch(() => {});
  touch(activityId);
  return { ok: true };
}
