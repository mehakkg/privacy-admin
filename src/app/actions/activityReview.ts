"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { reasonMeta } from "@/lib/activities/logic";
import type { ReviewReasonType } from "@/lib/activities/types";

export interface RvResult { ok: boolean; error?: string; nextReviewDue?: string }
function touch(activityId: string) { revalidatePath(`/data-map/processing-activities/${activityId}`, "page"); revalidatePath("/data-map/processing-activities", "page"); }
function plusMonths(d: Date, m: number): Date { const n = new Date(d); n.setMonth(n.getMonth() + m); return n; }

export interface ReasonRow { id: string; type: ReviewReasonType; detail: string; status: "open" | "resolved" | "dismissed"; dismissNote: string | null; verb: string; dismissible: boolean }
export interface ReasonsView { lastConfirmed: string | null; reasons: ReasonRow[] }

export async function getActivityReasonsAction(activityId: string): Promise<ReasonsView> {
  const [act, reasons] = await Promise.all([
    db.processingActivity.findUnique({ where: { id: activityId }, select: { lastReviewedAt: true } }),
    db.reviewReason.findMany({ where: { activityId }, orderBy: { detectedAt: "asc" } }),
  ]);
  return {
    lastConfirmed: act?.lastReviewedAt?.toISOString() ?? null,
    reasons: reasons.map((r) => ({ id: r.id, type: r.type as ReviewReasonType, detail: r.detail, status: r.status as ReasonRow["status"], dismissNote: r.dismissNote, verb: reasonMeta(r.type as ReviewReasonType).verb, dismissible: reasonMeta(r.type as ReviewReasonType).dismissible })),
  };
}

export async function resolveReasonAction(activityId: string, reasonId: string): Promise<RvResult> {
  const { actor } = await getSession();
  await db.reviewReason.update({ where: { id: reasonId }, data: { status: "resolved", resolvedBy: actor.label, resolvedAt: new Date() } });
  touch(activityId);
  return { ok: true };
}

export async function dismissReasonAction(activityId: string, reasonId: string, note: string): Promise<RvResult> {
  const { actor } = await getSession();
  if (note.trim().length < 5) return { ok: false, error: "Add a short note (at least 5 characters)." };
  await db.reviewReason.update({ where: { id: reasonId }, data: { status: "dismissed", dismissNote: note.trim(), resolvedBy: actor.label, resolvedAt: new Date() } });
  touch(activityId);
  return { ok: true };
}

export async function confirmReviewAction(activityId: string): Promise<RvResult> {
  const open = await db.reviewReason.count({ where: { activityId, status: "open" } });
  if (open > 0) return { ok: false, error: `${open} change${open === 1 ? "" : "s"} still need a decision.` };
  const now = new Date();
  const due = plusMonths(now, 12);
  await db.processingActivity.update({ where: { id: activityId }, data: { lifecycleState: "active", lastReviewedAt: now, nextReviewDue: due, version: { increment: 1 } } });
  touch(activityId);
  return { ok: true, nextReviewDue: due.toISOString() };
}

export async function flagForReviewAction(activityId: string, note: string): Promise<RvResult> {
  const { actor } = await getSession();
  if (!note.trim()) return { ok: false, error: "Say what should be checked." };
  await db.reviewReason.create({ data: { activityId, type: "manual", detail: `${actor.label} flagged this for review: ${note.trim()}`, status: "open" } });
  await db.processingActivity.update({ where: { id: activityId }, data: { lifecycleState: "under_review", version: { increment: 1 } } });
  touch(activityId);
  return { ok: true };
}

export async function retireActivityAction(activityId: string, reason: string): Promise<RvResult> {
  if (!reason.trim()) return { ok: false, error: "A reason is required." };
  await db.processingActivity.update({ where: { id: activityId }, data: { lifecycleState: "retired", retiredAt: new Date(), retireReason: reason.trim(), version: { increment: 1 } } });
  touch(activityId);
  return { ok: true };
}

export async function reactivateActivityAction(activityId: string): Promise<RvResult> {
  await db.processingActivity.update({ where: { id: activityId }, data: { lifecycleState: "draft", retiredAt: null, retireReason: null, version: { increment: 1 } } });
  touch(activityId);
  return { ok: true };
}

/** Dev control (Simulate event): create a review reason + flag the activity. */
export async function simulateReviewEventAction(activityId: string, type: ReviewReasonType, detail: string): Promise<RvResult> {
  const sourceRef = `sim:${type}`;
  const exists = await db.reviewReason.findFirst({ where: { activityId, type, sourceRef, status: "open" } });
  if (!exists) {
    await db.reviewReason.create({ data: { activityId, type, detail, sourceRef, status: "open" } });
    await db.processingActivity.updateMany({ where: { id: activityId, lifecycleState: "active" }, data: { lifecycleState: "under_review" } });
  }
  touch(activityId);
  return { ok: true };
}
