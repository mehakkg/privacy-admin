import { db } from "@/lib/db";
import { audited, type AuditActor } from "@/lib/engines/audit";
import { encodeObject, decodeObject } from "@/lib/codec/json";
import {
  renderValue, choiceLabel, strengthOf, directionOf,
  TIERS, TIER_DEFAULT_RANK, LEGAL_MIN_RANK, inferDataType, deriveMasking, strengthLabel,
  type Masking, type GridFieldRow, type AudienceVisibility, type CategoryHeader,
  type AudienceInfo, type ChannelInfo, type PolicyCheck, type ImpactItem, type FieldStatus,
  type Tier,
} from "@/lib/maskingpolicy";

/**
 * MASKING POLICY ENGINE (server).
 *
 * A PolicyVersion is a full snapshot (field decisions = the "everyone sees"
 * baseline, plus audiences, channels and grants). Audience grants only ADD
 * visibility over the baseline; the most permissive wins. Regulated fields are
 * locked to their legal minimum. With no active version every field is hidden.
 */

function err(name: string, message: string, extra?: Record<string, unknown>) {
  return Object.assign(new Error(message), { name, ...(extra ?? {}) });
}
const parseMask = (j: string | null | undefined): Masking | null => (j ? decodeObject<Masking>(j) : null) ?? null;

// --- Catalog ---------------------------------------------------------------

export async function getCategories() {
  return db.mPCategory.findMany({ orderBy: { sortOrder: "asc" } });
}

// --- Version loading --------------------------------------------------------

export async function getActiveVersion() {
  return db.mPPolicyVersion.findFirst({ where: { state: "active" } });
}
export async function getDraft() {
  return db.mPPolicyVersion.findFirst({ where: { state: "draft" } });
}
export async function getVersionByNumber(n: number) {
  return db.mPPolicyVersion.findUnique({ where: { number: n } });
}
export async function listVersions() {
  return db.mPPolicyVersion.findMany({ orderBy: { number: "desc" } });
}

interface FullVersion {
  id: string; number: number; state: string; basedOn: number | null;
  decisions: { fieldCode: string; maskingJson: string | null; status: string; reviewed: boolean; mode: string; overrideReason: string | null; heldRank: number | null }[];
  audiences: { id: string; label: string; identifier: string; sortOrder: number }[];
  channels: { id: string; label: string; identifier: string }[];
  grants: { id: string; audienceId: string; fieldCode: string; channelScopeJson: string; visibility: string; direction: string; maskingJson: string | null; reason: string | null }[];
  sensitivityRules: { tier: string; rank: number }[];
}

/** The tier→rank map for a version, falling back to the defaults for any missing tier. */
function tierRankMap(v: Pick<FullVersion, "sensitivityRules">): Record<string, number> {
  const m: Record<string, number> = { ...TIER_DEFAULT_RANK };
  for (const r of v.sensitivityRules) m[r.tier] = r.rank;
  return m;
}

async function loadFull(versionId: string): Promise<FullVersion | null> {
  const v = await db.mPPolicyVersion.findUnique({
    where: { id: versionId },
    include: { decisions: true, audiences: { orderBy: { sortOrder: "asc" } }, channels: true, grants: true, sensitivityRules: true },
  });
  if (!v) return null;
  return { id: v.id, number: v.number, state: v.state, basedOn: v.basedOn, decisions: v.decisions, audiences: v.audiences, channels: v.channels, grants: v.grants, sensitivityRules: v.sensitivityRules };
}

// --- Resolution (grid + per-audience effective visibility) ------------------

interface ResolvedField extends GridFieldRow {}

/** Nearest strength rank a stored/custom masking corresponds to, for display. */
function approxRank(dataType: ReturnType<typeof inferDataType>, masking: Masking | null, sample: string, fullRaw = false): number {
  if (fullRaw || masking?.family === "reveal") return 0;
  if (!masking || masking.family === "full") return 4;
  const target = strengthOf(masking, sample, false);
  let best = 2, bestDiff = Infinity;
  for (const r of [3, 2, 1]) {
    const d = deriveMasking(dataType, r, false).masking;
    const diff = Math.abs(strengthOf(d, sample, false) - target);
    if (diff < bestDiff) { bestDiff = diff; best = r; }
  }
  return best;
}

function resolveGrid(v: FullVersion, fields: { code: string; displayName: string; categoryId: string; origin: string; regulated: boolean; legalMinimumJson: string | null; sampleValue: string; usedByApps: boolean; announcedByJson?: string; firstSeen: Date; sensitivity: string }[], activeFieldCodes?: Set<string>): ResolvedField[] {
  const decByCode = new Map(v.decisions.map((d) => [d.fieldCode, d]));
  const chanLabel = new Map(v.channels.map((c) => [c.id, c.label]));
  const rankMap = tierRankMap(v);
  return fields.map((f) => {
    const dec = decByCode.get(f.code);
    const notUsed = !f.usedByApps;
    const dataType = inferDataType(f.code);
    const tier = f.sensitivity;
    const tierDefined = (TIERS as string[]).includes(tier);
    const mode = (dec?.mode as "follows" | "custom" | "held") ?? "follows";
    const heldRank = dec?.heldRank ?? null;

    // The strength the field's tier would give (post legal-min cap). 4 when unclassified.
    const tierDerived = tierDefined ? deriveMasking(dataType, rankMap[tier] ?? TIER_DEFAULT_RANK[tier] ?? 4, f.regulated) : null;
    const tierRank = tierDerived ? tierDerived.rank : 4;

    // Classification + usage drive status. Marked-not-used → hidden; unclassified → needs a decision.
    const markedNotUsed = notUsed || dec?.status === "not_used";
    let status: FieldStatus;
    let baseMask: Masking | null;
    let strengthRank: number;
    let cappedByLaw = false;
    let effectiveMode: "follows" | "custom" | "held" = mode;

    if (markedNotUsed) {
      status = "not_used"; baseMask = null; strengthRank = 4; effectiveMode = "follows";
    } else if (!tierDefined) {
      // Not classified → stays fully hidden until it is classified.
      status = "needs_decision"; baseMask = null; strengthRank = 4; effectiveMode = "held";
    } else if (mode === "custom") {
      status = "ready";
      baseMask = parseMask(dec?.maskingJson);
      strengthRank = approxRank(dataType, baseMask, f.sampleValue);
    } else if (mode === "held") {
      status = "ready";
      const d = deriveMasking(dataType, heldRank ?? tierRank, f.regulated);
      baseMask = d.masking; strengthRank = d.rank; cappedByLaw = d.cappedByLaw;
    } else {
      status = "ready";
      baseMask = tierDerived!.masking; strengthRank = tierDerived!.rank; cappedByLaw = tierDerived!.cappedByLaw;
    }

    const baseHidden = !baseMask;
    const baseStrength = strengthOf(baseMask, f.sampleValue, false);
    const baseExample = renderValue(baseMask, f.sampleValue, false);

    // Restrictions on this field held by ANY audience, for overlap notes on grants.
    const restrictionAudiences = v.audiences.filter((a) => v.grants.some((gr) => gr.audienceId === a.id && gr.fieldCode === f.code && gr.direction === "less"));
    const audiences: AudienceVisibility[] = v.audiences.map((a) => {
      const base = { audienceId: a.id, noLongerNeeded: false, overlaps: [] as string[], grant: null } as const;
      if (notUsed) return { ...base, kind: "not_used", example: "—", choiceLabel: "Not used", channelLabel: null, reason: null };
      const g = v.grants.find((gr) => gr.audienceId === a.id && gr.fieldCode === f.code);
      // Regulated: no grant possible beyond the legal minimum, but a restriction IS allowed.
      if (f.regulated && (!g || g.direction !== "less")) return { ...base, kind: "locked", example: baseExample, choiceLabel: choiceLabel(baseMask, false), channelLabel: null, reason: null };
      if (!g) return { ...base, kind: "same", example: baseExample, choiceLabel: "Same", channelLabel: null, reason: null };
      const gMask = parseMask(g.maskingJson);
      const scope = decodeObject<string[] | string>(g.channelScopeJson);
      const channelIds = Array.isArray(scope) ? scope : [];
      const channelLabel = channelIds.length ? channelIds.map((id) => chanLabel.get(id) ?? id).join(", ") : null;

      if (g.direction === "less") {
        const rStrength = strengthOf(gMask, f.sampleValue, false);
        const noLongerNeeded = rStrength >= baseStrength; // restriction no longer reveals less
        return { ...base, kind: noLongerNeeded ? "same" : "less", noLongerNeeded, example: renderValue(gMask, f.sampleValue), choiceLabel: choiceLabel(gMask, false), channelLabel, reason: null, grant: { direction: "less", fullRaw: false, family: gMask?.family ?? "full", params: gMask?.params ?? {}, channelIds, reason: null } };
      }
      // grant (more | full_raw)
      const fullRaw = g.visibility === "full_raw";
      const gStrength = strengthOf(gMask, f.sampleValue, fullRaw);
      const noLongerNeeded = gStrength <= baseStrength;
      // Overlap: other audiences restrict this field with overlapping scope.
      const overlaps = restrictionAudiences.filter((ra) => ra.id !== a.id).map((ra) => ra.label);
      return {
        ...base, kind: noLongerNeeded ? "same" : fullRaw ? "full_raw" : "more", noLongerNeeded, overlaps,
        example: renderValue(gMask, f.sampleValue, fullRaw), choiceLabel: choiceLabel(gMask, fullRaw), channelLabel, reason: g.reason ?? null,
        grant: { direction: "more", fullRaw, family: gMask?.family ?? "partial", params: gMask?.params ?? {}, channelIds, reason: g.reason ?? null },
      };
    });

    return {
      code: f.code, displayName: f.displayName, categoryId: f.categoryId, origin: f.origin,
      regulated: f.regulated, status,
      isNew: !!activeFieldCodes && !activeFieldCodes.has(f.code),
      announced: ((decodeObject<string[]>(f.announcedByJson ?? "[]") ?? []).length > 0),
      sampleValue: f.sampleValue,
      legalMinimum: parseMask(f.legalMinimumJson),
      sensitivity: tier,
      dataType,
      mode: effectiveMode,
      tierRank,
      strengthRank,
      cappedByLaw,
      overrideReason: dec?.overrideReason ?? null,
      heldRank,
      baseline: { example: baseExample, choiceLabel: choiceLabel(baseMask, false), masking: baseMask, hidden: baseHidden },
      audiences,
    };
  });
}

