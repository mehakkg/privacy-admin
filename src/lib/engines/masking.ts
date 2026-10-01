import { db } from "@/lib/db";
import { audited, searchAuditLog, recordAction, type AuditActor, type AuditQuery } from "@/lib/engines/audit";
import { isCombinedGovernance } from "@/lib/governance";
import { encodeObject, decodeObject } from "@/lib/codec/json";
import {
  CHANNEL_KEYS, CHANNEL_LABEL, LAYER_PRECEDENCE, layerBadge, lockTreatmentOf,
  ruleLabel, maskPreview, reversibleOf, strictness,
  type Layer, type Rule, type FieldResolution, type LayerView, type ChannelView, type RulePatch,
  type RuleGroupView, type GroupState, type PlanRow, type TemplateView, type VariantView, type RuleVersion,
} from "@/lib/masking";
export type { TemplateView } from "@/lib/masking";

export type { RulePatch } from "@/lib/masking";

/**
 * DDM POLICY ENGINE (server).
 *
 * Resolution is per channel: the effective rule for a channel comes from the
 * highest-precedence layer that defines the field, using that layer's channel
 * override if present, else its default. Governed layers (baseline, regional) are
 * never edited directly — a change is a MaskingChangeRequest the DPO approves.
 * Every write is hash-chained via audited(); nothing produces rule_unlocked.
 */

function err(name: string, message: string, extra?: Record<string, unknown>) {
  return Object.assign(new Error(message), { name, ...(extra ?? {}) });
}

type LayerRow = { id: string; layer: string; source: string | null; family: string; paramsJson: string; locked: boolean; systemRegulated: boolean; citation: string | null; active: boolean; templateKey: string | null };
type ChannelRow = { layer: string; channel: string; family: string; paramsJson: string };
type VariantRow = { id: string; scopeType: string; scopeValue: string; family: string; paramsJson: string; status: string };

const ruleOf = (r: { family: string; paramsJson: string }): Rule => ({ family: r.family, params: decodeObject<Record<string, unknown>>(r.paramsJson) ?? {} });

/** The set of regional template sources currently associated (participating in resolution). */
export async function activeRegionalSet(): Promise<Set<string>> {
  const rows = await db.maskingTemplate.findMany({ where: { kind: "regional", associated: true }, select: { key: true } });
  return new Set(rows.map((r) => r.key));
}

/** Templates with their field counts, for the By-field template switcher. */
export async function getTemplates(): Promise<TemplateView[]> {
  const [templates, counts] = await Promise.all([
    db.maskingTemplate.findMany({ where: { kind: { in: ["baseline", "regional"] } }, orderBy: { sortOrder: "asc" } }),
    db.maskingLayerRule.groupBy({ by: ["layer", "source"], _count: true }),
  ]);
  const countFor = (t: { key: string; kind: string }) =>
    t.kind === "baseline"
      ? counts.filter((c) => c.layer === "baseline").reduce((n, c) => n + (c._count ?? 0), 0)
      : counts.filter((c) => c.layer === "regional" && c.source === t.key).reduce((n, c) => n + (c._count ?? 0), 0);
  return templates.map((t) => ({ key: t.key, name: t.name, kind: t.kind as "baseline" | "regional", associated: t.associated, fields: countFor(t) }));
}

export interface TemplateFieldRow { code: string; name: string; label: string; preview: string }

/** The full field list a template governs (read-only Library surface, nested in the drawer). */
export async function templateFields(key: string): Promise<TemplateFieldRow[]> {
  const where = key === "BASELINE" ? { layer: "baseline" } : { layer: "regional", source: key };
  const rules = await db.maskingLayerRule.findMany({ where, orderBy: { fieldCode: "asc" } });
  const codes = rules.map((r) => r.fieldCode);
  const fields = await db.maskingField.findMany({ where: { code: { in: codes } }, select: { code: true, name: true, sampleValue: true } });
  const byCode = new Map(fields.map((f) => [f.code, f]));
  return rules.map((r) => {
    const rule = ruleOf(r);
    const f = byCode.get(r.fieldCode);
    return { code: r.fieldCode, name: f?.name ?? r.fieldCode, label: ruleLabel(rule), preview: f?.sampleValue ? maskPreview(rule, f.sampleValue) : ruleLabel(rule) };
  });
}

/** Associate or dissociate a regional template (BASELINE is always on). Audited. */
export async function setTemplateAssociation(key: string, associated: boolean, actor: AuditActor) {
  const t = await db.maskingTemplate.findUnique({ where: { key } });
  if (!t) throw err("NotFoundError", "No such template.");
  if (t.kind === "baseline") throw err("ForbiddenError", "BASELINE is always active and cannot be switched off.");
  return audited(
    { actor, action: associated ? "masking.template_associated" : "masking.template_dissociated", targetType: "MaskingTemplate", targetId: key, eventDescription: `${associated ? "Associated" : "Dissociated"} the ${t.name} template`, payload: { key, associated } },
    (tx) => tx.maskingTemplate.update({ where: { key }, data: { associated } }),
  );
}

// --- Resolution -------------------------------------------------------------

interface FieldBundle {
  code: string; name: string; sensitivity: string; sampleValue: string;
  detectionPattern: string | null; dataElementRef: string | null; createdBy: string | null;
  primaryChannel: string | null; primaryRole: string | null; ownerTeam: string | null;
  layerRules: LayerRow[]; channelRules: ChannelRow[]; variants: VariantRow[];
  exceptions: { id: string; role: string; purpose: string; durationMinutes: number; approvedBy: string | null; expiresAt: Date | null }[];
  pendingChangeId: string | null;
}

