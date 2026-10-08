"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getReview, snapshotInputForActivity, type ReviewView } from "@/lib/engines/activities";
import { isCombinedGovernance } from "@/lib/governance";
import { buildSnapshot, sha256Hex8, diffSnapshots, resolveWrite, type LastWriter } from "@/lib/activities/versions";
import type { Principal } from "@/lib/activities/types";

export interface Attestations { accurate: boolean; authority: boolean; reviewBy: string }
export interface ActivateOpts { reason?: string; attestations?: Attestations }

/**
 * Create the signed ActivityVersion for an activation (M1). number 1 on first
 * activation; from 2 a change note is required. The previous active version is
 * superseded. The hash is tamper evidence over the canonical snapshot.
 */
async function createActivityVersion(activityId: string, actorLabel: string, nextReviewDueISO: string, opts?: ActivateOpts): Promise<{ ok: boolean; error?: string; number?: number; hash?: string }> {
  const input = await snapshotInputForActivity(activityId);
  if (!input) return { ok: false, error: "This activity no longer exists." };
  const prev = await db.activityVersion.findFirst({ where: { activityId, state: "active" }, orderBy: { number: "desc" } });
  const number = (prev?.number ?? 0) + 1;
  if (number >= 2 && (opts?.reason ?? "").trim().length < 10) return { ok: false, error: "Add a change note of at least 10 characters." };
  const snapshot = buildSnapshot(input);
  const hash = await sha256Hex8(snapshot);
  const diff = prev ? JSON.stringify(diffSnapshots(prev.snapshot, snapshot)) : null;
  const attestations: Attestations = opts?.attestations ?? { accurate: true, authority: true, reviewBy: nextReviewDueISO };
  if (prev) await db.activityVersion.update({ where: { id: prev.id }, data: { state: "superseded" } });
  await db.activityVersion.create({ data: { activityId, number, state: "active", snapshot, hash, activatedBy: actorLabel, reason: number >= 2 ? (opts?.reason ?? null) : null, attestationsJson: JSON.stringify(attestations), diffJson: diff } });
  return { ok: true, number, hash };
}

async function canGovern(role: string): Promise<boolean> { return role === "dpo" || role === "ciso" || (role === "admin" && (await isCombinedGovernance())); }
function plusMonths(d: Date, m: number): Date { const n = new Date(d); n.setMonth(n.getMonth() + m); return n; }

export interface ActResult { ok: boolean; error?: string; id?: string }
const LIST = "/data-map/processing-activities";
function touch(id?: string) { revalidatePath(LIST, "page"); if (id) revalidatePath(`${LIST}/${id}`, "page"); revalidatePath("/discovery/inventory", "page"); }

async function nameClash(name: string, entityId: string | null, excludeId?: string): Promise<boolean> {
  const rows = await db.processingActivity.findMany({ where: { lifecycleState: { not: "retired" }, ...(entityId ? { entityId } : {}) }, select: { id: true, activity: true } });
  return rows.some((r) => r.id !== excludeId && r.activity.trim().toLowerCase() === name.trim().toLowerCase());
}

export async function createDraftActivityAction(name: string): Promise<ActResult> {
  const { actor } = await getSession();
  const n = name.trim();
  if (n.length < 3 || n.length > 80) return { ok: false, error: "Use a name of 3 to 80 characters." };
  if (await nameClash(n, null)) return { ok: false, error: `An activity named ${n} already exists.` };
  const row = await db.processingActivity.create({ data: { activity: n, origin: "manual", lifecycleState: "draft", ownerName: actor.label, createdBy: actor.label, principalsJson: "[]" } });
  touch(); return { ok: true, id: row.id };
}

// --- Add activity (2-step) --------------------------------------------------