export interface GridView {
  version: { id: string; number: number; state: string; basedOn: number | null };
  categories: CategoryHeader[];
  rows: GridFieldRow[];
  audiences: AudienceInfo[];
  channels: ChannelInfo[];
  exposure: { more: number; fullRaw: number };
}

export async function getGrid(versionId: string): Promise<GridView | null> {
  const v = await loadFull(versionId);
  if (!v) return null;
  const [fields, cats, active] = await Promise.all([
    db.mPField.findMany({ orderBy: { displayName: "asc" } }),
    getCategories(),
    getActiveVersion(),
  ]);
  const activeCodes = active ? new Set((await db.mPFieldDecision.findMany({ where: { versionId: active.id }, select: { fieldCode: true } })).map((d) => d.fieldCode)) : undefined;
  const rows = resolveGrid(v, fields, activeCodes);
  const categories: CategoryHeader[] = cats.map((c) => {
    const members = rows.filter((r) => r.categoryId === c.id);
    return { id: c.id, name: c.name, definition: c.definition, fieldCount: members.length, regulatedCount: members.filter((m) => m.regulated).length, changedCount: members.filter((m) => m.isNew).length };
  }).filter((c) => c.fieldCount > 0);
  const audiences: AudienceInfo[] = v.audiences.map((a) => ({ id: a.id, label: a.label, identifier: a.identifier }));
  const channels: ChannelInfo[] = v.channels.map((c) => ({ id: c.id, label: c.label, identifier: c.identifier }));
  const more = v.audiences.reduce((n, a) => n + (rows.some((r) => r.audiences.find((x) => x.audienceId === a.id && (x.kind === "more" || x.kind === "full_raw"))) ? 1 : 0), 0);
  const fullRaw = v.audiences.reduce((n, a) => n + (rows.some((r) => r.audiences.find((x) => x.audienceId === a.id && x.kind === "full_raw")) ? 1 : 0), 0);
  return { version: { id: v.id, number: v.number, state: v.state, basedOn: v.basedOn }, categories, rows, audiences, channels, exposure: { more, fullRaw } };
}

// --- Checks -----------------------------------------------------------------

export async function getChecks(versionId: string): Promise<PolicyCheck[]> {
  const v = await loadFull(versionId);
  if (!v) return [];
  const fields = await db.mPField.findMany();
  const byCode = new Map(fields.map((f) => [f.code, f]));
  const checks: PolicyCheck[] = [];
  // Blocking: full raw needs a reason; no regulated in full; legal minimum respected.
  for (const g of v.grants) {
    const f = byCode.get(g.fieldCode);
    if (!f) continue;
    if (g.visibility === "full_raw" && f.regulated) checks.push({ key: "no_regulated_in_full", level: "blocking", ok: false, message: `${f.displayName} is protected by law and can never be shown in full.`, anchor: { fieldCode: f.code, audienceId: g.audienceId } });
    if (g.visibility === "full_raw" && !(g.reason ?? "").trim()) checks.push({ key: "full_raw_has_reason", level: "blocking", ok: false, message: `A full raw value needs a reason (${f.displayName}).`, anchor: { fieldCode: f.code, audienceId: g.audienceId } });
  }
  // Blocking: regulated baseline not weaker than legal minimum.
  for (const d of v.decisions) {
    const f = byCode.get(d.fieldCode);
    if (!f || !f.regulated || !f.legalMinimumJson) continue;
    const base = parseMask(d.maskingJson);
    if (base && strengthOf(base, f.sampleValue, false) > strengthOf(parseMask(f.legalMinimumJson), f.sampleValue, false)) {
      checks.push({ key: "legal_minimum", level: "blocking", ok: false, message: `${f.displayName} reveals more than its legal minimum.`, anchor: { fieldCode: f.code } });
    }
  }
  // Warning: undecided fields stay hidden.
  const undecided = v.decisions.filter((d) => d.status === "needs_decision").length + fields.filter((f) => f.usedByApps && !v.decisions.find((d) => d.fieldCode === f.code)).length;
  if (undecided > 0) checks.push({ key: "undecided_fields", level: "warning", ok: true, message: `${undecided} field${undecided === 1 ? "" : "s"} have no decision and stay fully hidden.` });
  // Info: overlapping rules — most permissive wins.
  checks.push({ key: "overlapping_rules", level: "info", ok: true, message: "When several rules apply to someone, the one that shows the most wins." });
  // If nothing blocking, add a passing legal/full-raw summary line.
  if (!checks.some((c) => c.level === "blocking")) checks.unshift({ key: "all_pass", level: "info", ok: true, message: "All blocking checks pass." });
  return checks;
}

