import { db } from "@/lib/db";
import { decodeList } from "@/lib/codec/json";
import {
  purposeState, type Activity, type Purpose, type PurposeVersion, type ActivityPurpose, type Ctx,
  type Lifecycle, type Principal, type LegalBasis, type ConsentStatus, type PurposeVersionState,
} from "@/lib/activities/types";
import {
  completeness, completenessLabel, nextStep, summary, listSentence, isNeedsWork,
  basicsRailText, purposeRailText, reviewBlockers, openReasonsCount, blockingChecklist,
  type Completeness, type NextStep, type CheckItem, type RopaPreviewRow,
} from "@/lib/activities/logic";
import type { SnapshotInput, SnapshotPurpose } from "@/lib/activities/versions";

/**
 * PROCESSING ACTIVITIES ENGINE (server). Maps Prisma rows into the pure-domain
 * shapes and runs the pure functions. The list, workspace and ROPA all read from
 * here so every count agrees.
 */

const LIFECYCLES = ["draft", "pending_dpo_review", "active", "under_review", "retired"];
function lifecycleOf(s: string): Lifecycle { return s === "archived" ? "retired" : (LIFECYCLES.includes(s) ? (s as Lifecycle) : "active"); }

/** Parse a stored retention string like "7 years after account closure" → parts. */
function parseRetention(s: string | null | undefined): { amount: number; unit: "months" | "years"; trigger: string } {
  if (!s) return { amount: 0, unit: "years", trigger: "" };
  const m = s.match(/(\d+)\s*(month|year)s?\s*(.*)$/i);
  if (!m) return { amount: 0, unit: "years", trigger: s };
  return { amount: Number(m[1]), unit: (m[2].toLowerCase().startsWith("month") ? "months" : "years"), trigger: m[3].trim() };
}

function basisOf(b: string | null | undefined): LegalBasis { return b === "consent" ? "consent" : "legitimate_use"; }

/** Multi-entity is a flag (off by default), NOT the count of Entity rows — other
 *  modules seed several entities, but the activities flow stays single-entity. */
async function isMultiEntity(): Promise<boolean> {
  const c = await db.integrationConfig.findUnique({ where: { id: "singleton" }, select: { paMultiEntity: true } });
  return c?.paMultiEntity ?? false;
}

type TagWithVersions = {
  id: string; name: string; description: string; status: string; retention: string | null; lawfulBasis: string | null;
  approvedBy: string | null; approvedAt: Date | null; proposedBy: string | null; proposedAt: Date | null; rejectionReason: string | null;
  purposeVersions: { number: number; state: string; name: string; description: string; legalBasis: string; legitimateUseType: string | null; retentionAmount: number | null; retentionUnit: string | null; retentionTrigger: string | null; justification: string | null; submittedBy: string | null; submittedAt: Date | null; decidedBy: string | null; decidedAt: Date | null; decisionComment: string | null; selfApproved: boolean; consent: string }[];
};

/** Build a domain Purpose from a tag; synthesize a single version for legacy purposes without versions. */
function toPurpose(tag: TagWithVersions): Purpose {
  const retiredAt = tag.status === "retired" ? (tag.approvedAt?.toISOString() ?? null) : null;
  if (tag.purposeVersions.length > 0) {
    const versions: PurposeVersion[] = tag.purposeVersions.map((v) => ({
      number: v.number, state: v.state as PurposeVersionState, name: v.name, description: v.description,
      legalBasis: basisOf(v.legalBasis), legitimateUseType: v.legitimateUseType,
      retention: { amount: v.retentionAmount ?? 0, unit: (v.retentionUnit === "months" ? "months" : "years"), trigger: v.retentionTrigger ?? "" },
      justification: v.justification ?? "", submittedBy: v.submittedBy, submittedAt: v.submittedAt?.toISOString() ?? null,
      decidedBy: v.decidedBy, decidedAt: v.decidedAt?.toISOString() ?? null, decisionComment: v.decisionComment,
      selfApproved: v.selfApproved, consent: v.consent as ConsentStatus,
    }));
    return { id: tag.id, versions, retiredAt };
  }
  // Legacy: one synthesized version from the tag's status.
  const stateMap: Record<string, PurposeVersionState> = { approved: "approved", pending_dpo_approval: "waiting_for_dpo", draft: "draft", rejected: "rejected", retired: "retired" };
  const state = stateMap[tag.status] ?? "approved";
  const basis = basisOf(tag.lawfulBasis);
  return {
    id: tag.id, retiredAt,
    versions: [{
      number: 1, state, name: tag.name, description: tag.description, legalBasis: basis, legitimateUseType: basis === "legitimate_use" ? "Voluntarily provided for a specified purpose" : null,
      retention: parseRetention(tag.retention), justification: "", submittedBy: tag.proposedBy, submittedAt: tag.proposedAt?.toISOString() ?? null,
      decidedBy: tag.approvedBy, decidedAt: tag.approvedAt?.toISOString() ?? null, decisionComment: tag.rejectionReason, selfApproved: false,
      consent: basis === "consent" ? "not_linked" : "not_required",
    }],
  };
}

function toActivity(row: {
  id: string; activity: string; ownerName: string | null; department: string | null; entityId: string | null; principalsJson: string;
  lifecycleState: string; lastReviewedAt: Date | null; nextReviewDue: Date | null;
  purposeSegments: { id: string; purposeTagId: string | null; processorId: string | null; linkState: string; processorMode: string; noProcessorBy: string | null; noProcessorAt: Date | null; elements: { id: string; classifiedFieldId: string | null; fieldName: string; linkState: string }[]; processorLinks: { vendorId: string; linkState: string }[] }[];
  reasons: { id: string; type: string; detail: string; status: string }[];
}): Activity {
  const purposeLinks: ActivityPurpose[] = row.purposeSegments
    .filter((s) => s.purposeTagId)
    .map((s) => {
      // Processor links: new join rows, plus a legacy single processorId.
      const links = s.processorLinks.map((p) => ({ vendorId: p.vendorId, state: (p.linkState === "suggested" ? "suggested" : "confirmed") as const }));
      if (s.processorId && !links.some((l) => l.vendorId === s.processorId)) links.push({ vendorId: s.processorId, state: "confirmed" });
      const hasProc = links.length > 0;
      const processorMode = s.processorMode === "none" ? "none" : s.processorMode === "uses_processors" ? "uses_processors" : (hasProc ? "uses_processors" : "unanswered");
      return {
        purposeId: s.purposeTagId!, state: (s.linkState === "suggested" ? "suggested" : "confirmed") as const,
        dataLinks: s.elements.map((e) => ({ fieldId: e.classifiedFieldId ?? e.fieldName, state: (e.linkState === "suggested" ? "suggested" : "confirmed") as const })),
        processorMode, noProcessorBy: s.noProcessorBy, noProcessorAt: s.noProcessorAt?.toISOString() ?? null, processorLinks: links,
      };
    });
  return {
    id: row.id, name: row.activity, ownerId: row.ownerName, department: row.department, entityId: row.entityId,
    principals: (decodeList(row.principalsJson) as Principal[]) ?? [], lifecycle: lifecycleOf(row.lifecycleState),
    purposeLinks, reasons: row.reasons.map((r) => ({ id: r.id, type: r.type as never, detail: r.detail, status: r.status as never })),
    lastReviewedAt: row.lastReviewedAt?.toISOString() ?? null, nextReviewDue: row.nextReviewDue?.toISOString() ?? null,
  };
}

