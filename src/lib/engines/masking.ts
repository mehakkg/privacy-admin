import { db } from "@/lib/db";
import { audited, searchAuditLog, type AuditActor, type AuditQuery } from "@/lib/engines/audit";
import {
  TIER_PRECEDENCE,
  maskExample as fmtMaskExample,
  type EffectiveResolution,
  type ResolutionStep,
  type Collision,
} from "@/lib/masking";

export type { Collision } from "@/lib/masking";

/**
 * DDM RESOLUTION ENGINE (server).
 *
 * `resolveEffective` is the single source of truth the Screen 1 page and the
 * GET /api/v1/admin/masking-rules/effective route both call, so the answer the
 * UI shows is byte-for-byte the answer the API gives. Mutations go through
 * `audited()` — masking config is tenant-owned, but every change is still
 * hash-chained into the one unified audit log (Screen 5).
 */

function err(name: string, message: string, extra?: Record<string, unknown>) {
  return Object.assign(new Error(message), { name, ...(extra ?? {}) });
}

function stepReason(tier: string, won: boolean, tenantWon: boolean, ambiguous: boolean): string {
  if (ambiguous && !won) {
    if (TIER_PRECEDENCE[tier as keyof typeof TIER_PRECEDENCE] > 0) {
      return "Conflicting source — ties with another non-BASELINE template at the same precedence, so nothing resolves until the tie is broken.";
    }
    return "Regulatory floor — always present, but the conflict above must be resolved before it can apply.";
  }
  if (won) {
    if (tier === "tenant") return "Your tenant's own rule takes precedence over regional templates and the BASELINE floor.";
    if (tier === "regional") return "A regional template overrides the BASELINE floor for this field. No tenant rule sits above it.";
    return "No tenant or regional rule applies — the BASELINE regulatory floor governs this field.";
  }
  // lost
  if (tier === "baseline") return "Regulatory floor — always present. Overridden here by a higher-precedence rule, but never removed.";
  if (tier === "regional") return tenantWon
    ? "Regional template — overridden by your tenant's own rule, which sits above it."
    : "Regional template — a higher-precedence rule applies to this field.";
  return "Overridden by a higher-precedence rule.";
}

export async function resolveEffective(rawCode: string): Promise<EffectiveResolution> {
  const code = rawCode.trim().toUpperCase();
  const [field, rules] = await Promise.all([
    db.maskingField.findUnique({ where: { code } }),
    db.maskingRule.findMany({ where: { fieldCode: code }, include: { template: true } }),
  ]);

  // Only templates this tenant is associated with participate in resolution.
  const active = rules
    .filter((r) => r.template.associated)
    .sort((a, b) => b.template.precedence - a.template.precedence);

  const fieldName = field?.name ?? active[0]?.fieldName ?? code;
  const sampleValue = field?.sampleValue ?? "";

  if (active.length === 0) {
    return {
      code, fieldName, sampleValue,
      status: "not_found", winner: null, chain: [], ambiguity: null,
      editableRuleId: null, editableRuleVersion: null,
    };
  }

  const top = active[0].template.precedence;
  const topRules = active.filter((r) => r.template.precedence === top);
  const distinctTop = new Set(topRules.map((r) => r.templateId));
  const ambiguous = top > 0 && distinctTop.size > 1;
  const winnerRule = ambiguous ? null : topRules[0];
  const tenantWon = !!winnerRule && winnerRule.template.tier === "tenant";

  const chain: ResolutionStep[] = active.map((r) => {
    const won = !!winnerRule && r.id === winnerRule.id;
    return {
      templateKey: r.template.key,
      templateName: r.template.name,
      tier: r.template.tier,
      precedence: r.template.precedence,
      ruleId: r.id,
      method: r.method,
      maskExample: sampleValue ? fmtMaskExample(r.method, sampleValue) : r.method,
      won,
      reason: stepReason(r.template.tier, won, tenantWon, ambiguous),
      editable: r.editable,
      lockType: r.lockType,
      regulated: r.regulated,
      ownedBy: r.template.ownedBy,
      lockedBy: r.lockedBy,
      lockedAt: r.lockedAt ? r.lockedAt.toISOString().slice(0, 10) : null,
      statutoryCitation: r.statutoryCitation,
      version: r.version,
    };
  });

  const winnerStep = chain.find((s) => s.won) ?? null;
  // A rule is offered for editing only when it wins, is marked editable, and is
  // not currently locked (a self-locked field must be unlocked first).
  const reachable = winnerStep && winnerStep.editable && winnerStep.lockType === "none";

  return {
    code, fieldName, sampleValue,
    status: ambiguous ? "ambiguous" : "resolved",
    winner: winnerStep,
    chain,
    ambiguity: ambiguous
      ? { sources: topRules.map((r) => ({ templateName: r.template.name, ruleId: r.id })) }
      : null,
    editableRuleId: reachable ? winnerStep!.ruleId : null,
    editableRuleVersion: reachable ? winnerStep!.version : null,
  };
}