// --- Impact (draft vs the active version it is based on) --------------------

export interface ImpactSummary { items: ImpactItem[]; counts: { changes: number; looser: number; tighter: number; neutral: number; fullRaw: number }; hiddenFields: string[] }

const emptyImpact: ImpactSummary = { items: [], counts: { changes: 0, looser: 0, tighter: 0, neutral: 0, fullRaw: 0 }, hiddenFields: [] };

export async function getImpact(draftId: string): Promise<ImpactSummary> {
  const draft = await loadFull(draftId);
  if (!draft) return emptyImpact;
  const active = draft.basedOn != null ? await getVersionByNumber(draft.basedOn) : await getActiveVersion();
  const prior = active ? await loadFull(active.id) : null;
  return compareVersions(draft, prior);
}

/** Impact of an activated version vs the one before it (for the Live screen). */
export async function getVersionImpact(number: number): Promise<ImpactSummary> {
  const v = await getVersionByNumber(number);
  if (!v) return emptyImpact;
  const target = await loadFull(v.id);
  if (!target) return emptyImpact;
  const prev = await getVersionByNumber(number - 1);
  const prior = prev ? await loadFull(prev.id) : null;
  return compareVersions(target, prior);
}

async function compareVersions(target: FullVersion, prior: FullVersion | null): Promise<ImpactSummary> {
  const draft = target;
  const fields = await db.mPField.findMany();
  const byCode = new Map(fields.map((f) => [f.code, f]));

  // Resolve the prior version too, so follows-mode baselines compare correctly.
  const priorGrid = prior ? resolveGrid(prior, fields.map((f) => f)) : [];
  const priorByCode = new Map(priorGrid.map((r) => [r.code, r]));

  const priorCell = (audienceLabel: string | null, code: string): { strength: number; example: string } => {
    const f = byCode.get(code)!;
    const pr = priorByCode.get(code);
    if (!prior || !pr) return { strength: 0, example: renderValue(null, f.sampleValue) };
    if (audienceLabel === null || f.regulated) return { strength: strengthOf(pr.baseline.masking, f.sampleValue), example: pr.baseline.example };
    // match audience by label against the prior snapshot (ids differ across snapshots)
    const pAud = prior.audiences.find((a) => a.label === audienceLabel);
    const cell = pAud ? pr.audiences.find((x) => x.audienceId === pAud.id) : null;
    if (!cell || !cell.grant) return { strength: strengthOf(pr.baseline.masking, f.sampleValue), example: pr.baseline.example };
    const fr = cell.grant.fullRaw;
    const gm = fr ? null : ({ family: cell.grant.family, params: cell.grant.params } as Masking);
    return { strength: strengthOf(gm, f.sampleValue, fr), example: cell.example };
  };

  const items: ImpactItem[] = [];
  const grid = resolveGrid(draft, fields.map((f) => f));
  for (const f of fields) {
    const row = grid.find((r) => r.code === f.code)!;
    // Everyone
    const nowBase = strengthOf(row.baseline.masking, f.sampleValue);
    const wasBase = priorCell(null, f.code);
    if (nowBase !== wasBase.strength) items.push({ audienceId: null, audienceLabel: "Everyone", fieldCode: f.code, fieldName: f.displayName, channelLabel: null, before: wasBase.example, after: row.baseline.example, afterLabel: row.baseline.choiceLabel, direction: directionOf(wasBase.strength, nowBase), fullRaw: false, reason: null });
    // Audiences
    for (const a of draft.audiences) {
      const cell = row.audiences.find((x) => x.audienceId === a.id)!;
      if (cell.kind === "not_used" || cell.kind === "locked") continue;
      const nowStrength = cell.kind === "same" ? nowBase : strengthOf(cell.kind === "full_raw" ? null : parseMask(draft.grants.find((g) => g.audienceId === a.id && g.fieldCode === f.code)?.maskingJson ?? null), f.sampleValue, cell.kind === "full_raw");
      const was = priorCell(a.label, f.code);
      if (nowStrength !== was.strength) items.push({ audienceId: a.id, audienceLabel: a.label, fieldCode: f.code, fieldName: f.displayName, channelLabel: cell.channelLabel, before: was.example, after: cell.example, afterLabel: cell.choiceLabel, direction: directionOf(was.strength, nowStrength), fullRaw: cell.kind === "full_raw", reason: cell.reason });
    }
  }
  const counts = {
    changes: items.length,
    looser: items.filter((i) => i.direction === "Looser").length,
    tighter: items.filter((i) => i.direction === "Tighter").length,
    neutral: items.filter((i) => i.direction === "Neutral").length,
    fullRaw: draft.grants.filter((g) => g.visibility === "full_raw").length,
  };
  const hiddenFields = fields.filter((f) => !f.usedByApps || !draft.decisions.find((d) => d.fieldCode === f.code && d.status === "ready")).map((f) => f.displayName);
  return { items, counts, hiddenFields };
}

function impactSentence(s: ImpactSummary): string {
  const audiencesMore = new Set(s.items.filter((i) => i.audienceId && i.direction === "Looser").map((i) => i.audienceId)).size;
  if (audiencesMore === 0 && s.counts.fullRaw === 0) return "No audience sees more than everyone else.";
  const parts: string[] = [];
  if (audiencesMore) parts.push(`${audiencesMore} audience${audiencesMore === 1 ? "" : "s"} see more than everyone else`);
  if (s.counts.fullRaw) parts.push(`${s.counts.fullRaw} see${s.counts.fullRaw === 1 ? "s" : ""} full raw values`);
  return parts.join(" · ") + ".";
}

// --- Review -----------------------------------------------------------------

export interface ReviewRisk { type: "full_raw" | "sensitive_loosened_for_everyone"; audience: string | null; field: string; reason: string | null }
export interface ReviewChangeField {
  fieldCode: string; fieldName: string; direction: "more" | "less" | "neutral"; who: string; inheritedNote: boolean;
  everyone: { before: string; after: string; descriptor: string } | null;
  audiences: { label: string; before: string; after: string; descriptor: string; channelLabel: string | null; fullRaw: boolean; reason: string | null; direction: string }[];
}
export interface FirstActivationData { willShow: number; hidden: string[]; audiencesMore: number; categories: { name: string; fields: { name: string; example: string; label: string }[] }[] }
export interface ReviewData {
  draftId: string; number: number;
  verdict: "ready" | "blocked" | "nothing_to_activate";
  issues: { message: string; target: string }[];
  summary: string;
  risks: ReviewRisk[];
  changes: ReviewChangeField[];
  undecided: string[];
  firstActivation: boolean;
  firstActivationData: FirstActivationData | null;
}

