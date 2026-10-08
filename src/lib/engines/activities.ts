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