/** Fields for the Screen 1 picker. */
export async function listMaskingFields() {
  return db.maskingField.findMany({ orderBy: [{ custom: "asc" }, { name: "asc" }] });
}

/** One rule (+ template) for the edit screen. */
export async function getRuleForEdit(id: string) {
  return db.maskingRule.findUnique({ where: { id }, include: { template: true } });
}

/** The regional templates this tenant is currently associated with. */
export async function associatedRegionalTemplates() {
  return db.maskingTemplate.findMany({ where: { tier: "regional", associated: true }, orderBy: { name: "asc" } });
}

/**
 * Check a field code against every associated regional template — the Screen 4
 * pre-check. A hit means creating the field would silently fail to resolve, so
 * creation is blocked.
 */
export async function checkCodeCollision(rawCode: string): Promise<Collision[]> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return [];
  const rules = await db.maskingRule.findMany({
    where: { fieldCode: code, template: { tier: "regional", associated: true } },
    include: { template: true },
  });
  return rules.map((r) => ({ templateName: r.template.name, templateKey: r.template.key, ruleId: r.id, method: r.method }));
}

// --- Mutations (audited) ----------------------------------------------------

export async function saveRule(id: string, expectedVersion: number, method: string, actor: AuditActor) {
  const rule = await db.maskingRule.findUnique({ where: { id }, include: { template: true } });
  if (!rule) throw err("NotFoundError", "That rule no longer exists.");
  if (!rule.editable) throw err("ForbiddenError", "This rule is view-only and cannot be edited here.");
  if (rule.lockType === "system_regulated") throw err("ForbiddenError", "This rule is system-regulated by SUPER_ADMIN and cannot be edited.");
  if (rule.lockType === "self_locked") throw err("LockedError", "This field is self-locked. Unlock it before editing.");

  return audited(
    {
      actor,
      action: "masking.rule_edited",
      targetType: "MaskingRule",
      targetId: id,
      eventDescription: `Edited masking rule for ${rule.fieldCode} (${rule.template.name})`,
      payload: {
        code: rule.fieldCode,
        template: rule.template.name,
        method_before: rule.method,
        method_after: method,
        version_before: expectedVersion,
        version_after: expectedVersion + 1,
      },
    },
    async (tx) => {
      // Optimistic lock enforced in the write itself: the update only lands if the
      // version is still the one we loaded. count === 0 means someone saved first.
      const res = await tx.maskingRule.updateMany({
        where: { id, version: expectedVersion },
        data: { method, version: { increment: 1 }, updatedBy: actor.label },
      });
      if (res.count === 0) {
        const current = await tx.maskingRule.findUnique({ where: { id } });
        throw err(
          "ConflictError",
          `This rule was changed by ${current?.updatedBy ?? "another admin"} since you opened it (it is now version ${current?.version ?? "?"}). Your save was rejected so nothing was overwritten — reload to see the current definition, then re-apply your change.`,
          {
            currentVersion: current?.version ?? null,
            changedBy: current?.updatedBy ?? null,
            changedAt: current?.updatedAt ? current.updatedAt.toISOString().slice(0, 16).replace("T", " ") : null,
            currentMethod: current?.method ?? null,
          },
        );
      }
      return tx.maskingRule.findUnique({ where: { id } });
    },
  );
}