export async function getReview(draftId: string): Promise<ReviewData | null> {
  const draft = await db.mPPolicyVersion.findUnique({ where: { id: draftId } });
  if (!draft || draft.state !== "draft") return null;
  const [impact, checks, full, fields] = await Promise.all([getImpact(draftId), getChecks(draftId), loadFull(draftId), db.mPField.findMany()]);
  const byCode = new Map(fields.map((f) => [f.code, f]));
  const blocking = checks.filter((c) => c.level === "blocking" && !c.ok);
  const verdict: ReviewData["verdict"] = blocking.length ? "blocked" : impact.counts.changes === 0 ? "nothing_to_activate" : "ready";
  const issues = blocking.map((c) => ({ message: c.message, target: `${MP}?view=workspace&focus=${c.anchor?.fieldCode ? `field:${c.anchor.fieldCode}` : "everyone"}` }));

  // Summary sentence, built from the data.
  const everyoneMore = impact.items.filter((i) => i.audienceId === null && i.direction === "Looser").length;
  const perAud = new Map<string, number>();
  impact.items.filter((i) => i.audienceId && i.direction === "Looser").forEach((i) => perAud.set(i.audienceLabel, (perAud.get(i.audienceLabel) ?? 0) + 1));
  const anyLess = impact.items.some((i) => i.direction === "Tighter");
  const parts = [`${impact.counts.changes} change${impact.counts.changes === 1 ? "" : "s"}.`];
  if (everyoneMore) parts.push(`Everyone sees more of ${everyoneMore} field${everyoneMore === 1 ? "" : "s"}.`);
  if (perAud.size) {
    const counts = [...perAud.values()];
    const allSame = counts.every((n) => n === counts[0]);
    if (allSame) parts.push(`${[...perAud.keys()].join(" and ")} see more of ${counts[0]} each.`);
    else parts.push([...perAud.entries()].map(([l, n]) => `${l} sees more of ${n}`).join(", ") + ".");
  }
  if (anyLess) parts.push("Some changes show less.");
  const summary = parts.join(" ");

  // Risks.
  const risks: ReviewRisk[] = [];
  for (const g of (full?.grants ?? [])) if (g.visibility === "full_raw") { const a = full!.audiences.find((x) => x.id === g.audienceId); risks.push({ type: "full_raw", audience: a?.label ?? null, field: byCode.get(g.fieldCode)?.displayName ?? g.fieldCode, reason: g.reason }); }
  for (const it of impact.items) if (it.audienceId === null && it.direction === "Looser" && byCode.get(it.fieldCode)?.regulated) risks.push({ type: "sensitive_loosened_for_everyone", audience: null, field: it.fieldName, reason: null });

  // Changes grouped by field.
  const codes = [...new Set(impact.items.map((i) => i.fieldCode))];
  const dirMap: Record<string, "more" | "less" | "neutral"> = { Looser: "more", Tighter: "less", Neutral: "neutral" };
  const changes: ReviewChangeField[] = codes.map((code) => {
    const its = impact.items.filter((i) => i.fieldCode === code);
    const ev = its.find((i) => i.audienceId === null) ?? null;
    const auds = its.filter((i) => i.audienceId !== null);
    const primary = ev ?? auds[0];
    return {
      fieldCode: code, fieldName: primary.fieldName, direction: dirMap[primary.direction],
      who: ev ? "Everyone, so all audiences" : auds.map((a) => a.audienceLabel).join(", "),
      inheritedNote: !!ev && (full?.audiences.length ?? 0) > 0,
      everyone: ev ? { before: ev.before, after: ev.after, descriptor: ev.afterLabel } : null,
      audiences: auds.map((a) => ({ label: a.audienceLabel, before: a.before, after: a.after, descriptor: a.afterLabel, channelLabel: a.channelLabel, fullRaw: a.fullRaw, reason: a.reason, direction: dirMap[a.direction] })),
    };
  });

  const undecided = fields.filter((f) => !f.usedByApps || full?.decisions.find((d) => d.fieldCode === f.code && d.status === "needs_decision")).map((f) => f.displayName);

  // First activation (no previous active version): review as "fully hidden → this policy".
  const active = await getActiveVersion();
  const firstActivation = !active;
  let firstActivationData: FirstActivationData | null = null;
  if (firstActivation) {
    const grid = await getGrid(draftId);
    if (grid) {
      const shown = grid.rows.filter((r) => r.status !== "not_used" && !r.baseline.hidden);
      const hidden = grid.rows.filter((r) => r.status === "not_used" || r.baseline.hidden).map((r) => r.displayName);
      const categories = grid.categories.map((c) => ({ name: c.name, fields: grid.rows.filter((r) => r.categoryId === c.id && r.status !== "not_used" && !r.baseline.hidden).map((r) => ({ name: r.displayName, example: r.baseline.example, label: r.baseline.choiceLabel })) })).filter((c) => c.fields.length > 0);
      firstActivationData = { willShow: shown.length, hidden, audiencesMore: grid.exposure.more, categories };
    }
  }

  return { draftId, number: draft.number, verdict, issues, summary, risks, changes, undecided, firstActivation, firstActivationData };
}

// --- Live -------------------------------------------------------------------

export interface LiveData { number: number; reason: string | null; topAudience: string; prev: number | null }
export async function getLive(number: number): Promise<LiveData | null> {
  const v = await getVersionByNumber(number);
  if (!v) return null;
  const impact = await getVersionImpact(number);
  const perAud = new Map<string, number>();
  impact.items.filter((i) => i.audienceId).forEach((i) => perAud.set(i.audienceLabel, (perAud.get(i.audienceLabel) ?? 0) + 1));
  const top = [...perAud.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Everyone";
  return { number, reason: v.whyNote, topAudience: top, prev: number - 1 >= 1 ? number - 1 : null };
}

// --- Home -------------------------------------------------------------------

export interface AttentionItem { id: string; ai: number; severity: "check" | "decide" | "next_step" | "heads_up"; ageText: string; title: string; detail: string; verb: string; destination: string; href: string }
export interface HomeData {
  active: { number: number; activatedBy: string | null; activatedAt: string | null; whyNote: string | null; impact: string | null } | null;
  draft: { id: string; number: number; basedOn: number | null; changes: number; savedAt: string } | null;
  decisionsOpen: number;
  attention: AttentionItem[];
  prevVersion: { number: number; when: string | null; who: string | null } | null;
  versionCount: number;
}

const MP = "/data-flow/masking-policy";
const SEV_ORDER: Record<string, number> = { check: 0, decide: 1, next_step: 1, heads_up: 2 };

/** One date format across the product: "6 Oct 2026, 05:16". */
export function fmtDate(d: Date | null | undefined, withTime = false): string | null {
  if (!d) return null;
  const date = new Date(d);
  const base = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return withTime ? `${base}, ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : base;
}
function ageText(d: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} minutes ago`;
  const h = Math.floor(s / 3600); if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const dd = Math.floor(h / 24); return `${dd} day${dd === 1 ? "" : "s"} ago`;
}
function andList(xs: string[]): string { return xs.length <= 1 ? (xs[0] ?? "") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]; }

