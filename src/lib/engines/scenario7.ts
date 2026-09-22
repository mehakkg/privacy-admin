import { db } from "@/lib/db";
import { audited, type AuditActor } from "@/lib/engines/audit";
import { isCombinedGovernance } from "@/lib/governance";
import { suggestMetrics } from "@/lib/scenario7";
import type { TxClient } from "@/lib/tx";

/**
 * SCENARIO 6 ENGINE — protection-rule scope adjustment (CISO-gated), risk-
 * analytics source connection, acquisition entity setup, and bulk user→entity
 * mapping with dual-scope validation. Reuses ProtectionRule(Scope|Exception),
 * Entity, EntityUserMapping, RoleAssignment; never re-models them.
 */

// ---- Screens 2 & 3: exception investigation + scope adjustment -------------

export async function investigateException(exceptionId: string, actor: AuditActor) {
  await audited(
    { actor, action: "rule.exception_investigated", targetType: "ProtectionRuleException", targetId: exceptionId, eventDescription: "Investigated a rule exception", payload: {} },
    (tx: TxClient) => tx.protectionRuleException.update({ where: { id: exceptionId }, data: { investigatedAt: new Date() } }),
  );
}

/** Propose a narrower scope to resolve an exception. Captures the rule's current
 *  implemented scope as originalScope (preserved, never overwritten). */
export async function proposeScopeAdjustment(exceptionId: string, proposedScope: string, actor: AuditActor) {
  if (!proposedScope.trim()) throw Object.assign(new Error("Enter the proposed scope."), { name: "ValidationError" });
  const exc = await db.protectionRuleException.findUniqueOrThrow({ where: { id: exceptionId } });
  const scope = await db.protectionRuleScope.findUnique({ where: { ruleId: exc.ruleId } });
  const originalScope = scope?.systemsJson ?? "[]";
  return audited(
    { actor, action: "rule.scope_adjustment_proposed", targetType: "ProtectionRuleException", targetId: exceptionId, eventDescription: "Proposed a scope adjustment for CISO approval", payload: { proposedScope } },
    (tx: TxClient) => tx.scopeAdjustmentProposal.create({ data: { exceptionId, originalScope, proposedScope: proposedScope.trim(), proposedBy: actor.label, status: "pending_ciso" } }),
  );
}

async function assertCiso(actor: AuditActor) {
  const combined = await isCombinedGovernance();
  if (!(actor.role === "ciso" || (combined && actor.role === "admin"))) {
    throw Object.assign(new Error("Only the CISO can decide a scope-adjustment proposal. Switch role to decide."), { name: "UnauthorisedRulingError" });
  }
}

/** CISO decision: approve | deny | counter. Approve applies the proposed scope
 *  to the rule's implemented scope; original is preserved on the proposal. There
 *  is NO path here to disable the rule. */
export async function decideScopeAdjustment(proposalId: string, decision: "approve" | "deny" | "counter", counterScope: string, actor: AuditActor) {
  await assertCiso(actor);
  const p = await db.scopeAdjustmentProposal.findUniqueOrThrow({ where: { id: proposalId }, include: { exception: true } });
  if (p.status !== "pending_ciso") throw Object.assign(new Error("This proposal has already been decided."), { name: "StateError" });
  if (decision === "counter" && !counterScope.trim()) throw Object.assign(new Error("Enter the counter-proposed scope."), { name: "ValidationError" });

  await audited(
    { actor, action: `rule.scope_adjustment_${decision}`, targetType: "ScopeAdjustmentProposal", targetId: proposalId, eventDescription: `CISO ${decision === "approve" ? "approved" : decision === "deny" ? "denied" : "counter-proposed"} a scope adjustment`, payload: { decision } },
    async (tx: TxClient) => {
      if (decision === "approve") {
        await tx.protectionRuleScope.upsert({ where: { ruleId: p.exception.ruleId }, update: { systemsJson: p.proposedScope, updatedBy: actor.label }, create: { ruleId: p.exception.ruleId, systemsJson: p.proposedScope, updatedBy: actor.label } });
        await tx.protectionRuleException.update({ where: { id: p.exceptionId }, data: { resolution: "scope_adjusted", status: "approved", approvedBy: actor.label } });
        await tx.scopeAdjustmentProposal.update({ where: { id: proposalId }, data: { status: "approved", decidedBy: actor.label, decidedAt: new Date() } });
      } else if (decision === "deny") {
        await tx.protectionRuleException.update({ where: { id: p.exceptionId }, data: { resolution: "denied" } });
        await tx.scopeAdjustmentProposal.update({ where: { id: proposalId }, data: { status: "denied", decidedBy: actor.label, decidedAt: new Date() } });
      } else {
        await tx.scopeAdjustmentProposal.update({ where: { id: proposalId }, data: { status: "counter_proposed", cisoCounterScope: counterScope.trim(), decidedBy: actor.label, decidedAt: new Date() } });
      }
    },
  );
}