function resolveBundle(f: FieldBundle, activeRegional?: Set<string>): FieldResolution {
  const prec = (l: LayerRow) => LAYER_PRECEDENCE[l.layer as Layer] ?? 0;
  // Override On/Off: a tenant rule with active=false is retained but does NOT
  // participate — the field falls through live to the template/BASELINE value.
  const inactiveTenant = f.layerRules.find((l) => l.layer === "tenant" && l.active === false) ?? null;
  // A regional rule participates only while its template is associated. Baseline
  // and tenant layers always participate (unless the tenant rule is switched off).
  const participating = (activeRegional
    ? f.layerRules.filter((l) => l.layer !== "regional" || (l.source != null && activeRegional.has(l.source)))
    : f.layerRules
  ).filter((l) => !(l.layer === "tenant" && l.active === false));
  const layers = [...participating].sort((a, b) => prec(b) - prec(a));
  const topPrec = layers.length ? prec(layers[0]) : -1;
  const topRows = layers.filter((l) => prec(l) === topPrec);
  // Two non-BASELINE templates claiming one code is a resolver error, never a pick.
  const ambiguous = topRows.length > 1 && topPrec > 0;
  const winning = ambiguous ? null : layers[0] ?? null;

  const chain: LayerView[] = layers.map((l) => {
    const rule = ruleOf(l);
    return {
      layer: l.layer, source: l.source, family: l.family, params: rule.params,
      label: ruleLabel(rule), preview: f.sampleValue ? maskPreview(rule, f.sampleValue) : ruleLabel(rule),
      locked: l.locked, systemRegulated: l.systemRegulated, citation: l.citation,
      won: !!winning && l.id === winning.id,
    };
  });

  let effective: FieldResolution["effective"] = null;
  let governedBy: FieldResolution["governedBy"] = null;
  let citation: string | null = null;
  const channels: ChannelView[] = [];
  let overrideCount = 0;

  if (winning) {
    const winRule = ruleOf(winning);
    effective = { family: winRule.family, params: winRule.params, label: ruleLabel(winRule), preview: f.sampleValue ? maskPreview(winRule, f.sampleValue) : ruleLabel(winRule), reversible: reversibleOf(winRule.family) };
    citation = winning.citation;

    const below = layers.find((l) => prec(l) < prec(winning)) ?? null;
    const stricter = winning.layer === "tenant" && !!below && strictness(winRule) > strictness(ruleOf(below));
    governedBy = {
      layer: winning.layer, source: winning.source, badge: layerBadge(winning.layer, winning.source),
      locked: winning.locked, systemRegulated: winning.systemRegulated,
      treatment: lockTreatmentOf(winning.layer, winning.locked, winning.systemRegulated),
      stricter, stricterOver: stricter && below ? layerBadge(below.layer, below.source) : null,
    };

    for (const c of CHANNEL_KEYS) {
      const override = f.channelRules.find((cr) => cr.layer === winning.layer && cr.channel === c);
      const rule = override ? ruleOf(override) : winRule;
      if (override) overrideCount++;
      channels.push({
        channel: c, channelLabel: CHANNEL_LABEL[c], family: rule.family, params: rule.params,
        label: ruleLabel(rule), preview: f.sampleValue ? maskPreview(rule, f.sampleValue) : ruleLabel(rule),
        sourceLayer: layerBadge(winning.layer, winning.source), isOverride: !!override,
      });
    }
  }

  const now = Date.now();
  const exceptions = f.exceptions
    .filter((e) => !e.expiresAt || e.expiresAt.getTime() > now)
    .map((e) => ({ id: e.id, role: e.role, purpose: e.purpose, durationMinutes: e.durationMinutes, approvedBy: e.approvedBy, expiresAt: e.expiresAt ? e.expiresAt.toISOString().slice(0, 16).replace("T", " ") : null }));

  const status: FieldResolution["status"] = ambiguous ? "ambiguous" : winning ? "resolved" : "no_rule";
  // Each field counts once, under its winning source; anything unresolved is "attention".
  const winningSource: FieldResolution["winningSource"] =
    status !== "resolved" ? "attention" : (winning!.layer as "baseline" | "regional" | "tenant");

  const storedRuleOf = (l: LayerRow) => { const r = ruleOf(l); return { family: r.family, params: r.params, label: ruleLabel(r) }; };
  const activeTenant = f.layerRules.find((l) => l.layer === "tenant" && l.active !== false) ?? null;
  // Variants (Visibility Matrix) — surfaced for the drawer but NEVER applied: while
  // ENFORCEMENT_ACTIVE is false every request resolves to `default`, above.
  const variants: VariantView[] = f.variants.map((v) => {
    const r = ruleOf(v);
    return { id: v.id, scopeType: v.scopeType, scopeValue: v.scopeValue, family: v.family, params: r.params, label: ruleLabel(r), preview: f.sampleValue ? maskPreview(r, f.sampleValue) : ruleLabel(r), status: v.status };
  });

  return {
    code: f.code, name: f.name, sensitivity: f.sensitivity, sampleValue: f.sampleValue,
    detectionPattern: f.detectionPattern, dataElementRef: f.dataElementRef,
    primaryChannel: f.primaryChannel, primaryRole: f.primaryRole, ownerTeam: f.ownerTeam,
    hasRule: !!winning, status,
    overrideOff: !!inactiveTenant && !activeTenant,
    storedRule: inactiveTenant ? storedRuleOf(inactiveTenant) : null,
    templateKey: (winning?.layer === "tenant" ? winning.templateKey : null) ?? inactiveTenant?.templateKey ?? null,
    variants,
    ambiguity: ambiguous ? { sources: topRows.map((l) => layerBadge(l.layer, l.source)) } : null,
    effective, governedBy, citation, winningSource, chain, channels, overrideCount,
    exceptions, pendingChangeId: f.pendingChangeId, createdBy: f.createdBy,
  };
}

async function loadBundle(code: string): Promise<FieldBundle | null> {
  const f = await db.maskingField.findUnique({
    where: { code },
    include: { layerRules: true, channelRules: true, exceptions: true, variants: true, changeRequests: { where: { status: "pending" } } },
  });
  if (!f) return null;
  return {
    code: f.code, name: f.name, sensitivity: f.sensitivity, sampleValue: f.sampleValue,
    detectionPattern: f.detectionPattern, dataElementRef: f.dataElementRef, createdBy: f.createdBy,
    primaryChannel: f.primaryChannel, primaryRole: f.primaryRole, ownerTeam: f.ownerTeam,
    layerRules: f.layerRules, channelRules: f.channelRules, variants: f.variants,
    exceptions: f.exceptions, pendingChangeId: f.changeRequests[0]?.id ?? null,
  };
}

export async function resolveField(code: string): Promise<FieldResolution | null> {
  const [b, active] = await Promise.all([loadBundle(code.trim().toUpperCase()), activeRegionalSet()]);
  return b ? resolveBundle(b, active) : null;
}

export interface InventoryRow extends FieldResolution {
  lastChange: { actor: string; at: Date } | null;
  /** Member of a rule group whose effective tenant rule no longer matches the group. */
  diverged: boolean;
  /** Gap-first: no rule, ambiguous, diverged, or a pending change. */
  needsAttention: boolean;
  /** Rule group this field belongs to, if any (for the group tag + filter). */
  group: string | null;
}

export async function getInventory(): Promise<InventoryRow[]> {
  await expireDueExceptions();
  const [fields, groups, active] = await Promise.all([
    db.maskingField.findMany({
      include: { layerRules: true, channelRules: true, exceptions: true, variants: true, changeRequests: { where: { status: "pending" } } },
      orderBy: { code: "asc" },
    }),
    getRuleGroups(),
    activeRegionalSet(),
  ]);
  const divergedCodes = new Set(groups.flatMap((g) => g.divergedCodes));
  const groupByCode = new Map<string, string>();
  for (const g of groups) for (const c of g.memberCodes) if (!groupByCode.has(c)) groupByCode.set(c, g.name);
  // One pass over masking audit entries for "last change" per field.
  const entries = await db.auditLogEntry.findMany({
    where: { action: { contains: "masking." }, targetType: "MaskingField" },
    orderBy: { seq: "desc" },
    select: { targetId: true, actorLabel: true, timestamp: true },
  });
  const last = new Map<string, { actor: string; at: Date }>();
  for (const e of entries) if (!last.has(e.targetId)) last.set(e.targetId, { actor: e.actorLabel, at: e.timestamp });

  return fields.map((f) => {
    const res = resolveBundle({
      code: f.code, name: f.name, sensitivity: f.sensitivity, sampleValue: f.sampleValue,
      detectionPattern: f.detectionPattern, dataElementRef: f.dataElementRef, createdBy: f.createdBy,
      primaryChannel: f.primaryChannel, primaryRole: f.primaryRole, ownerTeam: f.ownerTeam,
      layerRules: f.layerRules, channelRules: f.channelRules, variants: f.variants, exceptions: f.exceptions,
      pendingChangeId: f.changeRequests[0]?.id ?? null,
    }, active);
    const diverged = divergedCodes.has(f.code);
    const needsAttention = res.winningSource === "attention" || !!res.pendingChangeId || diverged;
    return { ...res, lastChange: last.get(f.code) ?? null, diverged, needsAttention, group: groupByCode.get(f.code) ?? null };
  });
}

export interface Coverage { total: number; baseline: number; regional: number; tenant: number; attention: number; pending: number }

