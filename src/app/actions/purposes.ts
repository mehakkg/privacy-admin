"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getPurposePicker, type PurposePickerData } from "@/lib/engines/purposes";

export async function getPurposePickerAction(activityId: string): Promise<PurposePickerData> {
  return getPurposePicker(activityId);
}

export interface PResult { ok: boolean; error?: string; purposeId?: string }
function touch(activityId?: string) {
  revalidatePath("/data-map/processing-activities", "layout");
  revalidatePath("/data-map/purposes", "page");
  if (activityId) revalidatePath(`/data-map/processing-activities/${activityId}`, "page");
}

export interface PurposeInput { name: string; description: string; legalBasis: "consent" | "legitimate_use"; legitimateUseType?: string; amount: number; unit: "months" | "years"; trigger: string; justification: string }

function validate(input: PurposeInput, requireAll: boolean): string | null {
  const n = input.name.trim();
  if (n.length < 3 || n.length > 80) return "Use a name of 3 to 80 characters.";
  if (!requireAll) return null;
  if (input.description.trim().length < 20 || input.description.trim().length > 400) return "Describe what it is used for (20 to 400 characters).";
  if (input.legalBasis === "legitimate_use" && !input.legitimateUseType) return "Choose a legitimate-use type.";
  if (!(input.amount >= 1 && input.amount <= 99)) return "Retention amount must be 1 to 99.";
  if (!input.trigger.trim()) return "Choose a retention trigger.";
  if (input.justification.trim().length < 20 || input.justification.trim().length > 400) return "Add a short note for your DPO (20 to 400 characters).";
  return null;
}

async function nameTaken(name: string, excludeId?: string): Promise<boolean> {
  const tags = await db.purposeTag.findMany({ select: { id: true, name: true } });
  return tags.some((t) => t.id !== excludeId && t.name.trim().toLowerCase() === name.trim().toLowerCase());
}

export async function addExistingPurposeAction(activityId: string, purposeId: string): Promise<PResult> {
  const { actor } = await getSession();
  const existing = await db.activityPurpose.findFirst({ where: { activityId, purposeTagId: purposeId } });
  if (!existing) await db.activityPurpose.create({ data: { activityId, purposeTagId: purposeId, linkState: "confirmed", processorMode: "unanswered", addedBy: actor.label } });
  touch(activityId);
  return { ok: true, purposeId };
}

export async function removePurposeFromActivityAction(activityId: string, purposeId: string): Promise<PResult> {
  await db.activityPurpose.deleteMany({ where: { activityId, purposeTagId: purposeId } });
  touch(activityId);
  return { ok: true };
}

export async function createPurposeAction(activityId: string | null, input: PurposeInput, submit: boolean): Promise<PResult> {
  const { actor } = await getSession();
  const err = validate(input, submit); // Save as draft needs only a name
  if (err) return { ok: false, error: err };
  if (await nameTaken(input.name)) return { ok: false, error: "A purpose with this name already exists." };
  const state = submit ? "waiting_for_dpo" : "draft";
  const retention = `${input.amount} ${input.unit} ${input.trigger}`.trim();
  const tag = await db.purposeTag.create({ data: {
    name: input.name.trim(), description: input.description.trim(), status: submit ? "pending_dpo_approval" : "draft",
    lawfulBasis: input.legalBasis, retention, proposedBy: actor.label, proposedAt: new Date(), approvedBy: "", approvedAt: new Date(0),
    purposeVersions: { create: { number: 1, state, name: input.name.trim(), description: input.description.trim(), legalBasis: input.legalBasis, legitimateUseType: input.legitimateUseType ?? null, retentionAmount: input.amount, retentionUnit: input.unit, retentionTrigger: input.trigger, justification: input.justification.trim(), submittedBy: submit ? actor.label : null, submittedAt: submit ? new Date() : null, consent: input.legalBasis === "consent" ? "not_linked" : "not_required" } },
  } });
  if (activityId) await db.activityPurpose.create({ data: { activityId, purposeTagId: tag.id, linkState: "confirmed", processorMode: "unanswered", addedBy: actor.label } });
  touch(activityId ?? undefined);
  return { ok: true, purposeId: tag.id };
}