export interface ActivityListRow {
  id: string; name: string; owner: string | null; department: string | null; entityId: string | null; entityName: string | null;
  lifecycle: Lifecycle; summary: string; completenessLabel: string; completenessKind: Completeness["kind"];
  next: NextStep; lastReviewedAt: string | null; openEscalations: number;
}

export interface ActivityListView {
  rows: ActivityListRow[];
  sentence: string; gapsLine: string;
  counts: { needsWork: number; underReview: number; all: number };
  multiEntity: boolean;
  options: { owners: string[]; departments: string[]; purposes: { id: string; name: string }[] };
  total: number; showing: number;
}

export interface ActivityListParams { segment?: "needs-work" | "under-review" | "all"; q?: string; owner?: string; department?: string; purpose?: string; lifecycle?: string }

async function loadCtxAndActivities() {
  const [rows, tags, entities, escalations, multiEntity] = await Promise.all([
    db.processingActivity.findMany({
      include: { purposeSegments: { include: { elements: true, processorLinks: true } }, reasons: true, entity: { select: { name: true } } },
      orderBy: { activity: "asc" },
    }),
    db.purposeTag.findMany({ include: { purposeVersions: true } }),
    db.entity.findMany({ select: { id: true, name: true } }),
    db.escalation.findMany({ where: { status: "open" }, select: { contextJson: true } }),
    isMultiEntity(),
  ]);
  const purposes: Record<string, Purpose> = {};
  for (const t of tags) purposes[t.id] = toPurpose(t as unknown as TagWithVersions);
  const ctx: Ctx = { purposes, multiEntity };
  const activities = rows.map((r) => toActivity(r as never));
  const entityName = new Map(entities.map((e) => [e.id, e.name]));
  const escFor = (a: Activity) => escalations.filter((e) => (e.contextJson ?? "").includes(a.id) || (e.contextJson ?? "").includes(a.name)).length;
  return { ctx, activities, rows, entityName, escFor, tags };
}

/** Counts over ALL activities (nav badge + ReadinessStrip), from the nine-state
 *  readiness so every surface agrees with the Activities list. ready = in the
 *  register (approved); needsWork = the needs-work bucket. */
export async function getActivityCounts(): Promise<{ ready: number; needsWork: number; underReview: number; all: number }> {
  const v = await getActivitiesView({ bucket: "all" });
  return { ready: v.counts.approved, needsWork: v.counts.needs_work, underReview: v.counts.review_due, all: v.counts.all };
}

// --- Activities view (Data Map redesign — nine-state readiness) --------------

import {
  readiness, bucketOf, inRegister, readinessActor, readinessChecks,
  type ReadinessActivity, type ReadinessPurpose, type ReadinessState,
  type ChipTone, type ReadinessBucket, type PurposeApproval, type NextStep as ReadinessNextStep,
  type Actor, type Check,
} from "@/lib/activities/readiness";
import { noticeFor } from "@/lib/activities/notices";
import { kindOf, KIND_LABEL, countryName, isCrossBorder } from "@/lib/activities/systems";
import { formatDate, daysBetween } from "@/lib/datamap/foundations";

function approvalOf(state: string): PurposeApproval {
  return state === "approved" ? "approved" : state === "waiting_for_dpo" ? "pending" : state === "rejected" ? "rejected" : "draft";
}
const DRIFT_REASONS = new Set(["new_field_in_linked_table", "new_system", "reclassified_field"]);

export interface ActivitiesViewRow {
  id: string; name: string; entityName: string | null; owner: string | null; department: string | null;
  principals: string[]; purposeCount: number; fieldCount: number; processorCount: number;
  state: ReadinessState; chipLabel: string; chipTone: ChipTone; next: ReadinessNextStep | null; lastReviewedAt: string | null;
}
export interface ActivitiesView {
  rows: ActivitiesViewRow[];
  counts: Record<ReadinessBucket, number> & { all: number };
  summary: string;
  options: { owners: string[]; departments: string[]; entities: { id: string; name: string }[]; principals: string[] };
}
export interface ActivitiesViewParams { bucket?: ReadinessBucket | "all"; q?: string; entityId?: string; principal?: string; department?: string }