/**
 * Coverage tiles reconcile: each field is counted ONCE under its winning source,
 * and anything that cannot be assigned to exactly one source (no rule, or an
 * ambiguity) lands in "attention" — never double-counted. baseline + regional +
 * tenant + attention === total.
 */
export function getCoverage(rows: InventoryRow[]): Coverage {
  const by = (s: string) => rows.filter((r) => r.winningSource === s).length;
  return {
    total: rows.length,
    baseline: by("baseline"), regional: by("regional"), tenant: by("tenant"),
    attention: by("attention"),
    pending: rows.filter((r) => r.pendingChangeId).length,
  };
}

// --- Collision + change requests for the drawer -----------------------------

/** The regional templates this tenant is associated with (distinct sources). */
export async function associatedRegionalTemplates(): Promise<{ name: string }[]> {
  const rows = await db.maskingLayerRule.findMany({ where: { layer: "regional", source: { not: null } }, distinct: ["source"], select: { source: true } });
  return rows.filter((r) => r.source).map((r) => ({ name: `${r.source} template` }));
}

export interface Collision { templateName: string; source: string; ruleLabel: string }

/** A code collides if a field already exists governed by an associated regional template. */
export async function checkCodeCollision(rawCode: string): Promise<Collision | null> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;
  const f = await db.maskingField.findUnique({ where: { code }, include: { layerRules: true } });
  if (!f) return null;
  const regional = f.layerRules.find((l) => l.layer === "regional");
  if (regional) return { templateName: `${regional.source} template`, source: regional.source ?? "regional", ruleLabel: ruleLabel(ruleOf(regional)) };
  return { templateName: "an existing field", source: "existing", ruleLabel: "" };
}

export interface BareFieldInput { code: string; name: string; sensitivity: string; sampleValue: string; detectionPattern?: string; dataElementRef?: string }

/**
 * Create a custom field with NO rule (the inline "Add custom field" in the stepper).
 * The stepper's chosen rule is then applied to it as a first tenant rule. Hard-blocks
 * on a collision with an associated regional template.
 */
export async function createBareField(input: BareFieldInput, actor: AuditActor) {
  const code = input.code.trim().toUpperCase();
  if (!code) throw err("ValidationError", "Give the field a code.");
  if (!/^[A-Z0-9_]+$/.test(code)) throw err("ValidationError", "A code may use only A–Z, 0–9 and underscores.");
  if (!input.name.trim()) throw err("ValidationError", "Give the field a name.");
  const [existing, collision] = await Promise.all([
    db.maskingField.findUnique({ where: { code } }),
    checkCodeCollision(code),
  ]);
  if (existing) throw err("DuplicateError", `A field with code ${code} already exists.`);
  if (collision && collision.source !== "existing") {
    throw err("CollisionError", `${code} is already governed by the ${collision.templateName} (${collision.ruleLabel}). Edit that item instead.`, { collision });
  }
  return audited(
    { actor, action: "masking.field_created", targetType: "MaskingField", targetId: code, eventDescription: `Created custom field ${code} (no rule yet)`, payload: { code, name: input.name.trim() } },
    (tx) => tx.maskingField.create({ data: { code, name: input.name.trim(), sensitivity: input.sensitivity, detectionPattern: input.detectionPattern?.trim() || null, dataElementRef: input.dataElementRef?.trim() || null, sampleValue: input.sampleValue.trim(), createdBy: actor.label } }),
  );
}

export async function getPendingChange(code: string) {
  const cr = await db.maskingChangeRequest.findFirst({ where: { fieldCode: code.toUpperCase(), status: "pending" }, orderBy: { proposedAt: "desc" } });
  if (!cr) return null;
  return {
    id: cr.id, kind: cr.kind, proposedBy: cr.proposedBy, proposedAt: cr.proposedAt,
    reason: cr.reason,
    before: decodeObject<RulePatch[]>(cr.beforeJson) ?? [],
    after: decodeObject<RulePatch[]>(cr.afterJson) ?? [],
  };
}

export async function fieldHistory(code: string, take = 5) {
  return db.auditLogEntry.findMany({
    where: { targetType: "MaskingField", targetId: code.toUpperCase(), action: { contains: "masking." } },
    orderBy: { seq: "desc" }, take,
  });
}

// --- Mutations --------------------------------------------------------------

export interface CreateFieldInput {
  code: string; name: string; sensitivity: string; detectionPattern?: string; dataElementRef?: string;
  sampleValue: string; defaultRule: { family: string; params: Record<string, unknown> };
  channelOverrides: { channel: string; family: string; params: Record<string, unknown> }[];
}

function validateCode(code: string) {
  if (!code) throw err("ValidationError", "Give the field a code.");
  if (!/^[A-Z0-9_]+$/.test(code)) throw err("ValidationError", "A code may use only A–Z, 0–9 and underscores.");
}

export async function createField(input: CreateFieldInput, actor: AuditActor) {
  const code = input.code.trim().toUpperCase();
  validateCode(code);
  if (!input.name.trim()) throw err("ValidationError", "Give the field a name.");
  const existing = await db.maskingField.findUnique({ where: { code } });
  if (existing) throw err("DuplicateError", `A field with code ${code} already exists.`);
  if (input.defaultRule.family === "synthetic") throw err("ValidationError", "Synthetic value is only allowed on the Non-prod channel.");

  return audited(
    { actor, action: "masking.field_created", targetType: "MaskingField", targetId: code, eventDescription: `Created field ${code} with a tenant ${input.defaultRule.family} rule`, payload: { code, name: input.name.trim(), rule: ruleLabel(input.defaultRule as Rule), overrides: input.channelOverrides.length } },
    async (tx) => {
      const field = await tx.maskingField.create({
        data: { code, name: input.name.trim(), sensitivity: input.sensitivity, detectionPattern: input.detectionPattern?.trim() || null, dataElementRef: input.dataElementRef?.trim() || null, sampleValue: input.sampleValue.trim(), createdBy: actor.label },
      });
      await tx.maskingLayerRule.create({ data: { fieldCode: code, layer: "tenant", family: input.defaultRule.family, paramsJson: encodeObject(input.defaultRule.params), locked: false } });
      for (const o of input.channelOverrides) {
        if (o.family === "synthetic" && o.channel !== "nonprod") throw err("ValidationError", "Synthetic value is only allowed on the Non-prod channel.");
        await tx.maskingChannelRule.create({ data: { fieldCode: code, layer: "tenant", channel: o.channel, family: o.family, paramsJson: encodeObject(o.params) } });
      }
      return field;
    },
  );
}

/** The floor a tenant rule must meet for a channel = the resolved rule from the layer below tenant. */
async function tenantFloor(code: string, channel: string | null): Promise<Rule | null> {
  const rules = await db.maskingLayerRule.findMany({ where: { fieldCode: code, layer: { in: ["regional", "baseline"] } } });
  if (rules.length === 0) return null;
  const below = rules.sort((a, b) => (LAYER_PRECEDENCE[b.layer as Layer] ?? 0) - (LAYER_PRECEDENCE[a.layer as Layer] ?? 0))[0];
  if (channel) {
    const cr = await db.maskingChannelRule.findFirst({ where: { fieldCode: code, layer: below.layer, channel } });
    if (cr) return ruleOf(cr);
  }
  return ruleOf(below);
}

/**
 * Direct edit of a tenant rule (or adding a tenant rule to a no-rule field).
 * Allowed only when every proposed rule is equal-or-stricter than the current one
 * (tightening) AND meets the floor. A loosening change must go through a proposal.
 * A field governed below by a locked layer (regional/baseline) cannot get a direct
 * tenant edit here — that path is a proposal.
 */