export async function getHome(): Promise<HomeData> {
  const [active, draft, attn, versions] = await Promise.all([
    getActiveVersion(), getDraft(), db.mPNeedsAttention.findMany(), listVersions(),
  ]);
  let draftChanges = 0, decisionsOpen = 0;
  let undecidedNames: string[] = [];
  if (draft) {
    draftChanges = (await getImpact(draft.id)).counts.changes;
    const undecided = await db.mPFieldDecision.findMany({ where: { versionId: draft.id, status: "needs_decision" } });
    decisionsOpen = undecided.length;
    if (undecided.length) { const fs = await db.mPField.findMany({ where: { code: { in: undecided.map((d) => d.fieldCode) } }, select: { displayName: true } }); undecidedNames = fs.map((f) => f.displayName); }
  } else {
    decisionsOpen = attn.filter((a) => a.type === "new_app_field").reduce((n, a) => n + a.count, 0);
  }
  const draftN = draft?.number;
  const activeN = active?.number;

  const items: AttentionItem[] = attn.map((a) => {
    if (a.type === "fallback_events") return {
      id: a.id, ai: 0, severity: "check", ageText: ageText(a.createdAt), title: `${a.count} fields were hidden by the fail-safe in the last 24 hours`,
      detail: "People saw blanks instead of values. Cause: No policy was active · ddm-sample-fiduciary-app.",
      verb: `See the ${a.count} fields`, destination: "Opens Audit trail › Fail-safe events, filtered", href: `${MP}/audit?tab=failsafe&from=attention&ai=0`,
    };
    if (a.type === "catalog_update") return {
      id: a.id, ai: 2, severity: "heads_up", ageText: ageText(a.createdAt), title: "Catalog update affects Aadhaar",
      detail: `Catalog version 2 changed the Aadhaar format. Version ${activeN ?? "?"} meets it.`,
      verb: "Review Aadhaar", destination: `Opens Draft ${draftN ?? "new"} › Aadhaar`, href: `${MP}?view=workspace&focus=field:AADHAAR&from=attention&ai=2`,
    };
    // new_app_field → Decide, or Next step once decided in the draft
    const n = a.count;
    if (draft && decisionsOpen === 0) return {
      id: a.id, ai: 1, severity: "next_step", ageText: ageText(a.createdAt), title: `${n} fields decided in Draft ${draftN}`,
      detail: "They go live when you activate.", verb: "Review and activate", destination: `Opens Draft ${draftN} › Review`, href: `${MP}?view=review&from=attention&ai=1`,
    };
    const names = (undecidedNames.length ? undecidedNames : ["City", "Device identifier", "IP address"]).slice(0, 3);
    return {
      id: a.id, ai: 1, severity: "decide", ageText: ageText(a.createdAt), title: `${n} new fields seen in your applications`,
      detail: `${andList(names)} stay fully hidden until you decide.`, verb: `Decide ${n} fields`, destination: `Opens Draft ${draftN ?? "new"} › Decisions`, href: `${MP}?view=workspace&focus=decisions&from=attention&ai=1`,
    };
  }).sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);

  const archived = versions.filter((v) => v.state === "archived");
  const prev = archived[0] ?? null;
  return {
    active: active ? { number: active.number, activatedBy: active.activatedBy, activatedAt: fmtDate(active.activatedAt, true), whyNote: active.whyNote, impact: active.impactSummary } : null,
    draft: draft ? { id: draft.id, number: draft.number, basedOn: draft.basedOn, changes: draftChanges, savedAt: new Date(draft.updatedAt).toISOString().slice(11, 16) } : null,
    decisionsOpen,
    attention: items,
    prevVersion: prev ? { number: prev.number, when: fmtDate(prev.activatedAt), who: prev.activatedBy } : null,
    versionCount: versions.filter((v) => v.state !== "draft").length,
  };
}

/** Attention sequence for the landing context bar (Back/Next across items). */
export async function getAttentionSequence(): Promise<{ ai: number; verb: string; href: string }[]> {
  const home = await getHome();
  return home.attention.map((i) => ({ ai: i.ai, verb: i.verb, href: i.href }));
}

// --- Mutations (draft autosave + lifecycle) ---------------------------------

async function nextNumber(): Promise<number> {
  const top = await db.mPPolicyVersion.findFirst({ orderBy: { number: "desc" } });
  return (top?.number ?? 0) + 1;
}

/** Create a draft seeded from the active version (or empty). One draft at a time. */
export async function startDraft(actor: AuditActor): Promise<string> {
  const existing = await getDraft();
  if (existing) return existing.id;
  const active = await getActiveVersion();
  const number = await nextNumber();
  const draft = await db.mPPolicyVersion.create({ data: { number, state: "draft", basedOn: active?.number ?? null } });
  if (active) await copySnapshot(active.id, draft.id);
  else {
    // No active version: every field FOLLOWS its sensitivity tier (default rank map).
    const fields = await db.mPField.findMany();
    for (const f of fields) {
      await db.mPFieldDecision.create({ data: { versionId: draft.id, fieldCode: f.code, maskingJson: null, status: f.usedByApps ? "ready" : "not_used", mode: "follows", reviewed: false } });
    }
    await ensureSensitivityRules(draft.id);
  }
  return draft.id;
}

/** Make sure a version has a tier→rank rule for every tier (defaults when missing). */
async function ensureSensitivityRules(versionId: string) {
  const existing = await db.mPSensitivityRule.findMany({ where: { versionId } });
  const have = new Set(existing.map((r) => r.tier));
  for (const t of TIERS) {
    if (!have.has(t)) await db.mPSensitivityRule.create({ data: { versionId, tier: t, rank: TIER_DEFAULT_RANK[t] } });
  }
}

async function copySnapshot(fromId: string, toId: string) {
  const src = await loadFull(fromId);
  if (!src) return;
  for (const d of src.decisions) await db.mPFieldDecision.create({ data: { versionId: toId, fieldCode: d.fieldCode, maskingJson: d.maskingJson, status: d.status, mode: d.mode, overrideReason: d.overrideReason, heldRank: d.heldRank, reviewed: d.reviewed } });
  for (const r of src.sensitivityRules) await db.mPSensitivityRule.create({ data: { versionId: toId, tier: r.tier, rank: r.rank } });
  await ensureSensitivityRules(toId);
  const idMap = new Map<string, string>();
  for (const a of src.audiences) { const na = await db.mPAudience.create({ data: { versionId: toId, label: a.label, identifier: a.identifier, sortOrder: a.sortOrder } }); idMap.set(a.id, na.id); }
  const chMap = new Map<string, string>();
  for (const c of src.channels) { const nc = await db.mPChannel.create({ data: { versionId: toId, label: c.label, identifier: c.identifier } }); chMap.set(c.id, nc.id); }
  for (const g of src.grants) {
    const scope = decodeObject<string[] | string>(g.channelScopeJson);
    const newScope = Array.isArray(scope) ? scope.map((id) => chMap.get(id) ?? id) : scope;
    await db.mPGrant.create({ data: { versionId: toId, audienceId: idMap.get(g.audienceId)!, fieldCode: g.fieldCode, channelScopeJson: encodeObject(newScope), visibility: g.visibility, direction: g.direction, maskingJson: g.maskingJson, reason: g.reason } });
  }
}

export async function discardDraft(): Promise<void> {
  const draft = await getDraft();
  if (draft) await db.mPPolicyVersion.delete({ where: { id: draft.id } });
}

async function requireDraft(versionId: string) {
  const v = await db.mPPolicyVersion.findUnique({ where: { id: versionId } });
  if (!v || v.state !== "draft") throw err("ValidationError", "This is not an editable draft.");
  await db.mPPolicyVersion.update({ where: { id: versionId }, data: { updatedAt: new Date() } });
  return v;
}

export async function setFieldCategory(code: string, categoryId: string) {
  await db.mPField.update({ where: { code }, data: { categoryId } });
}

/** Classify a field into a sensitivity tier (field-level; drives its default masking). */
export async function classifyField(code: string, tier: Tier) {
  if (!(TIERS as string[]).includes(tier)) throw err("ValidationError", "Pick a sensitivity tier.");
  await db.mPField.update({ where: { code }, data: { sensitivity: tier } });
}