export async function getActivitiesView(params: ActivitiesViewParams = {}, today: Date = new Date()): Promise<ActivitiesView> {
  const [rows, tags, entities] = await Promise.all([
    db.processingActivity.findMany({ include: { purposeSegments: { include: { elements: true, processorLinks: true } }, entity: { select: { id: true, name: true } }, reasons: true }, orderBy: { activity: "asc" } }),
    db.purposeTag.findMany({ include: { purposeVersions: { orderBy: { number: "desc" } } } }),
    db.entity.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const tagInfo = new Map(tags.map((t) => {
    const v = t.purposeVersions[0];
    return [t.id, { name: t.name, noticeRef: noticeFor(t.name), approval: approvalOf(v?.state ?? t.status), legalBasis: (v?.legalBasis ?? t.lawfulBasis) === "consent" ? "consent" as const : "legitimate_use" as const }];
  }));

  const built = rows.map((row): ActivitiesViewRow => {
    const principals = (decodeList(row.principalsJson) as string[]) ?? [];
    const segs = row.purposeSegments.filter((s) => s.purposeTagId && s.linkState === "confirmed");
    const purposes: ReadinessPurpose[] = segs.map((s) => {
      const info = tagInfo.get(s.purposeTagId!);
      const vendorIds = new Set(s.processorLinks.filter((p) => p.linkState === "confirmed").map((p) => p.vendorId));
      if (s.processorId) vendorIds.add(s.processorId);
      return {
        name: info?.name ?? "Purpose",
        fieldCount: s.elements.filter((e) => e.linkState === "confirmed").length,
        systemCount: vendorIds.size,
        approval: info?.approval ?? "approved",
        legalBasis: info?.legalBasis ?? "consent",
        inPublishedNotice: !!info?.noticeRef,
      };
    });
    const lifecycle = row.lifecycleState;
    const ra: ReadinessActivity = {
      ownerId: row.ownerName, department: row.department, principals, purposes,
      submitted: lifecycle === "pending_dpo_review", approved: lifecycle === "active" || lifecycle === "under_review",
      lastReviewedAt: row.lastReviewedAt?.toISOString() ?? null,
      driftSinceApproval: row.reasons.some((r) => r.status === "open" && DRIFT_REASONS.has(r.type)),
    };
    const r = readiness(ra, today);
    return {
      id: row.id, name: row.activity, entityName: row.entity?.name ?? null, owner: row.ownerName, department: row.department,
      principals, purposeCount: purposes.length, fieldCount: purposes.reduce((n, p) => n + p.fieldCount, 0),
      processorCount: purposes.reduce((n, p) => n + p.systemCount, 0),
      state: r.state, chipLabel: r.label, chipTone: r.tone, next: r.next, lastReviewedAt: ra.lastReviewedAt,
    };
  });

  const counts = { needs_work: 0, waiting_for_dpo: 0, review_due: 0, approved: 0, all: built.length } as ActivitiesView["counts"];
  for (const r of built) counts[bucketOf(r.state)]++;

  const bucket = params.bucket ?? "needs_work";
  const term = (params.q ?? "").trim().toLowerCase();
  const rowsOut = built.filter((r) => {
    if (bucket !== "all" && bucketOf(r.state) !== bucket) return false;
    if (params.entityId) { const row = rows.find((x) => x.id === r.id); if (row?.entityId !== params.entityId) return false; }
    if (params.department && r.department !== params.department) return false;
    if (params.principal && !r.principals.includes(params.principal)) return false;
    if (term && !`${r.name} ${r.owner ?? ""} ${r.principals.join(" ")}`.toLowerCase().includes(term)) return false;
    return true;
  });

  const parts: string[] = [];
  if (counts.needs_work) parts.push(`${counts.needs_work} need work`);
  if (counts.waiting_for_dpo) parts.push(`${counts.waiting_for_dpo} ${counts.waiting_for_dpo === 1 ? "is" : "are"} waiting for Kavita Menon`);
  if (counts.review_due) parts.push(`${counts.review_due} ${counts.review_due === 1 ? "is" : "are"} due for review`);
  const summary = `${counts.all} ${counts.all === 1 ? "activity" : "activities"}. ${counts.approved} ${counts.approved === 1 ? "is" : "are"} in the register.${parts.length ? ` ${parts.join(", ")}.` : ""}`;

  return {
    rows: rowsOut, counts, summary,
    options: {
      owners: [...new Set(built.map((r) => r.owner).filter(Boolean) as string[])].sort(),
      departments: [...new Set(built.map((r) => r.department).filter(Boolean) as string[])].sort(),
      entities, principals: [...new Set(built.flatMap((r) => r.principals))].sort(),
    },
  };
}

// --- Activity detail (five tabs) --------------------------------------------

export interface DetailField { name: string; dataCategory: string | null; sensitivity: string; purposes: string[]; retention: string | null; collectedAs: "Required" | "Optional"; source: "Discovery" | "Manual" }
export interface DetailPurpose { id: string; name: string; approval: PurposeApproval; legalBasisLabel: string; noticeRef: string | null; locked: boolean }
export interface DetailSystem { purpose: string; name: string; kindLabel: string; country: string; crossBorder: boolean; contract: string; contractTone: "ok" | "warn" | "none" }
export interface DetailVersion { number: number; state: string; activatedBy: string; activatedAt: string; hash: string; reason: string | null }
export interface ActivityDetailView {
  id: string; name: string; entityName: string | null; owner: string | null; department: string | null;
  principals: string[]; lifecycle: string;
  state: ReadinessState; chipLabel: string; chipTone: ChipTone; next: ReadinessNextStep | null;
  version: number | null; approvedBy: string | null; approvedAt: string | null;
  locked: boolean; waiting: boolean; reviewDue: boolean; reviewDrift: string[];
  fields: DetailField[]; purposes: DetailPurpose[]; systems: DetailSystem[];
  consent: { channels: string[]; noticeRefs: string[] };
  versions: DetailVersion[];
}

export async function getActivityDetail(id: string, today: Date = new Date()): Promise<ActivityDetailView | null> {
  const [row, tags] = await Promise.all([
    db.processingActivity.findUnique({ where: { id }, include: { purposeSegments: { include: { elements: true, processorLinks: true } }, entity: { select: { name: true } }, reasons: true, activityVersions: { orderBy: { number: "desc" } } } }),
    db.purposeTag.findMany({ include: { purposeVersions: { orderBy: { number: "desc" } } } }),
  ]);
  if (!row) return null;
  const tagById = new Map(tags.map((t) => { const v = t.purposeVersions[0]; return [t.id, { name: t.name, approval: approvalOf(v?.state ?? t.status), legalBasis: (v?.legalBasis ?? t.lawfulBasis), legitimateUseType: v?.legitimateUseType ?? null, retention: t.retention }]; }));
  const segs = row.purposeSegments.filter((s) => s.purposeTagId);

  const vendorIds = [...new Set(segs.flatMap((s) => { const ids = s.processorLinks.filter((p) => p.linkState === "confirmed").map((p) => p.vendorId); if (s.processorId) ids.push(s.processorId); return ids; }))];
  const vendors = vendorIds.length ? await db.dataProcessor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true, jurisdiction: true, dpaStatus: true, dpaExpiresAt: true } }) : [];
  const vById = new Map(vendors.map((v) => [v.id, v]));
  const fieldNames = [...new Set(segs.flatMap((s) => s.elements.map((e) => e.fieldName)))];
  const cfields = fieldNames.length ? await db.classifiedField.findMany({ where: { fieldPath: { in: fieldNames } }, select: { fieldPath: true, sensitivityTier: true, dataCategory: { select: { name: true } } } }) : [];
  const cfByPath = new Map(cfields.map((f) => [f.fieldPath, f]));

  const fields: DetailField[] = [];
  for (const s of segs) {
    const info = tagById.get(s.purposeTagId!);
    for (const e of s.elements.filter((x) => x.linkState === "confirmed")) {
      const cf = cfByPath.get(e.fieldName);
      fields.push({
        name: e.fieldName, dataCategory: cf?.dataCategory?.name ?? null,
        sensitivity: cf?.sensitivityTier && cf.sensitivityTier !== "Not classified" ? cf.sensitivityTier : "Not classified",
        purposes: info ? [info.name] : [], retention: info?.retention ?? null,
        collectedAs: "Required", source: "Manual",
      });
    }
  }

  const purposes: DetailPurpose[] = segs.filter((s) => s.linkState === "confirmed").map((s) => {
    const info = tagById.get(s.purposeTagId!)!;
    return { id: s.purposeTagId!, name: info.name, approval: info.approval, legalBasisLabel: info.legalBasis === "consent" ? "Consent (Section 6)" : `Legitimate use${info.legitimateUseType ? `: ${info.legitimateUseType}` : ""}`, noticeRef: noticeFor(info.name), locked: info.approval === "approved" };
  });

  const systems: DetailSystem[] = [];
  for (const s of segs) {
    const info = tagById.get(s.purposeTagId!); if (!info) continue;
    const vids = new Set(s.processorLinks.filter((p) => p.linkState === "confirmed").map((p) => p.vendorId)); if (s.processorId) vids.add(s.processorId);
    for (const vid of vids) {
      const v = vById.get(vid); if (!v) continue;
      const kind = kindOf(v.name);
      let contract = ""; let tone: "ok" | "warn" | "none" = "none";
      if (kind === "processor") {
        if (v.dpaStatus === "expired" || (v.dpaExpiresAt && v.dpaExpiresAt.getTime() < today.getTime())) { contract = `Expired ${v.dpaExpiresAt ? formatDate(v.dpaExpiresAt.toISOString()) : ""}`.trim(); tone = "warn"; }
        else if (v.dpaStatus === "active") { contract = v.dpaExpiresAt ? `Valid until ${formatDate(v.dpaExpiresAt.toISOString())}` : "Valid"; tone = "ok"; }
        else { contract = "No contract on file"; tone = "warn"; }
      }
      systems.push({ purpose: info.name, name: v.name, kindLabel: KIND_LABEL[kind], country: countryName(v.jurisdiction), crossBorder: isCrossBorder(v.jurisdiction), contract, contractTone: tone });
    }
  }

  const principals = (decodeList(row.principalsJson) as string[]) ?? [];
  const rPurposes: ReadinessPurpose[] = segs.filter((s) => s.linkState === "confirmed").map((s) => {
    const info = tagById.get(s.purposeTagId!)!;
    const vids = new Set(s.processorLinks.filter((p) => p.linkState === "confirmed").map((p) => p.vendorId)); if (s.processorId) vids.add(s.processorId);
    return { name: info.name, fieldCount: s.elements.filter((e) => e.linkState === "confirmed").length, systemCount: vids.size, approval: info.approval, legalBasis: info.legalBasis === "consent" ? "consent" : "legitimate_use", inPublishedNotice: !!noticeFor(info.name) };
  });
  const ra: ReadinessActivity = { ownerId: row.ownerName, department: row.department, principals, purposes: rPurposes, submitted: row.lifecycleState === "pending_dpo_review", approved: row.lifecycleState === "active" || row.lifecycleState === "under_review", lastReviewedAt: row.lastReviewedAt?.toISOString() ?? null, driftSinceApproval: row.reasons.some((rr) => rr.status === "open" && DRIFT_REASONS.has(rr.type)) };
  const r = readiness(ra, today);
  const active = row.activityVersions.find((v) => v.state === "active");

  return {
    id: row.id, name: row.activity, entityName: row.entity?.name ?? null, owner: row.ownerName, department: row.department,
    principals, lifecycle: row.lifecycleState,
    state: r.state, chipLabel: r.label, chipTone: r.tone, next: r.next,
    version: active?.number ?? null, approvedBy: active?.activatedBy ?? null, approvedAt: active?.activatedAt.toISOString() ?? null,
    locked: row.lifecycleState === "active" || row.lifecycleState === "under_review",
    waiting: row.lifecycleState === "pending_dpo_review",
    reviewDue: r.state === "review_due", reviewDrift: row.reasons.filter((rr) => rr.status === "open" && DRIFT_REASONS.has(rr.type)).map((rr) => rr.detail),
    fields, purposes, systems,
    consent: { channels: ["Mobile app", "Web portal", "Branch (offline)"], noticeRefs: [...new Set(purposes.map((p) => p.noticeRef).filter(Boolean) as string[])] },
    versions: row.activityVersions.map((v) => ({ number: v.number, state: v.state, activatedBy: v.activatedBy, activatedAt: v.activatedAt.toISOString(), hash: v.hash, reason: v.reason })),
  };
}