export async function editTenantRule(code: string, patches: RulePatch[], actor: AuditActor) {
  const field = await db.maskingField.findUnique({ where: { code }, include: { layerRules: true, channelRules: true } });
  if (!field) throw err("NotFoundError", "That field no longer exists.");
  const tenant = field.layerRules.find((l) => l.layer === "tenant");
  const governedBelow = field.layerRules.some((l) => l.layer !== "tenant");
  if (tenant?.locked) throw err("ForbiddenError", "This rule is governed and cannot be edited directly.");
  // No tenant layer and a governed layer beneath → overriding it is a proposal.
  if (!tenant && governedBelow) throw err("NeedsApproval", "This field is governed by a template; a tenant override must be proposed for DPO approval.");
  const adding = !tenant;

  for (const p of patches) {
    if (p.family === "synthetic" && p.channel !== "nonprod") throw err("ValidationError", "Synthetic value is only allowed on the Non-prod channel.");
    const floor = await tenantFloor(code, p.channel);
    if (floor && strictness(p as Rule) < strictness(floor)) throw err("FloorError", `Weaker than the floor (${ruleLabel(floor)}).`);
    if (!adding) {
      const current = p.channel
        ? (field.channelRules.find((c) => c.layer === "tenant" && c.channel === p.channel) ?? tenant!)
        : tenant!;
      if (strictness(p as Rule) < strictness(ruleOf(current))) {
        throw err("NeedsApproval", "This change loosens the current rule, so it needs DPO approval. Submit it as a proposal instead.");
      }
    }
  }

  return audited(
    { actor, action: "masking.rule_edited", targetType: "MaskingField", targetId: code, eventDescription: `${adding ? "Added a" : "Tightened the"} tenant rule for ${code}`, payload: { code, added: adding, changes: patches.map((p) => ({ channel: p.channel ?? "default", rule: ruleLabel(p as Rule) })) } },
    async (tx) => {
      let tenantId = tenant?.id ?? null;
      for (const p of patches) {
        if (p.channel) {
          await tx.maskingChannelRule.upsert({
            where: { fieldCode_layer_channel: { fieldCode: code, layer: "tenant", channel: p.channel } },
            update: { family: p.family, paramsJson: encodeObject(p.params) },
            create: { fieldCode: code, layer: "tenant", channel: p.channel, family: p.family, paramsJson: encodeObject(p.params) },
          });
        } else if (tenantId) {
          await tx.maskingLayerRule.update({ where: { id: tenantId }, data: { family: p.family, paramsJson: encodeObject(p.params) } });
        } else {
          const created = await tx.maskingLayerRule.create({ data: { fieldCode: code, layer: "tenant", family: p.family, paramsJson: encodeObject(p.params), locked: false } });
          tenantId = created.id;
        }
      }
    },
  );
}

export async function proposeChange(code: string, before: RulePatch[], after: RulePatch[], reason: string, actor: AuditActor) {
  if (!reason.trim()) throw err("ValidationError", "A reason is required for a proposal.");
  const field = await db.maskingField.findUnique({ where: { code } });
  if (!field) throw err("NotFoundError", "That field no longer exists.");
  const open = await db.maskingChangeRequest.findFirst({ where: { fieldCode: code, status: "pending" } });
  if (open) throw err("ConflictError", "A change is already pending for this field. Decide or withdraw it first.");

  return audited(
    { actor, action: "masking.change_proposed", targetType: "MaskingField", targetId: code, eventDescription: `Proposed a masking change to ${code} — awaiting DPO approval`, payload: { code, reason: reason.trim(), after: after.map((p) => ({ channel: p.channel ?? "default", rule: ruleLabel(p as Rule) })) } },
    (tx) => tx.maskingChangeRequest.create({ data: { fieldCode: code, kind: "rule_change", proposedBy: actor.label, beforeJson: encodeObject(before), afterJson: encodeObject(after), reason: reason.trim(), status: "pending" } }),
  );
}

export async function proposeException(code: string, role: string, purpose: string, durationMinutes: number, reason: string, actor: AuditActor) {
  if (!purpose.trim()) throw err("ValidationError", "State the purpose of the exception.");
  const field = await db.maskingField.findUnique({ where: { code } });
  if (!field) throw err("NotFoundError", "That field no longer exists.");
  const after: RulePatch[] = [{ layer: "exception", channel: null, family: "unmask", params: { role, purpose: purpose.trim(), durationMinutes } }];
  return audited(
    { actor, action: "masking.change_proposed", targetType: "MaskingField", targetId: code, eventDescription: `Proposed an unmask exception on ${code} for ${role} — awaiting DPO approval`, payload: { code, role, purpose: purpose.trim(), durationMinutes } },
    (tx) => tx.maskingChangeRequest.create({ data: { fieldCode: code, kind: "exception_add", proposedBy: actor.label, beforeJson: encodeObject([]), afterJson: encodeObject(after), reason: reason.trim() || `Unmask for ${role}: ${purpose.trim()}`, status: "pending" } }),
  );
}

async function assertDpo(actor: AuditActor) {
  const combined = await isCombinedGovernance();
  if (!(actor.role === "dpo" || (combined && actor.role === "admin"))) {
    throw err("UnauthorisedRulingError", "Only the DPO can decide a proposed change. Switch role to DPO to decide.");
  }
}

export async function decideChange(id: string, approve: boolean, note: string, actor: AuditActor) {
  await assertDpo(actor);
  const cr = await db.maskingChangeRequest.findUnique({ where: { id } });
  if (!cr) throw err("NotFoundError", "That proposal no longer exists.");
  if (cr.status !== "pending") throw err("ValidationError", "This proposal has already been decided.");
  if (!approve && !note.trim()) throw err("ValidationError", "A reason is required to reject a proposal.");

  const after = decodeObject<RulePatch[]>(cr.afterJson) ?? [];
  return audited(
    { actor, action: approve ? "masking.change_approved" : "masking.change_rejected", targetType: "MaskingField", targetId: cr.fieldCode, eventDescription: `${approve ? "Approved" : "Rejected"} a proposed change to ${cr.fieldCode}`, payload: { code: cr.fieldCode, kind: cr.kind, note: note.trim() || null } },
    async (tx) => {
      await tx.maskingChangeRequest.update({ where: { id }, data: { status: approve ? "approved" : "rejected", decidedBy: actor.label, decidedAt: new Date(), decisionNote: note.trim() || null } });
      if (!approve) return;
      if (cr.kind === "reactivate") {
        // Turning an Override back On: restore the stored tenant rule to active.
        const lr = await tx.maskingLayerRule.findFirst({ where: { fieldCode: cr.fieldCode, layer: "tenant" } });
        if (lr) await tx.maskingLayerRule.update({ where: { id: lr.id }, data: { active: true } });
        await recordAction(tx as never, { actor, action: "masking.override_on", targetType: "MaskingField", targetId: cr.fieldCode, eventDescription: `Override switched back On for ${cr.fieldCode}`, payload: { code: cr.fieldCode } });
      } else if (cr.kind === "variant_add") {
        // A role/channel Visibility Matrix variant — stored approved, but STILL not
        // applied until enforcement_active is true (resolver ignores variants).
        const p = after[0];
        if (p) {
          await tx.maskingVisibilityVariant.upsert({
            where: { fieldCode_scopeType_scopeValue: { fieldCode: cr.fieldCode, scopeType: String(p.params.scopeType), scopeValue: String(p.params.scopeValue) } },
            update: { family: p.family, paramsJson: encodeObject(p.params.ruleParams ?? {}), status: "approved" },
            create: { fieldCode: cr.fieldCode, scopeType: String(p.params.scopeType), scopeValue: String(p.params.scopeValue), family: p.family, paramsJson: encodeObject(p.params.ruleParams ?? {}), status: "approved", createdBy: cr.proposedBy },
          });
        }
      } else if (cr.kind === "exception_add") {
        const p = after[0]?.params ?? {};
        const mins = Number(p.durationMinutes) || 15;
        await tx.maskingUnmaskException.create({ data: { fieldCode: cr.fieldCode, role: String(p.role), purpose: String(p.purpose), durationMinutes: mins, expiresAt: new Date(Date.now() + mins * 60000), createdBy: cr.proposedBy, approvedBy: actor.label } });
        await recordAction(tx as never, { actor, action: "masking.exception_added", targetType: "MaskingField", targetId: cr.fieldCode, eventDescription: `Unmask exception granted on ${cr.fieldCode} for ${p.role}`, payload: { code: cr.fieldCode, role: p.role, durationMinutes: mins } });
      } else {
        for (const patch of after) {
          if (patch.channel) {
            await tx.maskingChannelRule.upsert({
              where: { fieldCode_layer_channel: { fieldCode: cr.fieldCode, layer: patch.layer, channel: patch.channel } },
              update: { family: patch.family, paramsJson: encodeObject(patch.params) },
              create: { fieldCode: cr.fieldCode, layer: patch.layer, channel: patch.channel, family: patch.family, paramsJson: encodeObject(patch.params) },
            });
          } else {
            const lr = await tx.maskingLayerRule.findFirst({ where: { fieldCode: cr.fieldCode, layer: patch.layer } });
            if (lr) await tx.maskingLayerRule.update({ where: { id: lr.id }, data: { family: patch.family, paramsJson: encodeObject(patch.params) } });
          }
        }
      }
    },
  );
}