export interface AddActivityData {
  suggestions: { id: string; name: string; sub: string; purposeId: string | null }[];
  templates: { id: string; name: string; sub: string }[];
  entities: { id: string; name: string }[]; multiEntity: boolean; currentUser: string;
}
export async function getAddActivityDataAction(): Promise<AddActivityData> {
  const { actor } = await getSession();
  const [sugs, templates, entities, cfg] = await Promise.all([
    db.ropaSuggestion.findMany({ where: { status: "pending" }, include: { source: { select: { name: true } }, purposeTag: { select: { id: true, name: true } } } }),
    db.activityTemplate.findMany({ orderBy: { name: "asc" } }),
    db.entity.findMany({ select: { id: true, name: true } }),
    db.integrationConfig.findUnique({ where: { id: "singleton" }, select: { paMultiEntity: true } }),
  ]);
  return {
    suggestions: sugs.map((s) => {
      const fields = (JSON.parse(s.fieldIdsJson || "[]") as string[]).length;
      const conf = s.purposeTagId ? "high confidence" : "no matching purpose yet";
      return { id: s.id, name: `${s.purposeTag?.name ?? "New grouping"} — ${s.source?.name ?? "Unknown source"}`, sub: `${fields} fields · ${s.purposeTag ? `Suggested purpose: ${s.purposeTag.name} · ` : ""}${conf}`, purposeId: s.purposeTagId };
    }),
    templates: templates.map((t) => { const ps = JSON.parse(t.purposeIdsJson || "[]") as string[]; const types = JSON.parse(t.typicalDataTypesJson || "[]") as string[]; return { id: t.id, name: t.name, sub: `${ps.length} typical purpose${ps.length === 1 ? "" : "s"} · ${types.length} typical data types` }; }),
    entities, multiEntity: cfg?.paMultiEntity ?? false, currentUser: actor.label,
  };
}

export interface StartInput { start: "blank" | "template" | "suggestion"; ref?: string; name: string; ownerName: string; entityId?: string }
export async function createActivityFromStartAction(input: StartInput): Promise<ActResult> {
  const { actor } = await getSession();
  const n = input.name.trim();
  if (n.length < 3 || n.length > 80) return { ok: false, error: "Use a name of 3 to 80 characters." };
  const cfg = await db.integrationConfig.findUnique({ where: { id: "singleton" }, select: { paMultiEntity: true } });
  const multi = cfg?.paMultiEntity ?? false;
  if (multi && !input.entityId) return { ok: false, error: "Choose an entity." };
  if (await nameClash(n, input.entityId ?? null)) return { ok: false, error: `An activity named ${n} already exists.` };

  const sourceRef = input.start !== "blank" ? input.ref ?? null : null;
  const activity = await db.processingActivity.create({ data: { activity: n, origin: input.start === "blank" ? "manual" : input.start === "suggestion" ? "ropa_suggested" : "manual", sourceRef, lifecycleState: "draft", ownerName: input.ownerName || actor.label, createdBy: actor.label, entityId: input.entityId ?? null, principalsJson: "[]" } });

  if (input.start === "template" && input.ref) {
    const tpl = await db.activityTemplate.findUnique({ where: { id: input.ref } });
    if (tpl) {
      const purposeIds = JSON.parse(tpl.purposeIdsJson || "[]") as string[];
      const types = JSON.parse(tpl.typicalDataTypesJson || "[]") as string[];
      const fields = await db.classifiedField.findMany({ where: { OR: [{ detectedType: { in: types } }, { overriddenType: { in: types } }] }, select: { id: true, fieldPath: true }, take: 20 });
      for (const pid of purposeIds) {
        const seg = await db.activityPurpose.create({ data: { activityId: activity.id, purposeTagId: pid, linkState: "suggested", processorMode: "unanswered", addedBy: actor.label } });
        for (const f of fields.slice(0, 6)) await db.activityPurposeElement.create({ data: { activityPurposeId: seg.id, fieldName: f.fieldPath, classifiedFieldId: f.id, linkState: "suggested", addedBy: actor.label } });
      }
    }
  } else if (input.start === "suggestion" && input.ref) {
    const sug = await db.ropaSuggestion.findUnique({ where: { id: input.ref } });
    if (sug) {
      const fieldIds = JSON.parse(sug.fieldIdsJson || "[]") as string[];
      const fields = await db.classifiedField.findMany({ where: { id: { in: fieldIds } }, select: { id: true, fieldPath: true } });
      const seg = await db.activityPurpose.create({ data: { activityId: activity.id, purposeTagId: sug.purposeTagId, linkState: "suggested", processorMode: "unanswered", addedBy: actor.label } });
      for (const f of fields) await db.activityPurposeElement.create({ data: { activityPurposeId: seg.id, fieldName: f.fieldPath, classifiedFieldId: f.id, linkState: "suggested", addedBy: actor.label } });
      await db.ropaSuggestion.update({ where: { id: sug.id }, data: { status: "accepted", activityId: activity.id } });
    }
  }
  touch(activity.id);
  return { ok: true, id: activity.id };
}

