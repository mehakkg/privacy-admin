import { db } from "@/lib/db";
import { audited, type AuditActor } from "@/lib/engines/audit";
import { encodeObject, decodeObject } from "@/lib/codec/json";
import {
  renderValue, choiceLabel, strengthOf, directionOf,
  type Masking, type GridFieldRow, type AudienceVisibility, type CategoryHeader,
  type AudienceInfo, type ChannelInfo, type PolicyCheck, type ImpactItem, type FieldStatus,
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
  decisions: { fieldCode: string; maskingJson: string | null; status: string; reviewed: boolean }[];
  audiences: { id: string; label: string; identifier: string; sortOrder: number }[];
  channels: { id: string; label: string; identifier: string }[];
  grants: { id: string; audienceId: string; fieldCode: string; channelScopeJson: string; visibility: string; maskingJson: string | null; reason: string | null }[];
}

async function loadFull(versionId: string): Promise<FullVersion | null> {
  const v = await db.mPPolicyVersion.findUnique({
    where: { id: versionId },
    include: { decisions: true, audiences: { orderBy: { sortOrder: "asc" } }, channels: true, grants: true },
  });
  if (!v) return null;
  return { id: v.id, number: v.number, state: v.state, basedOn: v.basedOn, decisions: v.decisions, audiences: v.audiences, channels: v.channels, grants: v.grants };
}

// --- Resolution (grid + per-audience effective visibility) ------------------

interface ResolvedField extends GridFieldRow {}