export async function getActivityList(params: ActivityListParams = {}): Promise<ActivityListView> {
  const { ctx, activities, rows, entityName, escFor, tags } = await loadCtxAndActivities();
  const rowById = new Map(rows.map((r) => [r.id, r]));

  const built: ActivityListRow[] = activities.map((a) => {
    const c = completeness(a, ctx);
    return {
      id: a.id, name: a.name, owner: a.ownerId, department: a.department, entityId: a.entityId,
      entityName: a.entityId ? entityName.get(a.entityId) ?? null : null,
      lifecycle: a.lifecycle, summary: summary(a), completenessLabel: completenessLabel(c), completenessKind: c.kind,
      next: nextStep(a, ctx), lastReviewedAt: a.lastReviewedAt, openEscalations: escFor(a),
    };
  });

  const counts = {
    needsWork: built.filter((r) => isNeedsWork(completeness(activities.find((a) => a.id === r.id)!, ctx))).length,
    underReview: built.filter((r) => r.lifecycle === "under_review").length,
    all: built.length,
  };
  const segment = params.segment ?? (counts.needsWork > 0 ? "needs-work" : "all");

  const term = (params.q ?? "").trim().toLowerCase();
  let rowsOut = built.filter((r) => {
    if (segment === "needs-work" && !isNeedsWork(completeness(activities.find((a) => a.id === r.id)!, ctx))) return false;
    if (segment === "under-review" && r.lifecycle !== "under_review") return false;
    if (params.owner && r.owner !== params.owner) return false;
    if (params.department && r.department !== params.department) return false;
    if (params.lifecycle && r.lifecycle !== params.lifecycle) return false;
    if (params.purpose) { const a = activities.find((x) => x.id === r.id)!; if (!a.purposeLinks.some((p) => p.purposeId === params.purpose)) return false; }
    if (term) {
      const a = activities.find((x) => x.id === r.id)!;
      const pNames = a.purposeLinks.map((p) => ctx.purposes[p.purposeId] ? (tags.find((t) => t.id === p.purposeId)?.name ?? "") : "").join(" ");
      if (!`${r.name} ${r.owner ?? ""} ${pNames}`.toLowerCase().includes(term)) return false;
    }
    return true;
  });

  const prio = ["needs_basics", "needs_purpose", "needs_approval", "needs_data", "needs_processors", "needs_review", "complete", "retired"];
  rowsOut.sort((a, b) => prio.indexOf(a.completenessKind) - prio.indexOf(b.completenessKind) || a.name.localeCompare(b.name));

  const { sentence, gapsLine } = listSentence(activities, ctx);
  const owners = [...new Set(built.map((r) => r.owner).filter(Boolean) as string[])].sort();
  const departments = [...new Set(built.map((r) => r.department).filter(Boolean) as string[])].sort();
  const purposes = tags.map((t) => ({ id: t.id, name: t.name })).sort((a, b) => a.name.localeCompare(b.name));

  return { rows: rowsOut, sentence, gapsLine, counts, multiEntity: ctx.multiEntity, options: { owners, departments, purposes }, total: built.length, showing: rowsOut.length };
}

// --- Workspace --------------------------------------------------------------

export interface WorkspacePurposeRail { purposeId: string; name: string; railText: string; waitingVersion: number | null; state: "confirmed" | "suggested" }
export interface PurposePaneData {
  purposeId: string; name: string; linkState: "confirmed" | "suggested";
  displayState: string; stateLine: string; actions: string[];
  description: string; basisLabel: string; legitimateUseType: string | null; retentionText: string;
  consent: "linked" | "not_linked" | "not_required"; decisionComment: string | null;
  version: number | null; waitingVersion: number | null; notApproved: boolean;
  dataCount: number; processorMode: string; processorCount: number;
  editApproved: boolean; inForceVersion: number | null;
  edit: { name: string; description: string; legalBasis: "consent" | "legitimate_use"; legitimateUseType: string | null; amount: number; unit: "months" | "years"; trigger: string; justification: string };
}
export interface WorkspaceView {
  id: string; name: string; description: string; ownerName: string | null; department: string | null; entityId: string | null;
  principals: string[]; lifecycle: Lifecycle; version: number; lastReviewedAt: string | null; nextReviewDue: string | null;
  multiEntity: boolean; entities: { id: string; name: string }[];
  basicsRailText: string; purposeRails: WorkspacePurposeRail[]; reviewBlockers: number; openReasons: number;
  completenessKind: Completeness["kind"]; completenessLabel: string; next: NextStep;
  prepared: boolean; purposeDetails: Record<string, PurposePaneData>;
}