// --- Data catalog -----------------------------------------------------------

export interface CatalogRow {
  code: string; displayName: string; categoryId: string; categoryName: string; categoryDef: string;
  sensitivity: string; regulated: boolean; source: string; seen: boolean;
  applications: { name: string; firstSeen: string; lastSeen: string }[];
  recommendation: { label: string; example: string; basis: string; basisText: string; params: string | null };
  policy: { status: "in_use" | "not_decided" | "not_used" | "no_policy"; words: string; example: string; differs: boolean; version: number | null; recExample: string };
  actionVerb: string | null; actionHref: string | null;
}
export interface DataCatalog {
  rows: CatalogRow[];
  counts: { found: number; inUse: number; notDecided: number; notUsed: number; regulated: number; notClassified: number; notSeen: number };
  activeNumber: number | null; draftNumber: number | null;
}

function parseApps(j: string): { name: string; firstSeen: string; lastSeen: string }[] {
  const arr = decodeObject<unknown[]>(j) ?? [];
  return arr.map((a) => typeof a === "string" ? { name: a, firstSeen: "—", lastSeen: "—" } : (a as { name: string; firstSeen: string; lastSeen: string }));
}

export async function getDataCatalog(): Promise<DataCatalog> {
  const [fields, cats, active, draft] = await Promise.all([
    db.mPField.findMany({ orderBy: { displayName: "asc" } }),
    getCategories(), getActiveVersion(), getDraft(),
  ]);
  const catMap = new Map(cats.map((c) => [c.id, c]));
  // Resolve the active version's effective baseline per field (sensitivity-driven).
  const activeFull = active ? await loadFull(active.id) : null;
  const baseByCode = new Map((activeFull ? resolveGrid(activeFull, fields) : []).map((r) => [r.code, r]));

  const rows: CatalogRow[] = fields.map((f) => {
    const apps = parseApps(f.announcedByJson);
    const seen = apps.length > 0;
    const notClassified = !(TIERS as string[]).includes(f.sensitivity);
    // Recommendation
    let rec: CatalogRow["recommendation"];
    const legal = parseMask(f.legalMinimumJson);
    const recMask = parseMask(f.recommendedJson);
    if (f.regulated && legal) rec = { label: choiceLabel(legal, false), example: renderValue(legal, f.sampleValue), basis: "legal_minimum", basisText: "Legal minimum.", params: null };
    else if (notClassified || !recMask) rec = { label: "No recommendation yet", example: "—", basis: "none", basisText: "Not classified", params: null };
    else if (f.origin === "platform") rec = { label: choiceLabel(recMask, false), example: renderValue(recMask, f.sampleValue), basis: "platform_catalog", basisText: "From platform catalog version 1.", params: null };
    else rec = { label: choiceLabel(recMask, false), example: renderValue(recMask, f.sampleValue), basis: "suggested", basisText: "Suggested from other fields with the same category and sensitivity. Check it before relying on it.", params: null };

    // Policy usage (active version) — reflects the effective, sensitivity-driven baseline.
    const row = baseByCode.get(f.code);
    let policy: CatalogRow["policy"];
    if (!active || !row) policy = { status: "no_policy", words: "No policy yet. Fully hidden.", example: renderValue(null, f.sampleValue), differs: false, version: null, recExample: rec.example };
    else if (row.status === "needs_decision") policy = { status: "not_decided", words: "Not classified. Stays fully hidden.", example: renderValue(null, f.sampleValue), differs: false, version: active.number, recExample: rec.example };
    else if (row.status === "not_used") policy = { status: "not_used", words: "Marked not used. Stays fully hidden if it appears.", example: renderValue(null, f.sampleValue), differs: false, version: active.number, recExample: rec.example };
    else { const ex = row.baseline.example; policy = { status: "in_use", words: row.baseline.choiceLabel, example: ex, differs: rec.basis !== "none" && ex !== rec.example, version: active.number, recExample: rec.example }; }

    const actionVerb = !seen ? null : policy.status === "not_decided" ? "Decide" : "View in policy";
    const actionHref = !seen ? null : policy.status === "not_decided" ? `${MP}?view=workspace&focus=decisions` : (draft ? `${MP}?view=workspace&focus=field:${f.code}` : active ? `${MP}?version=${active.number}` : null);

    return {
      code: f.code, displayName: f.displayName, categoryId: f.categoryId, categoryName: catMap.get(f.categoryId)?.name ?? "—", categoryDef: catMap.get(f.categoryId)?.definition ?? "",
      sensitivity: f.sensitivity, regulated: f.regulated, source: f.origin, seen, applications: apps,
      recommendation: rec, policy, actionVerb, actionHref,
    };
  });

  const seenRows = rows.filter((r) => r.seen);
  const counts = {
    found: seenRows.length,
    inUse: seenRows.filter((r) => r.policy.status === "in_use").length,
    notDecided: seenRows.filter((r) => r.policy.status === "not_decided").length,
    notUsed: seenRows.filter((r) => r.policy.status === "not_used").length,
    regulated: seenRows.filter((r) => r.regulated).length,
    notClassified: seenRows.filter((r) => !(TIERS as string[]).includes(r.sensitivity)).length,
    notSeen: rows.filter((r) => !r.seen).length,
  };
  return { rows, counts, activeNumber: active?.number ?? null, draftNumber: draft?.number ?? null };
}

// --- Add a field / custom field management ----------------------------------

/** Live check for the Add-a-field modal. */
export async function checkFieldCode(rawCode: string): Promise<{ taken: "none" | "custom" | "platform"; categoryName?: string }> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { taken: "none" };
  const f = await db.mPField.findUnique({ where: { code }, include: { category: true } });
  if (!f) return { taken: "none" };
  return { taken: f.origin === "platform" ? "platform" : "custom", categoryName: f.category?.name };
}

export interface AddFieldInput { code: string; displayName: string; categoryId: string; masking: Masking | null; sampleValue: string; sensitivity?: Tier }
export async function addCustomField(draftId: string, input: AddFieldInput) {
  await requireDraft(draftId);
  const code = input.code.trim().toUpperCase();
  if (!code) throw err("ValidationError", "Give the field a code.");
  if (!/^[A-Z0-9_]+$/.test(code)) throw err("ValidationError", "Use capital letters, digits and underscores only.");
  if (!input.categoryId) throw err("ValidationError", "Choose what kind of data this is.");
  const existing = await db.mPField.findUnique({ where: { code } });
  if (existing) {
    if (existing.origin === "platform") throw err("PlatformField", `${code} is a platform field.`, { code });
    throw err("DuplicateField", `${code} is already in your policy.`, { code });
  }
  // A new field is classified so it resolves under the sensitivity model (Internal by default).
  const sensitivity: Tier = input.sensitivity && (TIERS as string[]).includes(input.sensitivity) ? input.sensitivity : "Internal";
  await db.mPField.create({ data: { code, displayName: input.displayName.trim() || code.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), categoryId: input.categoryId, origin: "your_organization", regulated: false, sensitivity, sampleValue: input.sampleValue.trim() || "sample-value", usedByApps: true, announcedByJson: "[]" } });
  // If a masking was chosen it becomes a custom baseline; otherwise the field follows its tier.
  await db.mPFieldDecision.create({ data: { versionId: draftId, fieldCode: code, maskingJson: input.masking ? encodeObject(input.masking) : null, status: "ready", mode: input.masking ? "custom" : "follows", reviewed: true } });
  return { code };
}