// --- Basics (autosave, optimistic locking) ----------------------------------

export interface BasicsPatch { name?: string; description?: string; ownerName?: string | null; department?: string | null; entityId?: string | null; principals?: Principal[] }
export interface SaveResult {
  ok: boolean; error?: string; version?: number; savedAt?: string;
  /** M1 conflict model: a different session wrote these fields since baseRev. */
  conflictFields?: string[]; theirs?: Record<string, unknown>; by?: string; at?: string; currentVersion?: number;
}

type BasicsRow = { version: number; entityId: string | null; activity: string; description: string | null; ownerName: string | null; department: string | null; principalsJson: string; lastWriterJson: string | null };
function currentFieldValue(row: BasicsRow, field: string): unknown {
  switch (field) {
    case "name": return row.activity;
    case "description": return row.description;
    case "ownerName": return row.ownerName;
    case "department": return row.department;
    case "entityId": return row.entityId;
    case "principals": return JSON.parse(row.principalsJson || "[]");
    default: return null;
  }
}

/**
 * Autosave one or more Basics fields (M1 conflict model). The write carries the
 * rev the editor last saw (baseRev) and a per-tab sessionId. resolveWrite() decides:
 * same-session stale writes rebase silently, different fields merge, and only a
 * different session on an OVERLAPPING field is a true conflict — returned to the
 * caller as the field(s), the other value and who wrote it, so the field can offer
 * "Keep mine / Use theirs". Never a page reload, never a discard.
 */
export async function setBasicsAction(id: string, patch: BasicsPatch, baseRev: number, sessionId: string): Promise<SaveResult> {
  const { actor } = await getSession();
  const row = await db.processingActivity.findUnique({ where: { id }, select: { version: true, entityId: true, activity: true, description: true, ownerName: true, department: true, principalsJson: true, lastWriterJson: true } });
  if (!row) return { ok: false, error: "This activity no longer exists." };
  const fields = Object.keys(patch);
  const lastWriter: LastWriter | null = row.lastWriterJson ? JSON.parse(row.lastWriterJson) : null;
  const outcome = resolveWrite({ baseRev, currentRev: row.version, lastWriter, sessionId, fields });
  if (outcome.action === "conflict") {
    const theirs: Record<string, unknown> = {};
    for (const f of outcome.fields) theirs[f] = currentFieldValue(row, f);
    return { ok: false, conflictFields: outcome.fields, theirs, by: lastWriter?.by ?? "Someone", at: lastWriter?.at ?? new Date().toISOString(), currentVersion: row.version };
  }
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (n.length < 3 || n.length > 80) return { ok: false, error: "Use a name of 3 to 80 characters." };
    if (await nameClash(n, patch.entityId ?? row.entityId ?? null, id)) return { ok: false, error: `An activity named ${n} already exists.` };
  }
  const data: Record<string, unknown> = { version: { increment: 1 }, lastWriterJson: JSON.stringify({ sessionId, by: actor.label, at: new Date().toISOString(), fields }) };
  if (patch.name !== undefined) data.activity = patch.name.trim();
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.ownerName !== undefined) data.ownerName = patch.ownerName;
  if (patch.department !== undefined) data.department = patch.department;
  if (patch.entityId !== undefined) data.entityId = patch.entityId;
  if (patch.principals !== undefined) data.principalsJson = JSON.stringify(patch.principals);
  const updated = await db.processingActivity.update({ where: { id }, data, select: { version: true } });
  touch(id);
  return { ok: true, version: updated.version, savedAt: new Date().toISOString() };
}