export async function getActivityWorkspace(id: string): Promise<WorkspaceView | null> {
  const [row, tags, entities, multiEntity] = await Promise.all([
    db.processingActivity.findUnique({ where: { id }, include: { purposeSegments: { include: { elements: true, processorLinks: true } }, reasons: true } }),
    db.purposeTag.findMany({ include: { purposeVersions: true } }),
    db.entity.findMany({ select: { id: true, name: true } }),
    isMultiEntity(),
  ]);
  if (!row) return null;
  const purposes: Record<string, Purpose> = {};
  for (const t of tags) purposes[t.id] = toPurpose(t as unknown as TagWithVersions);
  const ctx: Ctx = { purposes, multiEntity };
  const nameById = new Map(tags.map((t) => [t.id, t.name]));
  const a = toActivity(row as never);
  const c = completeness(a, ctx);

  const purposeRails: WorkspacePurposeRail[] = a.purposeLinks.map((link) => ({
    purposeId: link.purposeId, name: nameById.get(link.purposeId) ?? "Purpose", railText: purposeRailText(a, link, ctx),
    waitingVersion: purposeState(ctx.purposes[link.purposeId]).waitingVersionNumber, state: link.state,
  }));
  const prepared = a.purposeLinks.some((l) => l.state === "suggested" || l.dataLinks.some((d) => d.state === "suggested"));

  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  const purposeDetails: Record<string, PurposePaneData> = {};
  for (const link of a.purposeLinks) {
    const p = ctx.purposes[link.purposeId];
    const ps = purposeState(p);
    const inForce = ps.inForce ?? ps.latest!;
    const latest = ps.latest!;
    const basisLabel = inForce.legalBasis === "consent" ? "Consent" : "Legitimate use";
    const retentionText = inForce.retention.amount ? `${inForce.retention.amount} ${inForce.retention.unit} ${inForce.retention.trigger}`.trim() : "No retention set";
    let stateLine = ""; const actions: string[] = [];
    if (ps.approvedForUse) { stateLine = `Approved by ${inForce.decidedBy || "K. Menon"} on ${fmt(inForce.decidedAt)} · version ${inForce.number}`; actions.push("edit", "history"); }
    else if (ps.state === "draft") { stateLine = "Draft · not submitted"; actions.push("edit", "submit"); }
    else if (ps.state === "waiting_for_dpo") { stateLine = `Submitted ${fmt(latest.submittedAt)} by ${latest.submittedBy || "R. Iyer"}. Waiting for K. Menon.`; actions.push("withdraw"); }
    else if (ps.state === "changes_requested") { stateLine = `Changes requested by ${latest.decidedBy || "K. Menon"} on ${fmt(latest.decidedAt)}.`; actions.push("edit", "resubmit"); }
    else if (ps.state === "rejected") { stateLine = "Rejected."; actions.push("edit", "remove"); }
    else if (ps.state === "retired") { stateLine = `Retired.`; actions.push("replace", "remove"); }
    const confirmedData = link.dataLinks.filter((x) => x.state === "confirmed").length;
    const confirmedProc = link.processorLinks.filter((x) => x.state === "confirmed").length;
    // The version the Edit modal prefills from: an in-progress version if one exists, else the in-force one.
    const nonApproved = ps.latest && ps.latest.state !== "approved" && ps.latest.state !== "retired" ? ps.latest : null;
    const editSrc = nonApproved ?? inForce;
    const editApproved = ps.approvedForUse && !nonApproved;
    purposeDetails[link.purposeId] = {
      purposeId: link.purposeId, name: nameById.get(link.purposeId) ?? "Purpose", linkState: link.state,
      displayState: ps.displayState, stateLine, actions,
      description: inForce.description, basisLabel, legitimateUseType: inForce.legitimateUseType, retentionText,
      consent: inForce.consent, decisionComment: latest.decisionComment,
      version: ps.inForce?.number ?? null, waitingVersion: ps.waitingVersionNumber, notApproved: !ps.approvedForUse,
      dataCount: confirmedData, processorMode: link.processorMode, processorCount: confirmedProc,
      editApproved, inForceVersion: ps.inForce?.number ?? null,
      edit: { name: editSrc.name, description: editSrc.description, legalBasis: editSrc.legalBasis, legitimateUseType: editSrc.legitimateUseType, amount: editSrc.retention.amount, unit: editSrc.retention.unit, trigger: editSrc.retention.trigger, justification: editSrc.justification },
    };
  }

  return {
    id: a.id, name: a.name, description: row.description ?? "", ownerName: a.ownerId, department: a.department, entityId: a.entityId,
    principals: a.principals, lifecycle: a.lifecycle, version: row.version, lastReviewedAt: a.lastReviewedAt, nextReviewDue: a.nextReviewDue,
    multiEntity: ctx.multiEntity, entities,
    basicsRailText: basicsRailText(a, ctx.multiEntity), purposeRails, reviewBlockers: reviewBlockers(a, ctx), openReasons: openReasonsCount(a),
    completenessKind: c.kind, completenessLabel: completenessLabel(c), next: nextStep(a, ctx), prepared, purposeDetails,
  };
}

// --- Review & activate ------------------------------------------------------

export interface ReviewView {
  verdict: "ready" | "blocked"; blocking: CheckItem[]; warnings: CheckItem[]; ropa: RopaPreviewRow[];
  requireDpoReview: boolean; lifecycle: Lifecycle; dpoReview: { requestedBy: string; requestedAt: string; note: string } | null;
}
const NOTIFIED_PA = new Set(["IN", "SG", "AE", "JP"]);