/** DPO counter-proposal: reject the pending proposal and raise the DPO's alternative. */
export async function counterPropose(id: string, family: string, params: Record<string, unknown>, note: string, actor: AuditActor) {
  await assertDpo(actor);
  const cr = await db.maskingChangeRequest.findUnique({ where: { id } });
  if (!cr) throw err("NotFoundError", "That proposal no longer exists.");
  if (cr.status !== "pending") throw err("ValidationError", "This proposal has already been decided.");
  if (!note.trim()) throw err("ValidationError", "A note is required for a counter-proposal.");
  return audited(
    { actor, action: "masking.change_countered", targetType: "MaskingField", targetId: cr.fieldCode, eventDescription: `Counter-proposed a different rule for ${cr.fieldCode}`, payload: { code: cr.fieldCode, counter: ruleLabel({ family, params }) } },
    async (tx) => {
      await tx.maskingChangeRequest.update({ where: { id }, data: { status: "rejected", decidedBy: actor.label, decidedAt: new Date(), decisionNote: `Counter-proposed: ${note.trim()}` } });
      await tx.maskingChangeRequest.create({ data: { fieldCode: cr.fieldCode, kind: "rule_change", proposedBy: actor.label, beforeJson: cr.beforeJson, afterJson: encodeObject([{ layer: "tenant", channel: null, family, params }]), reason: note.trim(), status: "pending" } });
    },
  );
}

export async function withdrawProposal(id: string, actor: AuditActor) {
  const cr = await db.maskingChangeRequest.findUnique({ where: { id } });
  if (!cr) throw err("NotFoundError", "That proposal no longer exists.");
  if (cr.status !== "pending") throw err("ValidationError", "This proposal has already been decided.");
  return audited(
    { actor, action: "masking.change_rejected", targetType: "MaskingField", targetId: cr.fieldCode, eventDescription: `Withdrew the proposed change to ${cr.fieldCode}`, payload: { code: cr.fieldCode, withdrawn: true } },
    (tx) => tx.maskingChangeRequest.update({ where: { id }, data: { status: "rejected", decidedBy: actor.label, decidedAt: new Date(), decisionNote: "Withdrawn by proposer." } }),
  );
}

/**
 * Override OFF — UNILATERAL, no approval (always the safer direction). The tenant
 * rule is retained but switched inactive, so resolution falls through live to the
 * template/BASELINE and stays correct even if that default later changes.
 */
export async function setOverrideOff(code: string, actor: AuditActor) {
  const tenant = await db.maskingLayerRule.findFirst({ where: { fieldCode: code, layer: "tenant" } });
  if (!tenant) throw err("ValidationError", "This field has no tenant rule to switch off.");
  if (tenant.systemRegulated) throw err("ForbiddenError", "A SYSTEM-regulated field cannot be changed.");
  if (!tenant.active) throw err("ValidationError", "The override is already off.");
  return audited(
    { actor, action: "masking.override_off", targetType: "MaskingField", targetId: code, eventDescription: `Switched the override Off for ${code} — resolving to the template/BASELINE value`, payload: { code } },
    (tx) => tx.maskingLayerRule.update({ where: { id: tenant.id }, data: { active: false } }),
  );
}

/**
 * Override ON — requires DPO approval (same as any Edit). Raises a `reactivate`
 * proposal; on approval the stored tenant rule is restored to active.
 */
export async function proposeOverrideOn(code: string, reason: string, actor: AuditActor) {
  const tenant = await db.maskingLayerRule.findFirst({ where: { fieldCode: code, layer: "tenant" } });
  if (!tenant) throw err("ValidationError", "This field has no stored tenant rule.");
  if (tenant.active) throw err("ValidationError", "The override is already on.");
  const open = await db.maskingChangeRequest.findFirst({ where: { fieldCode: code, status: "pending" } });
  if (open) throw err("ConflictError", "A change is already pending for this field.");
  const stored = ruleOf(tenant);
  return audited(
    { actor, action: "masking.change_proposed", targetType: "MaskingField", targetId: code, eventDescription: `Proposed turning the override back On for ${code} — awaiting DPO approval`, payload: { code, rule: ruleLabel(stored) } },
    (tx) => tx.maskingChangeRequest.create({ data: { fieldCode: code, kind: "reactivate", proposedBy: actor.label, beforeJson: encodeObject([{ layer: "tenant", channel: null, family: "reveal", params: {} }]), afterJson: encodeObject([{ layer: "tenant", channel: null, family: stored.family, params: stored.params }]), reason: reason.trim() || `Restore the stored rule (${ruleLabel(stored)}).`, status: "pending" } }),
  );
}

/**
 * Delete a tenant rule entirely (distinct from, and more consequential than, the
 * Off toggle). Removes the rule, its channel overrides and its variants. Single-rule
 * delete is exposed directly in this prototype (the atomic bulk path remains for
 * multi-field apply). SYSTEM-regulated fields can never be deleted.
 */
export async function deleteRule(code: string, actor: AuditActor) {
  const tenant = await db.maskingLayerRule.findFirst({ where: { fieldCode: code, layer: "tenant" } });
  if (!tenant) throw err("ValidationError", "This field has no tenant rule to delete.");
  if (tenant.systemRegulated) throw err("ForbiddenError", "A SYSTEM-regulated rule can never be deleted.");
  return audited(
    { actor, action: "masking.rule_deleted", targetType: "MaskingField", targetId: code, eventDescription: `Deleted the tenant rule on ${code}`, payload: { code, deleted: ruleLabel(ruleOf(tenant)) } },
    async (tx) => {
      await tx.maskingChannelRule.deleteMany({ where: { fieldCode: code, layer: "tenant" } });
      await tx.maskingVisibilityVariant.deleteMany({ where: { fieldCode: code } });
      await tx.maskingLayerRule.delete({ where: { id: tenant.id } });
    },
  );
}