export async function unlockRule(id: string, actor: AuditActor) {
  const rule = await db.maskingRule.findUnique({ where: { id }, include: { template: true } });
  if (!rule) throw err("NotFoundError", "That rule no longer exists.");
  if (rule.lockType === "system_regulated") throw err("ForbiddenError", "A system-regulated field cannot be unlocked by any tenant.");
  if (rule.lockType !== "self_locked") throw err("ValidationError", "This field is not self-locked.");

  return audited(
    {
      actor,
      action: "masking.rule_unlocked",
      targetType: "MaskingRule",
      targetId: id,
      eventDescription: `Unlocked self-locked field ${rule.fieldCode} — exact-match enforcement lifted`,
      payload: { code: rule.fieldCode, lock_before: "self_locked", lock_after: "none", regulated_before: true, regulated_after: false },
    },
    (tx) =>
      tx.maskingRule.update({
        where: { id },
        data: { lockType: "none", regulated: false, lockedBy: null, lockedAt: null, version: { increment: 1 }, updatedBy: actor.label },
      }),
  );
}

export interface CreateFieldInput { code: string; name: string; sampleValue: string; method: string }

export async function createField(input: CreateFieldInput, actor: AuditActor) {
  const code = input.code.trim().toUpperCase();
  if (!code) throw err("ValidationError", "Give the field a code.");
  if (!/^[A-Z0-9_]+$/.test(code)) throw err("ValidationError", "A field code may use only A–Z, 0–9 and underscores.");
  if (!input.name.trim()) throw err("ValidationError", "Give the field a name.");

  const [existing, collisions, tenant] = await Promise.all([
    db.maskingField.findUnique({ where: { code } }),
    checkCodeCollision(code),
    db.maskingTemplate.findUnique({ where: { key: "TENANT" } }),
  ]);
  if (existing) throw err("DuplicateError", `A field with code ${code} already exists.`);
  // The hard block, re-checked server-side: the client disables Create, and the
  // server refuses too, so a stale client can never slip a colliding field through.
  if (collisions.length > 0) {
    throw err(
      "CollisionError",
      `The code ${code} is already defined by your ${collisions.map((c) => c.templateName).join(", ")} association. Creating a duplicate would make this field fail to resolve. Edit the existing item instead.`,
      { collisions },
    );
  }
  if (!tenant) throw err("ConfigError", "No tenant template is configured.");

  return audited(
    {
      actor,
      action: "masking.field_created",
      targetType: "MaskingField",
      targetId: code,
      eventDescription: `Created custom field ${code} with a tenant masking rule (${input.method})`,
      payload: { code, name: input.name.trim(), method: input.method },
    },
    async (tx) => {
      const field = await tx.maskingField.create({
        data: { code, name: input.name.trim(), sampleValue: input.sampleValue.trim(), custom: true, createdBy: actor.label },
      });
      await tx.maskingRule.create({
        data: {
          templateId: tenant.id, fieldCode: code, fieldName: input.name.trim(),
          method: input.method, editable: true, lockType: "none", regulated: false, updatedBy: actor.label,
        },
      });
      return field;
    },
  );
}

/**
 * DEMO DEVICE — simulate a concurrent admin saving this rule, so the
 * optimistic-lock conflict (Screen 3) can be shown on demand rather than only
 * under a genuine race. It bumps the version and stamps a different actor; the
 * next save from a form loaded at the old version is then cleanly rejected.
 */
export async function simulateConcurrentEdit(id: string, actor: AuditActor) {
  const rule = await db.maskingRule.findUnique({ where: { id } });
  if (!rule) throw err("NotFoundError", "That rule no longer exists.");
  return audited(
    {
      actor,
      action: "masking.rule_edited",
      targetType: "MaskingRule",
      targetId: id,
      eventDescription: `Concurrent edit (simulated) to ${rule.fieldCode} by another admin`,
      payload: { code: rule.fieldCode, simulated_concurrent_edit: true, version_before: rule.version, version_after: rule.version + 1 },
    },
    (tx) =>
      tx.maskingRule.update({
        where: { id },
        data: { version: { increment: 1 }, updatedBy: "A. Nair (concurrent admin)" },
      }),
  );
}

/**
 * Screen 5 reuses the unified audit search, scoped to masking config actions.
 * masking_config_audit_log is a VIEW of the one immutable chain, not a second log.
 */
export async function searchMaskingConfigLog(query: AuditQuery = {}) {
  return searchAuditLog({ ...query, action: query.action || "masking." });
}