export async function getReview(activityId: string): Promise<ReviewView | null> {
  const [row, tags, cfg] = await Promise.all([
    db.processingActivity.findUnique({ where: { id: activityId }, include: { purposeSegments: { include: { elements: true, processorLinks: true } }, reasons: true } }),
    db.purposeTag.findMany({ include: { purposeVersions: true } }),
    db.integrationConfig.findUnique({ where: { id: "singleton" }, select: { paMultiEntity: true, paRequireDpoReview: true } }),
  ]);
  if (!row) return null;
  const purposes: Record<string, Purpose> = {};
  for (const t of tags) purposes[t.id] = toPurpose(t as unknown as TagWithVersions);
  const ctx: Ctx = { purposes, multiEntity: cfg?.paMultiEntity ?? false };
  const nameById = new Map(tags.map((t) => [t.id, t.name]));
  const a = toActivity(row as never);
  const blocking = blockingChecklist(a, ctx, (id) => nameById.get(id) ?? "Purpose");

  const confirmed = a.purposeLinks.filter((p) => p.state === "confirmed");
  const fieldIds = [...new Set(confirmed.flatMap((p) => p.dataLinks.filter((dd) => dd.state === "confirmed").map((dd) => dd.fieldId).filter(Boolean) as string[]))];
  const vendorIds = [...new Set(confirmed.flatMap((p) => p.processorLinks.filter((x) => x.state === "confirmed").map((x) => x.vendorId)))];
  const [fields, vendors] = await Promise.all([
    fieldIds.length ? db.classifiedField.findMany({ where: { id: { in: fieldIds } }, select: { sensitivityTier: true } }) : Promise.resolve([] as { sensitivityTier: string }[]),
    vendorIds.length ? db.dataProcessor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true, jurisdiction: true, dpaStatus: true, dpaExpiresAt: true } }) : Promise.resolve([] as { id: string; name: string; jurisdiction: string | null; dpaStatus: string; dpaExpiresAt: Date | null }[]),
  ]);
  const vById = new Map(vendors.map((v) => [v.id, v]));
  const warnings: CheckItem[] = [];
  const unclassified = fields.filter((f) => f.sensitivityTier === "Not classified").length;
  if (unclassified > 0) warnings.push({ id: "W1", text: `${unclassified} linked field${unclassified === 1 ? " isn’t" : "s aren’t"} classified in DLP.`, verb: "Classify in DLP", target: null, blocking: false });
  for (const v of vendors.filter((v) => v.dpaStatus !== "active" || (v.dpaExpiresAt && v.dpaExpiresAt.getTime() < Date.now()))) warnings.push({ id: "W2", text: `${v.name} has no contract on file.`, verb: "Check the contract", target: null, blocking: false });
  for (const v of vendors.filter((v) => v.jurisdiction && !NOTIFIED_PA.has(v.jurisdiction))) warnings.push({ id: "W3", text: `Data goes outside India: ${v.jurisdiction} (${v.name}).`, verb: "Review transfer", target: null, blocking: false });
  if (a.principals.includes("children")) warnings.push({ id: "W4", text: "This activity covers children’s data.", verb: "Review", target: { pane: "basics" }, blocking: false });

  const ropa: RopaPreviewRow[] = confirmed.map((p) => {
    const ps = purposeState(ctx.purposes[p.purposeId]); const inForce = ps.inForce ?? ps.latest!;
    const procs = p.processorLinks.filter((x) => x.state === "confirmed").map((x) => vById.get(x.vendorId)?.name ?? "—");
    const transfer = p.processorLinks.some((x) => { const v = vById.get(x.vendorId); return !!v?.jurisdiction && !NOTIFIED_PA.has(v.jurisdiction); });
    return { purpose: nameById.get(p.purposeId) ?? "Purpose", legalBasis: inForce.legalBasis === "consent" ? "Consent" : "Legitimate use", retention: inForce.retention.amount ? `${inForce.retention.amount} ${inForce.retention.unit} ${inForce.retention.trigger}`.trim() : "—", dataCount: p.dataLinks.filter((dd) => dd.state === "confirmed").length, processors: procs, transfer };
  });

  const dpoReview = row.dpoReviewJson ? (JSON.parse(row.dpoReviewJson) as { requestedBy: string; requestedAt: string; note: string }) : null;
  return { verdict: blocking.length > 0 ? "blocked" : "ready", blocking, warnings, ropa, requireDpoReview: cfg?.paRequireDpoReview ?? false, lifecycle: a.lifecycle, dpoReview };
}

// --- Versions: snapshot assembly (M1) ---------------------------------------

/** Assemble the canonical SnapshotInput for an activity from live rows. Called at
 *  activation to build + hash the signed record. Only confirmed, approved purposes
 *  and confirmed data/processors enter the record (the record can't be activated
 *  while blockers remain, so this is the clean state). */
export async function snapshotInputForActivity(activityId: string): Promise<SnapshotInput | null> {
  const [row, tags] = await Promise.all([
    db.processingActivity.findUnique({ where: { id: activityId }, include: { purposeSegments: { include: { elements: true, processorLinks: true } }, entity: { select: { name: true } } } }),
    db.purposeTag.findMany({ include: { purposeVersions: true } }),
  ]);
  if (!row) return null;
  const purposes: Record<string, Purpose> = {};
  for (const t of tags) purposes[t.id] = toPurpose(t as unknown as TagWithVersions);
  const nameById = new Map(tags.map((t) => [t.id, t.name]));
  const a = toActivity(row as never);
  const confirmed = a.purposeLinks.filter((p) => p.state === "confirmed");

  const fieldIds = [...new Set(confirmed.flatMap((p) => p.dataLinks.filter((d) => d.state === "confirmed").map((d) => d.fieldId).filter(Boolean) as string[]))];
  const vendorIds = [...new Set(confirmed.flatMap((p) => p.processorLinks.filter((x) => x.state === "confirmed").map((x) => x.vendorId)))];
  const [fields, vendors] = await Promise.all([
    fieldIds.length ? db.classifiedField.findMany({ where: { id: { in: fieldIds } }, select: { id: true, fieldPath: true, detectedType: true, overriddenType: true, sensitivityTier: true } }) : Promise.resolve([] as { id: string; fieldPath: string; detectedType: string | null; overriddenType: string | null; sensitivityTier: string }[]),
    vendorIds.length ? db.dataProcessor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true, jurisdiction: true } }) : Promise.resolve([] as { id: string; name: string; jurisdiction: string | null }[]),
  ]);
  const fById = new Map(fields.map((f) => [f.id, f]));
  const vById = new Map(vendors.map((v) => [v.id, v]));

  const snapPurposes: SnapshotPurpose[] = confirmed.map((p) => {
    const ps = purposeState(purposes[p.purposeId]);
    const inForce = ps.inForce ?? ps.latest!;
    const data = p.dataLinks.filter((d) => d.state === "confirmed").map((d) => {
      const f = fById.get(d.fieldId);
      const tier = f?.sensitivityTier ?? null;
      return { fieldId: d.fieldId, path: f?.fieldPath ?? d.fieldId, dataType: f?.overriddenType ?? f?.detectedType ?? "Unknown", sensitivity: tier === "Not classified" ? null : tier };
    });
    const processors = p.processorLinks.filter((x) => x.state === "confirmed").map((x) => ({ vendor: vById.get(x.vendorId)?.name ?? x.vendorId, country: vById.get(x.vendorId)?.jurisdiction ?? null }));
    return {
      purposeId: nameById.get(p.purposeId) ?? p.purposeId,
      approvedVersion: ps.inForce?.number ?? null,
      legalBasis: inForce.legalBasis === "consent" ? "Consent" : "Legitimate use",
      retention: inForce.retention.amount ? `${inForce.retention.amount} ${inForce.retention.unit} ${inForce.retention.trigger}`.trim() : "",
      data, processors, noProcessor: p.processorMode === "none",
    };
  });

  return {
    name: a.name, description: row.description ?? "", owner: a.ownerId, department: a.department,
    entity: row.entity?.name ?? null, principals: a.principals, reviewPeriodMonths: 12, nextReviewDue: a.nextReviewDue,
    purposes: snapPurposes,
  };
}