/**
 * Prior values of this field's tenant rule, for manual history-based revert
 * (distinct from the Off toggle — this re-enters an earlier value, it does not
 * fall through to a template). Sourced from decided change requests, which store
 * full params, newest first.
 */
export async function ruleVersions(code: string): Promise<RuleVersion[]> {
  const crs = await db.maskingChangeRequest.findMany({
    where: { fieldCode: code.toUpperCase(), status: "approved", kind: "rule_change" },
    orderBy: { decidedAt: "desc" }, take: 8,
  });
  const out: RuleVersion[] = [];
  const seen = new Set<string>();
  for (const cr of crs) {
    const patches = decodeObject<RulePatch[]>(cr.afterJson) ?? [];
    const def = patches.find((p) => !p.channel);
    if (!def) continue;
    const key = `${def.family}:${encodeObject(def.params)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ family: def.family, params: def.params, label: ruleLabel(def as Rule), at: (cr.decidedAt ?? cr.proposedAt).toISOString().slice(0, 16).replace("T", " "), by: cr.decidedBy ?? cr.proposedBy, source: "approved change" });
  }
  return out;
}

// --- Visibility Matrix (role/channel) — GATED by ENFORCEMENT_ACTIVE ---------

/**
 * Add a role/channel variant. EVERY variant is a DPO proposal (kind variant_add),
 * never applied directly — and even once approved it does NOT change resolution
 * while enforcement_active is false. Only template_governed / tenant_governed
 * fields may carry variants; SYSTEM-regulated fields cannot (enforced here).
 */
export async function proposeVariant(code: string, scopeType: string, scopeValue: string, family: string, params: Record<string, unknown>, reason: string, actor: AuditActor) {
  if (!scopeValue.trim()) throw err("ValidationError", "Choose a role or channel for this view.");
  const bundle = await loadBundle(code.toUpperCase());
  if (!bundle) throw err("NotFoundError", "That field no longer exists.");
  if (bundle.layerRules.some((l) => l.systemRegulated)) throw err("ForbiddenError", "A platform-owned field cannot carry role or channel views.");
  const open = await db.maskingChangeRequest.findFirst({ where: { fieldCode: code, status: "pending" } });
  if (open) throw err("ConflictError", "A change is already pending for this field.");
  const after: RulePatch[] = [{ layer: "tenant", channel: null, family, params: { scopeType, scopeValue: scopeValue.trim(), ruleParams: params } }];
  return audited(
    { actor, action: "masking.change_proposed", targetType: "MaskingField", targetId: code, eventDescription: `Proposed a ${scopeType} view (${scopeValue.trim()}) on ${code} — awaiting DPO approval`, payload: { code, scopeType, scopeValue: scopeValue.trim(), rule: ruleLabel({ family, params }) } },
    (tx) => tx.maskingChangeRequest.create({ data: { fieldCode: code, kind: "variant_add", proposedBy: actor.label, beforeJson: encodeObject([]), afterJson: encodeObject(after), reason: reason.trim() || `Add a ${scopeType} view for ${scopeValue.trim()}.`, status: "pending" } }),
  );
}

/** Remove an approved variant (its own approvable unit — removal is immediate for the tenant's own variants). */
export async function removeVariant(id: string, actor: AuditActor) {
  const v = await db.maskingVisibilityVariant.findUnique({ where: { id } });
  if (!v) throw err("NotFoundError", "That view no longer exists.");
  return audited(
    { actor, action: "masking.variant_removed", targetType: "MaskingField", targetId: v.fieldCode, eventDescription: `Removed the ${v.scopeType} view (${v.scopeValue}) from ${v.fieldCode}`, payload: { code: v.fieldCode, scopeType: v.scopeType, scopeValue: v.scopeValue } },
    (tx) => tx.maskingVisibilityVariant.delete({ where: { id } }),
  );
}

// --- Custom templates (tenant-owned) ----------------------------------------

export interface CustomTemplateView { key: string; name: string; fields: number; createdBy: string | null }

export async function getCustomTemplates(): Promise<CustomTemplateView[]> {
  const [templates, counts] = await Promise.all([
    db.maskingTemplate.findMany({ where: { kind: "custom" }, orderBy: { createdAt: "asc" } }),
    db.maskingLayerRule.groupBy({ by: ["templateKey"], where: { templateKey: { not: null } }, _count: true }),
  ]);
  return templates.map((t) => ({ key: t.key, name: t.name, createdBy: t.createdBy, fields: counts.find((c) => c.templateKey === t.key)?._count ?? 0 }));
}

/** Create a tenant-owned custom template (optionally copying BASELINE field codes as members). */
export async function createCustomTemplate(name: string, copyBaseline: boolean, actor: AuditActor) {
  if (!name.trim()) throw err("ValidationError", "Name the custom template.");
  const key = `CUSTOM_${name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "")}`.slice(0, 40);
  const existing = await db.maskingTemplate.findUnique({ where: { key } });
  if (existing) throw err("DuplicateError", "A custom template with a similar name already exists.");
  return audited(
    { actor, action: "masking.template_created", targetType: "MaskingTemplate", targetId: key, eventDescription: `Created the custom template "${name.trim()}"`, payload: { key, name: name.trim(), copyBaseline } },
    async (tx) => {
      const t = await tx.maskingTemplate.create({ data: { key, name: name.trim(), kind: "custom", associated: true, sortOrder: 50, createdBy: actor.label } });
      if (copyBaseline) {
        const baseCodes = await tx.maskingLayerRule.findMany({ where: { layer: "baseline" }, select: { fieldCode: true } });
        const codes = baseCodes.map((b) => b.fieldCode);
        await tx.maskingLayerRule.updateMany({ where: { fieldCode: { in: codes }, layer: "tenant" }, data: { templateKey: key } });
      }
      return t;
    },
  );
}

/**
 * Move a tenant rule into a custom template — a TRUE re-association: the same rule
 * row keeps its identity and audit history, only its templateKey changes.
 */
export async function moveRuleToTemplate(code: string, templateKey: string, actor: AuditActor) {
  const tenant = await db.maskingLayerRule.findFirst({ where: { fieldCode: code, layer: "tenant" } });
  if (!tenant) throw err("ValidationError", "This field has no tenant rule to move.");
  if (tenant.systemRegulated) throw err("ForbiddenError", "A SYSTEM-regulated field cannot be moved.");
  const t = await db.maskingTemplate.findUnique({ where: { key: templateKey } });
  if (!t || t.kind !== "custom") throw err("NotFoundError", "Choose a custom template.");
  return audited(
    { actor, action: "masking.rule_moved", targetType: "MaskingField", targetId: code, eventDescription: `Moved ${code} into the custom template "${t.name}" (same rule, history continues)`, payload: { code, templateKey, templateName: t.name } },
    (tx) => tx.maskingLayerRule.update({ where: { id: tenant.id }, data: { templateKey } }),
  );
}

/** Unlock a tenant self-locked rule (never a SYSTEM-regulated or governed one). */
export async function unlockSelfLocked(code: string, actor: AuditActor) {
  const rule = await db.maskingLayerRule.findFirst({ where: { fieldCode: code, layer: "tenant" } });
  if (!rule) throw err("NotFoundError", "No tenant rule to unlock.");
  if (rule.systemRegulated) throw err("ForbiddenError", "A SYSTEM-regulated rule can never be unlocked.");
  if (!rule.locked) throw err("ValidationError", "This rule is not locked.");
  return audited(
    { actor, action: "masking.self_unlocked", targetType: "MaskingField", targetId: code, eventDescription: `Unlocked the self-locked rule on ${code}`, payload: { code } },
    (tx) => tx.maskingLayerRule.update({ where: { id: rule.id }, data: { locked: false } }),
  );
}

// --- Rule groups (apply one rule to many fields) ----------------------------

function rulesEqual(a: Rule, b: Rule): boolean {
  return a.family === b.family && encodeObject(a.params) === encodeObject(b.params);
}

export interface GroupMemberValidation { code: string; eligible: boolean; reason: string | null; source: string }

/**
 * Pre-validate members BEFORE the atomic bulk. A SYSTEM-regulated field may join
 * only with an exact match to its regulating rule; an ambiguous field cannot join.
 */
export async function validateGroupMembers(family: string, params: Record<string, unknown>, codes: string[]): Promise<GroupMemberValidation[]> {
  const def: Rule = { family, params };
  const active = await activeRegionalSet();
  const out: GroupMemberValidation[] = [];
  for (const code of codes) {
    const bundle = await loadBundle(code.toUpperCase());
    if (!bundle) { out.push({ code, eligible: false, reason: "No such field.", source: "—" }); continue; }
    const res = resolveBundle(bundle, active);
    const sys = bundle.layerRules.find((l) => l.systemRegulated);
    if (res.status === "ambiguous") { out.push({ code, eligible: false, reason: `Ambiguous — two regional templates claim this code (${res.ambiguity?.sources.join(", ")}).`, source: "Needs attention" }); continue; }
    if (sys) {
      if (!rulesEqual(ruleOf(sys), def)) { out.push({ code, eligible: false, reason: `SYSTEM-regulated — only an exact match to ${ruleLabel(ruleOf(sys))} may join.`, source: layerBadge(sys.layer, sys.source) }); continue; }
    }
    out.push({ code, eligible: true, reason: null, source: res.governedBy?.badge ?? "—" });
  }
  return out;
}

export interface CreateGroupInput { name: string; family: string; params: Record<string, unknown>; memberCodes: string[] }

/** Create a group and materialize one tenant rule per member in ONE atomic call. */
export async function createAndApplyGroup(input: CreateGroupInput, actor: AuditActor) {
  if (!input.name.trim()) throw err("ValidationError", "Name the group.");
  if (input.memberCodes.length === 0) throw err("ValidationError", "Add at least one field.");
  const validation = await validateGroupMembers(input.family, input.params, input.memberCodes);
  const bad = validation.filter((v) => !v.eligible);
  if (bad.length > 0) {
    throw err("BulkValidationError", `Bulk apply is all-or-nothing and ${bad.length} field(s) can't take this rule: ${bad.map((b) => `${b.code} (${b.reason})`).join("; ")}`, { offenders: bad });
  }
  return audited(
    { actor, action: "masking.group_applied", targetType: "MaskingRuleGroup", targetId: input.name.trim(), eventDescription: `Applied group "${input.name.trim()}" (${ruleLabel({ family: input.family, params: input.params })}) to ${input.memberCodes.length} fields`, payload: { name: input.name.trim(), rule: ruleLabel({ family: input.family, params: input.params }), members: input.memberCodes } },
    async (tx) => {
      const group = await tx.maskingRuleGroup.create({ data: { name: input.name.trim(), family: input.family, paramsJson: encodeObject(input.params), memberCodesJson: encodeObject(input.memberCodes), createdBy: actor.label } });
      for (const code of input.memberCodes) {
        const existing = await tx.maskingLayerRule.findFirst({ where: { fieldCode: code, layer: "tenant" } });
        if (existing) await tx.maskingLayerRule.update({ where: { id: existing.id }, data: { family: input.family, paramsJson: encodeObject(input.params) } });
        else await tx.maskingLayerRule.create({ data: { fieldCode: code, layer: "tenant", family: input.family, paramsJson: encodeObject(input.params) } });
      }
      return group;
    },
  );
}