function resolveGrid(v: FullVersion, fields: { code: string; displayName: string; categoryId: string; origin: string; regulated: boolean; legalMinimumJson: string | null; sampleValue: string; usedByApps: boolean; firstSeen: Date }[], activeFieldCodes?: Set<string>): ResolvedField[] {
  const decByCode = new Map(v.decisions.map((d) => [d.fieldCode, d]));
  const chanLabel = new Map(v.channels.map((c) => [c.id, c.label]));
  return fields.map((f) => {
    const dec = decByCode.get(f.code);
    const notUsed = !f.usedByApps;
    const status: FieldStatus = notUsed ? "not_used" : ((dec?.status as FieldStatus) ?? "needs_decision");
    const baseMask = notUsed || status === "needs_decision" ? null : parseMask(dec?.maskingJson);
    const baseHidden = !baseMask;
    const baseStrength = strengthOf(baseMask, f.sampleValue, false);
    const baseExample = renderValue(baseMask, f.sampleValue, false);

    const audiences: AudienceVisibility[] = v.audiences.map((a) => {
      if (notUsed) return { audienceId: a.id, kind: "not_used", example: "—", choiceLabel: "Not used", channelLabel: null, reason: null };
      if (f.regulated) return { audienceId: a.id, kind: "locked", example: baseExample, choiceLabel: choiceLabel(baseMask, false), channelLabel: null, reason: null };
      const g = v.grants.find((gr) => gr.audienceId === a.id && gr.fieldCode === f.code);
      if (!g) return { audienceId: a.id, kind: "same", example: baseExample, choiceLabel: "Same", channelLabel: null, reason: null };
      const fullRaw = g.visibility === "full_raw";
      const gMask = parseMask(g.maskingJson);
      const gStrength = strengthOf(gMask, f.sampleValue, fullRaw);
      if (gStrength <= baseStrength) return { audienceId: a.id, kind: "same", example: baseExample, choiceLabel: "Same", channelLabel: null, reason: null };
      const scope = decodeObject<string[] | string>(g.channelScopeJson);
      const channelLabel = Array.isArray(scope) ? scope.map((id) => chanLabel.get(id) ?? id).join(", ") : null;
      return {
        audienceId: a.id, kind: fullRaw ? "full_raw" : "more",
        example: renderValue(gMask, f.sampleValue, fullRaw),
        choiceLabel: choiceLabel(gMask, fullRaw), channelLabel, reason: g.reason ?? null,
      };
    });

    return {
      code: f.code, displayName: f.displayName, categoryId: f.categoryId, origin: f.origin,
      regulated: f.regulated, status,
      isNew: !!activeFieldCodes && !activeFieldCodes.has(f.code),
      sampleValue: f.sampleValue,
      legalMinimum: parseMask(f.legalMinimumJson),
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

export async function getImpact(draftId: string): Promise<ImpactSummary> {
  const draft = await loadFull(draftId);
  if (!draft) return { items: [], counts: { changes: 0, looser: 0, tighter: 0, neutral: 0, fullRaw: 0 }, hiddenFields: [] };
  const active = draft.basedOn != null ? await getVersionByNumber(draft.basedOn) : await getActiveVersion();
  const prior = active ? await loadFull(active.id) : null;
  const fields = await db.mPField.findMany();
  const byCode = new Map(fields.map((f) => [f.code, f]));

  const priorCell = (audienceId: string | null, code: string): { strength: number; example: string } => {
    const f = byCode.get(code)!;
    if (!prior) return { strength: 0, example: renderValue(null, f.sampleValue) };
    const dec = prior.decisions.find((d) => d.fieldCode === code);
    const base = dec && dec.status !== "needs_decision" ? parseMask(dec.maskingJson) : null;
    if (audienceId === null || f.regulated) return { strength: strengthOf(base, f.sampleValue), example: renderValue(base, f.sampleValue) };
    // match audience by label against draft's audience (snapshots have different ids)
    const dAud = draft.audiences.find((a) => a.id === audienceId);
    const pAud = dAud ? prior.audiences.find((a) => a.label === dAud.label) : null;
    const g = pAud ? prior.grants.find((gr) => gr.audienceId === pAud.id && gr.fieldCode === code) : null;
    if (!g) return { strength: strengthOf(base, f.sampleValue), example: renderValue(base, f.sampleValue) };
    const fr = g.visibility === "full_raw"; const gm = parseMask(g.maskingJson);
    return { strength: strengthOf(gm, f.sampleValue, fr), example: renderValue(gm, f.sampleValue, fr) };
  };

  const items: ImpactItem[] = [];
  const grid = resolveGrid(draft, fields.map((f) => f));
  for (const f of fields) {
    const row = grid.find((r) => r.code === f.code)!;
    // Everyone
    const nowBase = strengthOf(row.baseline.masking, f.sampleValue);
    const wasBase = priorCell(null, f.code);
    if (nowBase !== wasBase.strength) items.push({ audienceId: null, audienceLabel: "Everyone", fieldCode: f.code, fieldName: f.displayName, channelLabel: null, before: wasBase.example, after: row.baseline.example, direction: directionOf(wasBase.strength, nowBase), fullRaw: false, reason: null });
    // Audiences
    for (const a of draft.audiences) {
      const cell = row.audiences.find((x) => x.audienceId === a.id)!;
      if (cell.kind === "not_used" || cell.kind === "locked") continue;
      const nowStrength = cell.kind === "same" ? nowBase : strengthOf(cell.kind === "full_raw" ? null : parseMask(draft.grants.find((g) => g.audienceId === a.id && g.fieldCode === f.code)?.maskingJson ?? null), f.sampleValue, cell.kind === "full_raw");
      const was = priorCell(a.id, f.code);
      if (nowStrength !== was.strength) items.push({ audienceId: a.id, audienceLabel: a.label, fieldCode: f.code, fieldName: f.displayName, channelLabel: cell.channelLabel, before: was.example, after: cell.example, direction: directionOf(was.strength, nowStrength), fullRaw: cell.kind === "full_raw", reason: cell.reason });
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

// --- Home -------------------------------------------------------------------

export interface HomeData {
  active: { number: number; activatedBy: string | null; activatedAt: string | null; whyNote: string | null; impact: string | null } | null;
  draft: { id: string; number: number; basedOn: number | null; changes: number } | null;
  needsAttention: { id: string; type: string; label: string; count: number; link: string | null }[];
  timeline: { number: number; state: string; who: string | null; when: string | null; why: string | null; impact: string | null }[];
}

export async function getHome(): Promise<HomeData> {
  const [active, draft, attn, versions] = await Promise.all([
    getActiveVersion(), getDraft(), db.mPNeedsAttention.findMany({ orderBy: { createdAt: "asc" } }), listVersions(),
  ]);
  let draftChanges = 0;
  if (draft) draftChanges = (await getImpact(draft.id)).counts.changes;
  return {
    active: active ? { number: active.number, activatedBy: active.activatedBy, activatedAt: active.activatedAt?.toISOString().slice(0, 16).replace("T", " ") ?? null, whyNote: active.whyNote, impact: active.impactSummary } : null,
    draft: draft ? { id: draft.id, number: draft.number, basedOn: draft.basedOn, changes: draftChanges } : null,
    needsAttention: attn.map((a) => ({ id: a.id, type: a.type, label: a.label, count: a.count, link: a.link })),
    timeline: versions.filter((v) => v.state !== "draft").map((v) => ({ number: v.number, state: v.state, who: v.activatedBy, when: v.activatedAt?.toISOString().slice(0, 10) ?? null, why: v.whyNote, impact: v.impactSummary })),
  };
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
    // No active version: seed decisions from the catalog (ready = catalog match).
    const fields = await db.mPField.findMany();
    for (const f of fields) {
      await db.mPFieldDecision.create({ data: { versionId: draft.id, fieldCode: f.code, maskingJson: f.legalMinimumJson ?? encodeObject({ family: "partial", params: { showFirst: 0, showLast: 4, maskChar: "*" } }), status: f.usedByApps ? "ready" : "not_used", reviewed: false } });
    }
  }
  return draft.id;
}

async function copySnapshot(fromId: string, toId: string) {
  const src = await loadFull(fromId);
  if (!src) return;
  for (const d of src.decisions) await db.mPFieldDecision.create({ data: { versionId: toId, fieldCode: d.fieldCode, maskingJson: d.maskingJson, status: d.status, reviewed: d.reviewed } });
  const idMap = new Map<string, string>();
  for (const a of src.audiences) { const na = await db.mPAudience.create({ data: { versionId: toId, label: a.label, identifier: a.identifier, sortOrder: a.sortOrder } }); idMap.set(a.id, na.id); }
  const chMap = new Map<string, string>();
  for (const c of src.channels) { const nc = await db.mPChannel.create({ data: { versionId: toId, label: c.label, identifier: c.identifier } }); chMap.set(c.id, nc.id); }
  for (const g of src.grants) {
    const scope = decodeObject<string[] | string>(g.channelScopeJson);
    const newScope = Array.isArray(scope) ? scope.map((id) => chMap.get(id) ?? id) : scope;
    await db.mPGrant.create({ data: { versionId: toId, audienceId: idMap.get(g.audienceId)!, fieldCode: g.fieldCode, channelScopeJson: encodeObject(newScope), visibility: g.visibility, maskingJson: g.maskingJson, reason: g.reason } });
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
export async function setGrant(versionId: string, audienceId: string, fieldCode: string, input: { visibility: "more" | "full_raw"; masking?: Masking | null; channelScope: "ANY" | string[]; reason?: string } | null) {
  await requireDraft(versionId);
  const field = await db.mPField.findUnique({ where: { code: fieldCode } });
  if (!field) throw err("NotFoundError", "No such field.");
  if (input === null) { await db.mPGrant.deleteMany({ where: { versionId, audienceId, fieldCode } }); return; }
  if (field.regulated && input.visibility === "full_raw") throw err("ForbiddenError", "A regulated field can never be shown in full.");
  if (input.visibility === "full_raw" && !(input.reason ?? "").trim()) throw err("ValidationError", "A full raw value needs a reason.");
  await db.mPGrant.upsert({
    where: { versionId_audienceId_fieldCode: { versionId, audienceId, fieldCode } },
    update: { visibility: input.visibility, maskingJson: input.masking ? encodeObject(input.masking) : null, channelScopeJson: encodeObject(input.channelScope), reason: input.reason ?? null },
    create: { versionId, audienceId, fieldCode, visibility: input.visibility, maskingJson: input.masking ? encodeObject(input.masking) : null, channelScopeJson: encodeObject(input.channelScope), reason: input.reason ?? null },
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