// --- Activities screen (redesign: coverage + My work + Register) ------------

import { getDlpHealth } from "@/lib/engines/dlp";

const ENTITY_SHORT: Record<string, string> = { "Meridian Financial Services Ltd": "MFS", "Meridian Securities Ltd": "MSL" };

export interface ScreenRow {
  id: string; name: string; entityId: string | null; entityName: string | null; entityShort: string;
  owner: string | null; department: string | null; principals: string[];
  purposeCount: number; fieldCount: number; systemCount: number;
  state: ReadinessState; chipLabel: string; chipTone: ChipTone; next: ReadinessNextStep | null;
  actor: Actor; checks: Check[]; inRegister: boolean;
  waitingDays: number; overdueDays: number | null; reviewedAt: string | null; statusActor: string | null;
}
export interface Coverage {
  pct: number; registerFields: number; totalFields: number; inProgressFields: number; orphanFields: number;
  inRegisterCount: number; inProgressCount: number; suggestions: number;
  dlpConnected: boolean; dlpStale: boolean; lastSyncLabel: string | null; lastExported: string | null;
}
export interface ActivitiesScreen {
  coverage: Coverage; rows: ScreenRow[];
  options: { fiduciaries: { id: string; name: string }[]; principals: string[]; departments: string[]; owners: string[] };
}

export async function getActivitiesScreen(today: Date = new Date()): Promise<ActivitiesScreen> {
  const [rows, tags, allFieldCount, usedFieldRows, ropaPending, health] = await Promise.all([
    db.processingActivity.findMany({ include: { purposeSegments: { include: { elements: true, processorLinks: true } }, entity: { select: { id: true, name: true } }, reasons: true }, orderBy: { activity: "asc" } }),
    db.purposeTag.findMany({ include: { purposeVersions: { orderBy: { number: "desc" } } } }),
    db.classifiedField.count(),
    db.activityPurposeElement.findMany({ where: { classifiedFieldId: { not: null } }, select: { classifiedFieldId: true } }),
    db.ropaSuggestion.count({ where: { status: "pending" } }).catch(() => 0),
    getDlpHealth(),
  ]);
  const tagInfo = new Map(tags.map((t) => { const v = t.purposeVersions[0]; return [t.id, { name: t.name, approval: approvalOf(v?.state ?? t.status), legalBasis: (v?.legalBasis ?? t.lawfulBasis) === "consent" ? "consent" as const : "legitimate_use" as const }]; }));

  const built: ScreenRow[] = rows.map((row) => {
    const principals = (decodeList(row.principalsJson) as string[]) ?? [];
    const segs = row.purposeSegments.filter((s) => s.purposeTagId && s.linkState === "confirmed");
    const purposes: ReadinessPurpose[] = segs.map((s) => {
      const info = tagInfo.get(s.purposeTagId!);
      const vids = new Set(s.processorLinks.filter((p) => p.linkState === "confirmed").map((p) => p.vendorId)); if (s.processorId) vids.add(s.processorId);
      return { name: info?.name ?? "Purpose", fieldCount: s.elements.filter((e) => e.linkState === "confirmed").length, systemCount: vids.size, approval: info?.approval ?? "approved", legalBasis: info?.legalBasis ?? "consent", inPublishedNotice: !!noticeFor(info?.name ?? "") };
    });
    const lifecycle = row.lifecycleState;
    const ra: ReadinessActivity = { ownerId: row.ownerName, department: row.department, principals, purposes, submitted: lifecycle === "pending_dpo_review", approved: lifecycle === "active" || lifecycle === "under_review", lastReviewedAt: row.lastReviewedAt?.toISOString() ?? null, driftSinceApproval: row.reasons.some((r) => r.status === "open" && DRIFT_REASONS.has(r.type)) };
    const r = readiness(ra, today);
    const actor = readinessActor(r.state, ra);
    const reg = inRegister(r.state);
    const reviewDueDate = row.lastReviewedAt ? new Date(row.lastReviewedAt.getTime() + 90 * 86_400_000) : null;
    const overdueDays = r.state === "review_due" && reviewDueDate ? Math.max(0, daysBetween(reviewDueDate, today)) : null;
    const statusActor = actor === "admin" ? `You: ${r.next?.text ?? "act"}`
      : actor === "dpo" ? (r.state === "waiting_for_dpo" ? "Kavita Menon: approve activity" : "Kavita Menon: approve purpose")
      : actor === "owner" ? `${row.ownerName ?? "Owner"}: confirm review` : null;
    return {
      id: row.id, name: row.activity, entityId: row.entityId, entityName: row.entity?.name ?? null, entityShort: ENTITY_SHORT[row.entity?.name ?? ""] ?? (row.entity?.name ?? "—"),
      owner: row.ownerName, department: row.department, principals,
      purposeCount: purposes.length, fieldCount: purposes.reduce((n, p) => n + p.fieldCount, 0), systemCount: purposes.reduce((n, p) => n + p.systemCount, 0),
      state: r.state, chipLabel: r.label, chipTone: r.tone, next: r.next, actor, checks: readinessChecks(ra, today), inRegister: reg,
      waitingDays: Math.max(0, daysBetween(row.createdAt, today)), overdueDays, reviewedAt: row.lastReviewedAt?.toISOString() ?? null, statusActor,
    };
  });

  const registerFields = built.filter((r) => r.inRegister).reduce((n, r) => n + r.fieldCount, 0);
  const totalActivityFields = built.reduce((n, r) => n + r.fieldCount, 0);
  const usedIds = new Set(usedFieldRows.map((u) => u.classifiedFieldId));
  const orphanFields = Math.max(0, allFieldCount - usedIds.size);
  const totalFields = totalActivityFields + orphanFields;
  const pct = totalFields ? Math.round((registerFields / totalFields) * 100) : 0;

  return {
    coverage: {
      pct, registerFields, totalFields, inProgressFields: totalActivityFields - registerFields, orphanFields,
      inRegisterCount: built.filter((r) => r.inRegister).length, inProgressCount: built.filter((r) => !r.inRegister).length,
      suggestions: ropaPending, dlpConnected: health.state !== "not_connected", dlpStale: health.state === "stale",
      lastSyncLabel: health.state === "stale" ? (health.lastSyncAgo ?? null) : null, lastExported: null,
    },
    rows: built,
    options: {
      fiduciaries: [...new Map(built.filter((r) => r.entityId).map((r) => [r.entityId!, { id: r.entityId!, name: r.entityName! }])).values()],
      principals: [...new Set(built.flatMap((r) => r.principals))].sort(),
      departments: [...new Set(built.map((r) => r.department).filter(Boolean) as string[])].sort(),
      owners: [...new Set(built.map((r) => r.owner).filter(Boolean) as string[])].sort(),
    },
  };
}