/** Re-apply a group's definition to every member, atomically (fixes divergence). */
export async function reapplyGroup(id: string, actor: AuditActor) {
  const group = await db.maskingRuleGroup.findUnique({ where: { id } });
  if (!group) throw err("NotFoundError", "That group no longer exists.");
  const codes = decodeObject<string[]>(group.memberCodesJson) ?? [];
  const params = decodeObject<Record<string, unknown>>(group.paramsJson) ?? {};
  const validation = await validateGroupMembers(group.family, params, codes);
  const bad = validation.filter((v) => !v.eligible);
  if (bad.length > 0) throw err("BulkValidationError", `${bad.length} field(s) can't take this rule: ${bad.map((b) => `${b.code} (${b.reason})`).join("; ")}`, { offenders: bad });
  return audited(
    { actor, action: "masking.group_applied", targetType: "MaskingRuleGroup", targetId: group.name, eventDescription: `Re-applied group "${group.name}" to ${codes.length} fields`, payload: { name: group.name, members: codes } },
    async (tx) => {
      for (const code of codes) {
        const existing = await tx.maskingLayerRule.findFirst({ where: { fieldCode: code, layer: "tenant" } });
        if (existing) await tx.maskingLayerRule.update({ where: { id: existing.id }, data: { family: group.family, paramsJson: group.paramsJson } });
        else await tx.maskingLayerRule.create({ data: { fieldCode: code, layer: "tenant", family: group.family, paramsJson: group.paramsJson } });
      }
    },
  );
}

export async function detachField(id: string, code: string, actor: AuditActor) {
  const group = await db.maskingRuleGroup.findUnique({ where: { id } });
  if (!group) throw err("NotFoundError", "That group no longer exists.");
  const codes = (decodeObject<string[]>(group.memberCodesJson) ?? []).filter((c) => c !== code);
  return audited(
    { actor, action: "masking.group_detached", targetType: "MaskingRuleGroup", targetId: group.name, eventDescription: `Detached ${code} from group "${group.name}"`, payload: { name: group.name, code } },
    (tx) => tx.maskingRuleGroup.update({ where: { id }, data: { memberCodesJson: encodeObject(codes) } }),
  );
}

/**
 * Revert a field to its template default — UNILATERAL, no approval. Removes the
 * tenant rule (and its channel overrides) so the field falls back to the regional
 * template or BASELINE per normal resolution. This direction is always the safer
 * one (returning to what DPO/CISO govern), so it is not gated.
 */
export async function revertToTemplate(code: string, actor: AuditActor) {
  const tenant = await db.maskingLayerRule.findFirst({ where: { fieldCode: code, layer: "tenant" } });
  if (!tenant) throw err("ValidationError", "This field has no tenant rule to revert.");
  if (tenant.systemRegulated) throw err("ForbiddenError", "A SYSTEM-regulated field cannot be reverted.");
  return audited(
    { actor, action: "masking.reverted", targetType: "MaskingField", targetId: code, eventDescription: `Reverted ${code} to its template default (tenant rule removed)`, payload: { code } },
    async (tx) => {
      await tx.maskingChannelRule.deleteMany({ where: { fieldCode: code, layer: "tenant" } });
      await tx.maskingLayerRule.delete({ where: { id: tenant.id } });
    },
  );
}