export async function removeCustomField(code: string) {
  const f = await db.mPField.findUnique({ where: { code } });
  if (!f) throw err("NotFoundError", "No such field.");
  if (f.origin !== "your_organization") throw err("ForbiddenError", "Platform fields can't be removed.");
  await db.mPField.delete({ where: { code } });
}

// --- Sensitivity-driven masking --------------------------------------------

export interface SensitivityRuleView { tier: Tier; rank: number; label: string }
/** The tier→strength rules for a version, defaulting any missing tier. */
export async function getSensitivityRules(versionId: string): Promise<SensitivityRuleView[]> {
  const v = await loadFull(versionId);
  const map = v ? tierRankMap(v) : { ...TIER_DEFAULT_RANK };
  return TIERS.map((t) => ({ tier: t, rank: map[t], label: strengthLabel(map[t]) }));
}

/** Set tier→strength rules. Monotonic: a tier never reveals more than a more-sensitive one. */
export async function setSensitivityRules(versionId: string, rules: { tier: Tier; rank: number }[]) {
  await requireDraft(versionId);
  const map: Record<string, number> = { ...TIER_DEFAULT_RANK };
  for (const r of rules) {
    if (r.rank < 0 || r.rank > 4) throw err("ValidationError", "Pick a strength between fully hidden and shown in full.");
    map[r.tier] = r.rank;
  }
  // TIERS run most→least sensitive; rank must not increase as sensitivity drops.
  for (let i = 1; i < TIERS.length; i++) {
    if (map[TIERS[i]] > map[TIERS[i - 1]]) throw err("ValidationError", `${TIERS[i]} can't be shown more openly than ${TIERS[i - 1]}.`);
  }
  await ensureSensitivityRules(versionId);
  for (const t of TIERS) await db.mPSensitivityRule.updateMany({ where: { versionId, tier: t }, data: { rank: map[t] } });
}

/** Set one field's baseline strength: follow its tier, hold a rank, or use a custom rank. */
export async function setFieldStrength(versionId: string, fieldCode: string, input: { mode: "follows" | "custom" | "held"; rank?: number; reason?: string }) {
  await requireDraft(versionId);
  const field = await db.mPField.findUnique({ where: { code: fieldCode } });
  if (!field) throw err("NotFoundError", "No such field.");
  const dataType = inferDataType(field.code);
  const v = await loadFull(versionId);
  const rankMap = v ? tierRankMap(v) : { ...TIER_DEFAULT_RANK };
  const tier = field.sensitivity;
  const tierDefined = (TIERS as string[]).includes(tier);
  const tierRank = tierDefined ? deriveMasking(dataType, rankMap[tier] ?? TIER_DEFAULT_RANK[tier] ?? 4, field.regulated).rank : 4;

  if (input.mode === "follows") {
    await db.mPFieldDecision.upsert({
      where: { versionId_fieldCode: { versionId, fieldCode } },
      update: { mode: "follows", maskingJson: null, overrideReason: null, heldRank: null, status: field.usedByApps ? "ready" : "not_used", reviewed: true },
      create: { versionId, fieldCode, mode: "follows", maskingJson: null, status: field.usedByApps ? "ready" : "not_used", reviewed: true },
    });
    return;
  }

  const rank = Math.max(0, Math.min(4, input.rank ?? tierRank));
  if (field.regulated && rank < LEGAL_MIN_RANK) throw err("ForbiddenError", "This field is protected by law and can't be shown that openly.");
  if (rank === 0 && tier !== "Public") throw err("ForbiddenError", "Only a Public field can be shown in full.");
  const looserThanTier = rank < tierRank;
  if (looserThanTier && !(input.reason ?? "").trim()) throw err("ValidationError", "Showing more than this field's sensitivity allows needs a reason.");

  if (input.mode === "held") {
    await db.mPFieldDecision.upsert({
      where: { versionId_fieldCode: { versionId, fieldCode } },
      update: { mode: "held", heldRank: rank, maskingJson: null, overrideReason: null, status: "ready", reviewed: true },
      create: { versionId, fieldCode, mode: "held", heldRank: rank, status: "ready", reviewed: true },
    });
    return;
  }

  const derived = deriveMasking(dataType, rank, field.regulated);
  await db.mPFieldDecision.upsert({
    where: { versionId_fieldCode: { versionId, fieldCode } },
    update: { mode: "custom", maskingJson: derived.masking ? encodeObject(derived.masking) : null, overrideReason: looserThanTier ? (input.reason ?? "").trim() : null, heldRank: null, status: "ready", reviewed: true },
    create: { versionId, fieldCode, mode: "custom", maskingJson: derived.masking ? encodeObject(derived.masking) : null, overrideReason: looserThanTier ? (input.reason ?? "").trim() : null, status: "ready", reviewed: true },
  });
}

// --- Channel & audience management ------------------------------------------

export interface ChannelUsage { id: string; label: string; identifier: string; grants: { audience: string; field: string }[]; onlyHere: number }
export async function channelUsage(draftId: string): Promise<ChannelUsage[]> {
  const full = await loadFull(draftId);
  if (!full) return [];
  const fields = await db.mPField.findMany({ select: { code: true, displayName: true } });
  const fname = new Map(fields.map((f) => [f.code, f.displayName]));
  const aname = new Map(full.audiences.map((a) => [a.id, a.label]));
  return full.channels.map((c) => {
    const using = full.grants.filter((g) => { const s = decodeObject<string[] | string>(g.channelScopeJson); return Array.isArray(s) && s.includes(c.id); });
    const onlyHere = using.filter((g) => { const s = decodeObject<string[] | string>(g.channelScopeJson); return Array.isArray(s) && s.length === 1; }).length;
    return { id: c.id, label: c.label, identifier: c.identifier, grants: using.map((g) => ({ audience: aname.get(g.audienceId) ?? "—", field: fname.get(g.fieldCode) ?? g.fieldCode })), onlyHere };
  });
}

export async function renameChannel(id: string, label: string) {
  if (!label.trim()) throw err("ValidationError", "Name the channel.");
  await db.mPChannel.update({ where: { id }, data: { label: label.trim() } });
}
export async function changeChannelIdentifier(id: string, identifier: string) {
  if (!identifier.trim()) throw err("ValidationError", "Give the identifier your app sends.");
  await db.mPChannel.update({ where: { id }, data: { identifier: identifier.trim() } });
}
export async function removeChannel(id: string) {
  const ch = await db.mPChannel.findUnique({ where: { id } });
  if (!ch) return;
  const grants = await db.mPGrant.findMany({ where: { versionId: ch.versionId } });
  for (const g of grants) {
    const s = decodeObject<string[] | string>(g.channelScopeJson);
    if (!Array.isArray(s) || !s.includes(id)) continue;
    if (s.length === 1) await db.mPGrant.delete({ where: { id: g.id } }); // applied only here → removed
    else await db.mPGrant.update({ where: { id: g.id }, data: { channelScopeJson: encodeObject(s.filter((x) => x !== id)) } });
  }
  await db.mPChannel.delete({ where: { id } });
}
export async function changeAudienceIdentifier(id: string, identifier: string) {
  if (!identifier.trim()) throw err("ValidationError", "Give the identifier your app sends.");
  await db.mPAudience.update({ where: { id }, data: { identifier: identifier.trim() } });
}