// --- Activity detail pane (slide-in with inline fixes) ----------------------

import { USERS, PRINCIPAL_OPTIONS } from "@/lib/activities/org";
import { checksAria } from "@/lib/activities/readiness";

export interface PaneView {
  id: string; name: string; chipLabel: string; chipTone: ChipTone; owner: string | null; department: string | null;
  entityName: string | null; versionLabel: string; locked: boolean; waiting: boolean; baseRev: number;
  state: ReadinessState; actor: Actor; checks: Check[]; aria: string;
  summaries: Record<string, string>;
  blockingPurposeId: string | null; blockingPurposeName: string | null; rejectedReason: string | null;
  noticeTarget: string | null;
  ownerOptions: { name: string; department: string }[]; principalOptions: { id: string; label: string }[];
  purposeOptions: { id: string; name: string }[]; currentPrincipals: string[];
  canSubmit: boolean; nextVersion: number;
}

export async function getActivityPane(id: string, today: Date = new Date()): Promise<PaneView | null> {
  const [row, tags] = await Promise.all([
    db.processingActivity.findUnique({ where: { id }, include: { purposeSegments: { include: { elements: true, processorLinks: true } }, entity: { select: { name: true } }, activityVersions: { where: { state: "active" }, orderBy: { number: "desc" }, take: 1 } } }),
    db.purposeTag.findMany({ include: { purposeVersions: { orderBy: { number: "desc" } } } }),
  ]);
  if (!row) return null;
  const tagInfo = new Map(tags.map((t) => { const v = t.purposeVersions[0]; return [t.id, { name: t.name, approval: approvalOf(v?.state ?? t.status), legalBasis: (v?.legalBasis ?? t.lawfulBasis) === "consent" ? "consent" as const : "legitimate_use" as const, rejectedReason: v?.decisionComment ?? t.rejectionReason ?? null }]; }));
  const segs = row.purposeSegments.filter((s) => s.purposeTagId && s.linkState === "confirmed");
  const principals = (decodeList(row.principalsJson) as string[]) ?? [];
  const purposes: ReadinessPurpose[] = segs.map((s) => {
    const info = tagInfo.get(s.purposeTagId!);
    const vids = new Set(s.processorLinks.filter((p) => p.linkState === "confirmed").map((p) => p.vendorId)); if (s.processorId) vids.add(s.processorId);
    return { name: info?.name ?? "Purpose", fieldCount: s.elements.filter((e) => e.linkState === "confirmed").length, systemCount: vids.size, approval: info?.approval ?? "approved", legalBasis: info?.legalBasis ?? "consent", inPublishedNotice: !!noticeFor(info?.name ?? "") };
  });
  const lifecycle = row.lifecycleState;
  const ra: ReadinessActivity = { ownerId: row.ownerName, department: row.department, principals, purposes, submitted: lifecycle === "pending_dpo_review", approved: lifecycle === "active" || lifecycle === "under_review", lastReviewedAt: row.lastReviewedAt?.toISOString() ?? null, driftSinceApproval: false };
  const r = readiness(ra, today);
  const checks = readinessChecks(ra, today);
  const actor = readinessActor(r.state, ra);
  const locked = inRegister(r.state);

  // Blocking purpose for data/systems/purpose fixes.
  const segInfo = segs.map((s) => ({ seg: s, info: tagInfo.get(s.purposeTagId!)!, fields: s.elements.filter((e) => e.linkState === "confirmed").length, systems: (() => { const v = new Set(s.processorLinks.filter((p) => p.linkState === "confirmed").map((p) => p.vendorId)); if (s.processorId) v.add(s.processorId); return v.size; })() }));
  let blocking: { id: string; name: string } | null = null;
  const block = checks.find((c) => c.state === "block")?.key;
  if (block === "data") { const s = segInfo.find((x) => x.fields === 0); if (s) blocking = { id: s.seg.purposeTagId!, name: s.info.name }; }
  else if (block === "systems") { const s = segInfo.find((x) => x.fields > 0 && x.systems === 0); if (s) blocking = { id: s.seg.purposeTagId!, name: s.info.name }; }
  else if (block === "purpose") { const s = segInfo.find((x) => x.info.approval !== "approved"); if (s) blocking = { id: s.seg.purposeTagId!, name: s.info.name }; }
  else if (block === "notice") { const s = segInfo.find((x) => x.info.legalBasis === "consent" && !noticeFor(x.info.name)); if (s) blocking = { id: s.seg.purposeTagId!, name: s.info.name }; }
  const rejectedReason = block === "purpose" && blocking ? (tagInfo.get(blocking.id)?.rejectedReason ?? null) : null;

  const active = row.activityVersions[0];
  const versionLabel = active ? `v${active.number} · In the register since ${formatDate(active.activatedAt.toISOString())}` : `v1 · ${lifecycle === "pending_dpo_review" ? "Waiting for DPO" : "Draft"}`;

  const summaries: Record<string, string> = {
    basics: `${row.ownerName ?? "No owner"}${row.department ? ` · ${row.department}` : ""} · ${plural(principals.length, "principal")} · ${plural(purposes.length, "purpose")}`,
    data: `${purposes.reduce((n, p) => n + p.fieldCount, 0)} fields across ${plural(purposes.length, "purpose")}`,
    systems: `${purposes.reduce((n, p) => n + p.systemCount, 0)} systems or processors`,
    purpose: "Every linked purpose is approved",
    notice: purposes.some((p) => p.legalBasis === "consent") ? "Consent purposes are in a published notice" : "n/a — legitimate use",
    dpo: active ? `Approved by ${active.activatedBy} on ${formatDate(active.activatedAt.toISOString())}` : "Not yet approved",
  };
  const approvedTags = tags.filter((t) => tagInfo.get(t.id)?.approval === "approved");

  return {
    id: row.id, name: row.activity, chipLabel: r.label, chipTone: r.tone, owner: row.ownerName, department: row.department,
    entityName: row.entity?.name ?? null, versionLabel, locked, waiting: lifecycle === "pending_dpo_review", baseRev: row.version,
    state: r.state, actor, checks, aria: checksAria(checks), summaries,
    blockingPurposeId: blocking?.id ?? null, blockingPurposeName: blocking?.name ?? null, rejectedReason,
    noticeTarget: block === "notice" && blocking ? blocking.name : null,
    ownerOptions: USERS.map((u) => ({ name: u.name, department: u.department })), principalOptions: PRINCIPAL_OPTIONS.map((p) => ({ id: p.id, label: p.label })),
    purposeOptions: approvedTags.map((t) => ({ id: t.id, name: t.name })), currentPrincipals: principals,
    canSubmit: checks.slice(0, 4).every((c) => c.state === "pass" || c.state === "na") && !ra.submitted && !ra.approved,
    nextVersion: (active?.number ?? 0) + 1,
  };
}

function plural(n: number, noun: string): string { return `${n} ${noun}${n === 1 ? "" : "s"}`; }