/** Re-sync ONE field's tenant rule back to its group's definition (unilateral). */
export async function resyncFieldToGroup(groupId: string, code: string, actor: AuditActor) {
  const group = await db.maskingRuleGroup.findUnique({ where: { id: groupId } });
  if (!group) throw err("NotFoundError", "That group no longer exists.");
  const params = decodeObject<Record<string, unknown>>(group.paramsJson) ?? {};
  return audited(
    { actor, action: "masking.group_resynced", targetType: "MaskingField", targetId: code, eventDescription: `Re-synced ${code} to group "${group.name}" (${ruleLabel({ family: group.family, params })})`, payload: { code, group: group.name } },
    async (tx) => {
      const existing = await tx.maskingLayerRule.findFirst({ where: { fieldCode: code, layer: "tenant" } });
      if (existing) await tx.maskingLayerRule.update({ where: { id: existing.id }, data: { family: group.family, paramsJson: group.paramsJson } });
      else await tx.maskingLayerRule.create({ data: { fieldCode: code, layer: "tenant", family: group.family, paramsJson: group.paramsJson } });
    },
  );
}

/** Groups with derived state (in_sync | diverged) and each member's effective source. */
export async function getRuleGroups(): Promise<RuleGroupView[]> {
  const groups = await db.maskingRuleGroup.findMany({ orderBy: { createdAt: "desc" } });
  const allCodes = [...new Set(groups.flatMap((g) => decodeObject<string[]>(g.memberCodesJson) ?? []))];
  const tenantRules = allCodes.length ? await db.maskingLayerRule.findMany({ where: { fieldCode: { in: allCodes }, layer: "tenant" } }) : [];
  const tenantByCode = new Map(tenantRules.map((r) => [r.fieldCode, r]));
  return groups.map((g) => {
    const codes = decodeObject<string[]>(g.memberCodesJson) ?? [];
    const params = decodeObject<Record<string, unknown>>(g.paramsJson) ?? {};
    const def: Rule = { family: g.family, params };
    const diverged = codes.filter((c) => { const r = tenantByCode.get(c); return !r || !rulesEqual(ruleOf(r), def); });
    const state: GroupState = diverged.length ? "diverged" : "in_sync";
    return { id: g.id, name: g.name, family: g.family, params, label: ruleLabel(def), memberCodes: codes, memberCount: codes.length, state, divergedCodes: diverged, createdBy: g.createdBy };
  });
}

// --- Create-rule plan (apply to many fields with per-field outcomes) ---------

export type { PlanRow } from "@/lib/masking";

/** Per-field outcome of applying one rule: apply now / needs approval / blocked. */
export async function planRuleForFields(family: string, params: Record<string, unknown>, codes: string[]): Promise<PlanRow[]> {
  const def: Rule = { family, params };
  const active = await activeRegionalSet();
  const out: PlanRow[] = [];
  for (const code of codes) {
    const bundle = await loadBundle(code.toUpperCase());
    if (!bundle) { out.push({ code, name: code, currentSource: "—", outcome: "blocked", reason: "No such field." }); continue; }
    const res = resolveBundle(bundle, active);
    const currentSource = res.status === "ambiguous" ? "Ambiguous" : res.governedBy?.badge ?? "No rule";
    const push = (outcome: PlanRow["outcome"], reason: string | null) => out.push({ code, name: bundle.name, currentSource, outcome, reason });

    if (res.status === "ambiguous") { push("blocked", "Ambiguous — resolve the template collision before applying a rule."); continue; }
    // regulatory_floor (Aadhaar/PAN/ABHA only): no override anywhere, ever.
    const sys = bundle.layerRules.find((l) => l.systemRegulated);
    if (sys) { push("blocked", "SYSTEM-regulated — owned by SUPER_ADMIN, cannot be changed."); continue; }

    const tenant = bundle.layerRules.find((l) => l.layer === "tenant");
    const governedBelow = bundle.layerRules.some((l) => l.layer !== "tenant");
    if (tenant?.locked) { push("blocked", "Self-locked — unlock the field before changing it."); continue; }
    // tenant_governed: EVERY edit to an existing tenant rule routes to DPO approval
    // (no silent drift — the Scenario 6 re-approval discipline).
    if (tenant) { push("approval", "Editing an existing tenant rule needs a fresh DPO approval."); continue; }
    // template_governed: overriding a template (BASELINE or a regional template) is
    // a governance decision — always to DPO approval, regardless of the new value.
    if (governedBelow) { push("approval", "Overriding a template needs DPO approval."); continue; }
    // no_rule: a first tenant rule is created directly.
    push("apply", null);
  }
  return out;
}

export interface SubmitPlanResult { applied: string[]; proposed: string[] }

/** Apply the "apply" fields atomically and raise proposals for the "approval" fields. */
export async function submitRulePlan(family: string, params: Record<string, unknown>, codes: string[], reason: string, actor: AuditActor): Promise<SubmitPlanResult> {
  const plan = await planRuleForFields(family, params, codes);
  const blocked = plan.filter((p) => p.outcome === "blocked");
  if (blocked.length) throw err("BlockedFieldError", `Remove the blocked field(s) first: ${blocked.map((b) => b.code).join(", ")}.`);
  const applyCodes = plan.filter((p) => p.outcome === "apply").map((p) => p.code);
  const approvalCodes = plan.filter((p) => p.outcome === "approval").map((p) => p.code);
  if (approvalCodes.length && !reason.trim()) throw err("ValidationError", "A reason is required — some fields need DPO approval.");

  if (applyCodes.length) {
    await audited(
      { actor, action: "masking.rule_edited", targetType: "MaskingRuleGroup", targetId: `apply:${applyCodes.length}`, eventDescription: `Applied ${ruleLabel({ family, params })} to ${applyCodes.length} field(s)`, payload: { rule: ruleLabel({ family, params }), fields: applyCodes } },
      async (tx) => {
        for (const code of applyCodes) {
          const existing = await tx.maskingLayerRule.findFirst({ where: { fieldCode: code, layer: "tenant" } });
          if (existing) await tx.maskingLayerRule.update({ where: { id: existing.id }, data: { family, paramsJson: encodeObject(params) } });
          else await tx.maskingLayerRule.create({ data: { fieldCode: code, layer: "tenant", family, paramsJson: encodeObject(params) } });
        }
      },
    );
  }
  for (const code of approvalCodes) {
    const open = await db.maskingChangeRequest.findFirst({ where: { fieldCode: code, status: "pending" } });
    if (open) continue; // one pending at a time
    const cur = await resolveField(code);
    const before: RulePatch[] = cur?.effective
      ? [{ layer: "tenant", channel: null, family: cur.effective.family, params: cur.effective.params }]
      : [{ layer: "tenant", channel: null, family: "reveal", params: {} }];
    await proposeChange(code, before, [{ layer: "tenant", channel: null, family, params }], reason, actor);
  }
  return { applied: applyCodes, proposed: approvalCodes };
}

/** Fields eligible to be a group member (all fields, for the create picker). */
export async function listFieldCodes(): Promise<{ code: string; name: string }[]> {
  const fields = await db.maskingField.findMany({ orderBy: { code: "asc" }, select: { code: true, name: true } });
  return fields;
}

/** Expire past-due exceptions and log each — automatic system behaviour, no actor. */
async function expireDueExceptions() {
  const due = await db.maskingUnmaskException.findMany({ where: { expiresAt: { lt: new Date() } } });
  for (const e of due) {
    await audited(
      { actor: { id: null, label: "System", role: "system" }, action: "masking.exception_expired", targetType: "MaskingField", targetId: e.fieldCode, eventDescription: `Unmask exception on ${e.fieldCode} for ${e.role} expired`, payload: { code: e.fieldCode, role: e.role } },
      (tx) => tx.maskingUnmaskException.delete({ where: { id: e.id } }),
    );
  }
}

export async function searchMaskingConfigLog(query: AuditQuery = {}) {
  return searchAuditLog({ ...query, action: query.action || "masking." });
}