/** Admin accepts the CISO's counter-proposal — applies it as the new scope. */
export async function acceptCounterProposal(proposalId: string, actor: AuditActor) {
  const p = await db.scopeAdjustmentProposal.findUniqueOrThrow({ where: { id: proposalId }, include: { exception: true } });
  if (p.status !== "counter_proposed" || !p.cisoCounterScope) throw Object.assign(new Error("No counter-proposal to accept."), { name: "StateError" });
  await audited(
    { actor, action: "rule.counter_accepted", targetType: "ScopeAdjustmentProposal", targetId: proposalId, eventDescription: "Accepted the CISO counter-proposed scope", payload: {} },
    async (tx: TxClient) => {
      await tx.protectionRuleScope.upsert({ where: { ruleId: p.exception.ruleId }, update: { systemsJson: p.cisoCounterScope!, updatedBy: actor.label }, create: { ruleId: p.exception.ruleId, systemsJson: p.cisoCounterScope!, updatedBy: actor.label } });
      await tx.protectionRuleException.update({ where: { id: p.exceptionId }, data: { resolution: "scope_adjusted", status: "approved", approvedBy: actor.label } });
      await tx.scopeAdjustmentProposal.update({ where: { id: proposalId }, data: { status: "approved", proposedScope: p.cisoCounterScope!, decidedBy: actor.label, decidedAt: new Date() } });
    },
  );
}

// ---- Screen 4: risk-analytics source connection ---------------------------

export async function connectRiskSource(sourceId: string, metrics: string[], actor: AuditActor) {
  const src = await db.discoverySource.findUniqueOrThrow({ where: { id: sourceId } });
  return audited(
    { actor, action: "risk.source_connected", targetType: "RiskAnalyticsSource", targetId: sourceId, eventDescription: `Connected ${src.name} into risk analytics`, payload: { metrics } },
    (tx: TxClient) => tx.riskAnalyticsSource.create({ data: { sourceId, name: src.name, kind: src.kind, defaultMetricsJson: JSON.stringify(metrics.length ? metrics : suggestMetrics(src.kind)), connectedBy: actor.label } }),
  );
}

// ---- Screen 5: acquisition entity setup ------------------------------------

/** Create an acquired entity and bulk-import its user structure. Rows that fail
 *  to parse fall back to manual entry — the entity records a partial_import. */
export async function createAcquiredEntity(name: string, rawUsers: string, actor: AuditActor) {
  if (!name.trim()) throw Object.assign(new Error("Name the entity."), { name: "ValidationError" });
  const lines = rawUsers.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  const valid = lines.filter((l) => /^[A-Za-z][A-Za-z .'-]{1,60}$/.test(l));
  const failed = lines.filter((l) => !valid.includes(l));
  const importStatus = lines.length === 0 ? "manual" : failed.length > 0 ? "partial_import" : "bulk_imported";

  const entity = await audited(
    { actor, action: "entity.acquired_created", targetType: "Entity", targetId: name.trim(), eventDescription: `Created acquired entity ${name.trim()} (${importStatus}, ${valid.length} users imported)`, payload: { importStatus, imported: valid.length, failed: failed.length } },
    async (tx: TxClient) => {
      const e = await tx.entity.create({ data: { name: name.trim(), kind: "legal_entity", source: "acquired", importStatus, sdfStatus: "not_assessed" } });
      for (const u of valid) await tx.entityUserMapping.create({ data: { userName: u, entityId: e.id, accessScope: "single", validatedNoDualScope: true } });
      return e;
    },
  );
  return { entityId: entity.id, imported: valid.length, failed };
}

// ---- Screen 6: bulk user→entity mapping with dual-scope validation ---------

/** Bulk-map users to an entity. A user with active role assignments under a
 *  DIFFERENT entity is EXCLUDED from the silent bulk action and flagged for
 *  individual review (validated_no_dual_scope = false), never silently mapped. */
export async function bulkMapUsersToEntity(entityId: string, userNames: string[], actor: AuditActor) {
  if (userNames.length === 0) throw Object.assign(new Error("Select at least one user."), { name: "ValidationError" });
  const clean: string[] = [];
  const flagged: { userName: string; conflictEntity: string }[] = [];

  for (const u of userNames) {
    const conflict = await db.roleAssignment.findFirst({ where: { userName: u, status: "active", entityId: { not: null, notIn: [entityId] } }, include: { entity: { select: { name: true } } } });
    const existingMap = await db.entityUserMapping.findFirst({ where: { userName: u, entityId: { not: entityId } } });
    if (conflict) flagged.push({ userName: u, conflictEntity: conflict.entity?.name ?? "another entity" });
    else if (existingMap) flagged.push({ userName: u, conflictEntity: "another entity (existing mapping)" });
    else clean.push(u);
  }

  await audited(
    { actor, action: "entity.bulk_mapped", targetType: "Entity", targetId: entityId, eventDescription: `Bulk-mapped ${clean.length} user(s); ${flagged.length} flagged for individual review`, payload: { mapped: clean.length, flagged: flagged.length } },
    async (tx: TxClient) => {
      for (const u of clean) {
        const existing = await tx.entityUserMapping.findFirst({ where: { userName: u, entityId } });
        if (existing) await tx.entityUserMapping.update({ where: { id: existing.id }, data: { validatedNoDualScope: true } });
        else await tx.entityUserMapping.create({ data: { userName: u, entityId, accessScope: "single", validatedNoDualScope: true } });
      }
      // Record the flagged users as unmapped-with-conflict markers.
      for (const f of flagged) {
        const existing = await tx.entityUserMapping.findFirst({ where: { userName: f.userName, entityId } });
        if (!existing) await tx.entityUserMapping.create({ data: { userName: f.userName, entityId, accessScope: "single", validatedNoDualScope: false, justification: `Excluded from bulk mapping — active scope under ${f.conflictEntity}; needs individual review.` } });
      }
    },
  );
  return { mapped: clean.length, flagged };
}