export async function editPurposeAction(purposeId: string, input: PurposeInput, submit: boolean, activityId?: string): Promise<PResult> {
  const { actor } = await getSession();
  const err = validate(input, submit);
  if (err) return { ok: false, error: err };
  if (await nameTaken(input.name, purposeId)) return { ok: false, error: "A purpose with this name already exists." };
  const tag = await db.purposeTag.findUnique({ where: { id: purposeId }, include: { purposeVersions: true } });
  if (!tag) return { ok: false, error: "No such purpose." };
  const versions = [...tag.purposeVersions].sort((a, b) => b.number - a.number);
  const latest = versions[0];
  const hasApproved = versions.some((v) => v.state === "approved");
  const nonApproved = versions.find((v) => v.state !== "approved" && v.state !== "retired");
  const state = submit ? "waiting_for_dpo" : "draft";
  const retention = `${input.amount} ${input.unit} ${input.trigger}`.trim();
  const vData = { state, name: input.name.trim(), description: input.description.trim(), legalBasis: input.legalBasis, legitimateUseType: input.legitimateUseType ?? null, retentionAmount: input.amount, retentionUnit: input.unit, retentionTrigger: input.trigger, justification: input.justification.trim(), submittedBy: submit ? actor.label : null, submittedAt: submit ? new Date() : null, consent: input.legalBasis === "consent" ? "not_linked" : "not_required", decisionComment: null };

  if (hasApproved && !nonApproved) {
    // Create a NEW version; the approved one stays in force.
    await db.purposeVersion.create({ data: { purposeId, number: (latest?.number ?? 0) + 1, ...vData } });
  } else if (nonApproved) {
    // Edit the existing non-approved version in place.
    await db.purposeVersion.update({ where: { id: nonApproved.id }, data: vData });
  } else {
    await db.purposeVersion.create({ data: { purposeId, number: (latest?.number ?? 0) + 1, ...vData } });
  }
  await db.purposeTag.update({ where: { id: purposeId }, data: { name: input.name.trim(), description: input.description.trim(), lawfulBasis: input.legalBasis, status: submit ? "pending_dpo_approval" : (hasApproved ? "approved" : "draft") } });
  touch(activityId);
  return { ok: true, purposeId };
}

export async function submitPurposeAction(purposeId: string, activityId?: string): Promise<PResult> {
  const { actor } = await getSession();
  const tag = await db.purposeTag.findUnique({ where: { id: purposeId }, include: { purposeVersions: true } });
  if (!tag) return { ok: false, error: "No such purpose." };
  const nonApproved = [...tag.purposeVersions].sort((a, b) => b.number - a.number).find((v) => v.state !== "approved" && v.state !== "retired");
  if (!nonApproved) return { ok: false, error: "Nothing to submit." };
  await db.purposeVersion.update({ where: { id: nonApproved.id }, data: { state: "waiting_for_dpo", submittedBy: actor.label, submittedAt: new Date() } });
  await db.purposeTag.update({ where: { id: purposeId }, data: { status: "pending_dpo_approval" } });
  touch(activityId);
  return { ok: true };
}

export async function withdrawPurposeAction(purposeId: string, activityId?: string): Promise<PResult> {
  const tag = await db.purposeTag.findUnique({ where: { id: purposeId }, include: { purposeVersions: true } });
  if (!tag) return { ok: false, error: "No such purpose." };
  const waiting = [...tag.purposeVersions].sort((a, b) => b.number - a.number).find((v) => v.state === "waiting_for_dpo");
  if (!waiting) return { ok: false, error: "Nothing waiting." };
  await db.purposeVersion.update({ where: { id: waiting.id }, data: { state: "draft", submittedBy: null, submittedAt: null } });
  const stillApproved = tag.purposeVersions.some((v) => v.state === "approved");
  await db.purposeTag.update({ where: { id: purposeId }, data: { status: stillApproved ? "approved" : "draft" } });
  touch(activityId);
  return { ok: true };
}