export async function setBaseline(versionId: string, fieldCode: string, masking: Masking | null, status: FieldStatus) {
  await requireDraft(versionId);
  await db.mPFieldDecision.upsert({
    where: { versionId_fieldCode: { versionId, fieldCode } },
    update: { maskingJson: masking ? encodeObject(masking) : null, status, reviewed: true },
    create: { versionId, fieldCode, maskingJson: masking ? encodeObject(masking) : null, status, reviewed: true },
  });
}

export async function markReady(versionId: string, fieldCodes: string[]) {
  await requireDraft(versionId);
  for (const code of fieldCodes) await db.mPFieldDecision.updateMany({ where: { versionId, fieldCode: code }, data: { reviewed: true, status: "ready" } });
}

export async function addAudience(versionId: string, label: string, identifier: string): Promise<string> {
  await requireDraft(versionId);
  if (!label.trim()) throw err("ValidationError", "Name the audience.");
  if (!identifier.trim()) throw err("ValidationError", "Give the identifier your app sends for this role.");
  const count = await db.mPAudience.count({ where: { versionId } });
  const a = await db.mPAudience.create({ data: { versionId, label: label.trim(), identifier: identifier.trim(), sortOrder: count } });
  return a.id;
}
export async function renameAudience(audienceId: string, label: string) {
  if (!label.trim()) throw err("ValidationError", "Name the audience.");
  await db.mPAudience.update({ where: { id: audienceId }, data: { label: label.trim() } });
}
export async function removeAudience(audienceId: string) {
  await db.mPAudience.delete({ where: { id: audienceId } });
}
export async function addChannel(versionId: string, label: string, identifier: string): Promise<string> {
  await requireDraft(versionId);
  if (!label.trim() || !identifier.trim()) throw err("ValidationError", "A channel needs a name and its identifier.");
  const c = await db.mPChannel.create({ data: { versionId, label: label.trim(), identifier: identifier.trim() } });
  return c.id;
}

/** Set (or clear) an audience grant. visibility null removes it (back to Same). */
export async function setGrant(versionId: string, audienceId: string, fieldCode: string, input: { direction?: "more" | "less"; visibility: "more" | "full_raw" | "restrict"; masking?: Masking | null; channelScope: "ANY" | string[]; reason?: string } | null) {
  await requireDraft(versionId);
  const field = await db.mPField.findUnique({ where: { code: fieldCode } });
  if (!field) throw err("NotFoundError", "No such field.");
  if (input === null) { await db.mPGrant.deleteMany({ where: { versionId, audienceId, fieldCode } }); return; }
  const direction = input.direction ?? (input.visibility === "restrict" ? "less" : "more");
  // Baseline strength in THIS version, to validate the exception reveals more/less.
  const dec = await db.mPFieldDecision.findUnique({ where: { versionId_fieldCode: { versionId, fieldCode } } });
  const baseMask = dec && dec.status !== "needs_decision" ? parseMask(dec.maskingJson) : null;
  const baseStrength = strengthOf(baseMask, field.sampleValue, false);
  const exStrength = strengthOf(input.masking ?? null, field.sampleValue, input.visibility === "full_raw");

  if (direction === "more") {
    if (field.regulated && input.visibility === "full_raw") throw err("ForbiddenError", "A regulated field can never be shown in full.");
    if (input.visibility === "full_raw" && !(input.reason ?? "").trim()) throw err("ValidationError", "A full raw value needs a reason.");
    if (input.visibility !== "full_raw" && exStrength <= baseStrength) throw err("ValidationError", "A grant must reveal more than everyone already sees.");
  } else {
    if (exStrength >= baseStrength) throw err("ValidationError", "A restriction must reveal less than everyone already sees.");
  }
  await db.mPGrant.upsert({
    where: { versionId_audienceId_fieldCode: { versionId, audienceId, fieldCode } },
    update: { visibility: direction === "less" ? "restrict" : input.visibility, direction, maskingJson: input.masking ? encodeObject(input.masking) : null, channelScopeJson: encodeObject(input.channelScope), reason: input.reason ?? null },
    create: { versionId, audienceId, fieldCode, visibility: direction === "less" ? "restrict" : input.visibility, direction, maskingJson: input.masking ? encodeObject(input.masking) : null, channelScopeJson: encodeObject(input.channelScope), reason: input.reason ?? null },
  });
}

export interface BulkResult { ok: boolean; applied: number; skipped: { code: string; reason: string }[] }
/** Atomic bulk: regulated fields are skipped and named; any hard failure applies nothing. */
export async function bulkBaseline(versionId: string, fieldCodes: string[], masking: Masking | null, status: FieldStatus): Promise<BulkResult> {
  await requireDraft(versionId);
  const fields = await db.mPField.findMany({ where: { code: { in: fieldCodes } } });
  const skipped: { code: string; reason: string }[] = [];
  const eligible = fields.filter((f) => { if (f.regulated && masking && strengthOf(masking, f.sampleValue) > strengthOf(parseMask(f.legalMinimumJson), f.sampleValue)) { skipped.push({ code: f.code, reason: "regulated — legal minimum" }); return false; } return true; });
  for (const f of eligible) {
    await db.mPFieldDecision.upsert({
      where: { versionId_fieldCode: { versionId, fieldCode: f.code } },
      update: { maskingJson: masking ? encodeObject(masking) : null, status, reviewed: true },
      create: { versionId, fieldCode: f.code, maskingJson: masking ? encodeObject(masking) : null, status, reviewed: true },
    });
  }
  return { ok: true, applied: eligible.length, skipped };
}

/** Activate the draft with a required why-note. Recorded permanently in the audit log. */
export async function activate(versionId: string, whyNote: string, actor: AuditActor) {
  const v = await requireDraft(versionId);
  if (!whyNote.trim()) throw err("ValidationError", "A reason is required to activate.");
  const checks = await getChecks(versionId);
  const blocking = checks.filter((c) => c.level === "blocking" && !c.ok);
  if (blocking.length) throw err("BlockedError", `Resolve the blocking checks first: ${blocking.map((b) => b.message).join("; ")}`);
  const impact = await getImpact(versionId);
  const summary = impactSentence(impact);
  return audited(
    { actor, action: "masking_policy.activated", targetType: "MPPolicyVersion", targetId: String(v.number), eventDescription: `Activated masking policy version ${v.number}`, payload: { number: v.number, why: whyNote.trim(), impact: summary } },
    async (tx) => {
      await tx.mPPolicyVersion.updateMany({ where: { state: "active" }, data: { state: "archived" } });
      await tx.mPPolicyVersion.update({ where: { id: versionId }, data: { state: "active", activatedBy: actor.label, activatedAt: new Date(), whyNote: whyNote.trim(), impactSummary: summary } });
    },
  );
}

/** Restore an archived/active version as a NEW draft (never rewrites history). */
export async function restoreAsDraft(number: number, actor: AuditActor): Promise<string> {
  const existing = await getDraft();
  if (existing) throw err("ConflictError", "A draft already exists. Continue editing it or discard it first.");
  const src = await getVersionByNumber(number);
  if (!src) throw err("NotFoundError", "No such version.");
  const newNum = await nextNumber();
  const draft = await db.mPPolicyVersion.create({ data: { number: newNum, state: "draft", basedOn: src.number } });
  await copySnapshot(src.id, draft.id);
  return draft.id;
}