/**
 * DEV-ONLY (M1 conflict demo): make it look as if another editor (A. Rao, a
 * different session) just changed one field. Bumps rev and records lastWriter for
 * that field, so the current editor's next save of the same field conflicts.
 */
export async function simulateAnotherEditorAction(id: string, field: string): Promise<ActResult> {
  const demoValue: Record<string, unknown> = { ownerName: "A. Rao", department: "Marketing", name: undefined };
  const data: Record<string, unknown> = { version: { increment: 1 }, lastWriterJson: JSON.stringify({ sessionId: `sim-${Math.random().toString(36).slice(2, 8)}`, by: "A. Rao", at: new Date().toISOString(), fields: [field] }) };
  if (field === "ownerName") data.ownerName = demoValue.ownerName;
  else if (field === "department") data.department = demoValue.department;
  await db.processingActivity.update({ where: { id }, data });
  touch(id);
  return { ok: true };
}

// --- Activate / DPO review of the activity ----------------------------------

export async function getReviewAction(activityId: string): Promise<ReviewView | null> { return getReview(activityId); }

export async function activateActivityAction(activityId: string, opts?: ActivateOpts): Promise<ActResult> {
  const { actor } = await getSession();
  const review = await getReview(activityId);
  if (!review) return { ok: false, error: "This activity no longer exists." };
  if (review.blocking.length > 0) return { ok: false, error: `Fix ${review.blocking.length} item${review.blocking.length === 1 ? "" : "s"} before activating.` };
  const now = new Date();
  const nextDue = plusMonths(now, 12);
  const v = await createActivityVersion(activityId, actor.label, nextDue.toISOString(), opts);
  if (!v.ok) return { ok: false, error: v.error };
  await db.processingActivity.update({ where: { id: activityId }, data: { lifecycleState: "active", activatedAt: now, lastReviewedAt: now, nextReviewDue: nextDue, dpoReviewJson: null, version: { increment: 1 } } });
  touch(activityId);
  return { ok: true, id: activityId };
}

export async function submitActivityForDpoAction(activityId: string, note: string): Promise<ActResult> {
  const { actor } = await getSession();
  const review = await getReview(activityId);
  if (!review) return { ok: false, error: "This activity no longer exists." };
  if (review.blocking.length > 0) return { ok: false, error: `Fix ${review.blocking.length} item${review.blocking.length === 1 ? "" : "s"} before submitting.` };
  await db.processingActivity.update({ where: { id: activityId }, data: { lifecycleState: "pending_dpo_review", dpoReviewJson: JSON.stringify({ requestedBy: actor.label, requestedAt: new Date().toISOString(), note }), version: { increment: 1 } } });
  touch(activityId);
  return { ok: true, id: activityId };
}

export async function withdrawActivitySubmissionAction(activityId: string): Promise<ActResult> {
  await db.processingActivity.update({ where: { id: activityId }, data: { lifecycleState: "draft", dpoReviewJson: null, version: { increment: 1 } } });
  touch(activityId);
  return { ok: true };
}

export async function decideActivityAction(activityId: string, decision: "approve" | "request_changes", comment: string): Promise<ActResult> {
  const { actor, role } = await getSession();
  if (!(await canGovern(role))) return { ok: false, error: "Only the DPO can decide this." };
  if (decision === "request_changes" && !comment.trim()) return { ok: false, error: "A comment is required." };
  if (decision === "approve") {
    const now = new Date();
    const nextDue = plusMonths(now, 12);
    const v = await createActivityVersion(activityId, actor.label, nextDue.toISOString());
    if (!v.ok) return { ok: false, error: v.error };
    await db.processingActivity.update({ where: { id: activityId }, data: { lifecycleState: "active", activatedAt: now, lastReviewedAt: now, nextReviewDue: nextDue, dpoReviewJson: null, version: { increment: 1 } } });
  } else {
    await db.processingActivity.update({ where: { id: activityId }, data: { lifecycleState: "draft", dpoReviewJson: JSON.stringify({ requestedBy: actor.label, requestedAt: new Date().toISOString(), note: `Changes requested: ${comment.trim()}` }), version: { increment: 1 } } });
  }
  touch(activityId);
  return { ok: true };
}
