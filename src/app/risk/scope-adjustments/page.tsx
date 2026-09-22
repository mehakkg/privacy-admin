import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { ScopeAdjustmentWorkspace, type ExceptionView, type Proposal } from "@/components/risk/ScopeAdjustmentWorkspace";
import { getCurrentRole } from "@/lib/session";

export const dynamic = "force-dynamic";

/** SCREENS 2–3 — Rule exception investigation + scope-adjustment proposal gated
 *  by CISO approval (approve / deny / counter-propose). */
export default async function ScopeAdjustmentsPage() {
  const [exceptions, rules, scopes, systems, role] = await Promise.all([
    db.protectionRuleException.findMany({ include: { proposals: { orderBy: { createdAt: "desc" } } }, orderBy: { approvedAt: "desc" } }),
    db.protectionRule.findMany({ select: { id: true, ruleName: true, dataCategory: true } }),
    db.protectionRuleScope.findMany({ select: { ruleId: true, systemsJson: true } }),
    db.connectedSystem.findMany({ select: { id: true, name: true } }),
    getCurrentRole(),
  ]);
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const scopeByRule = new Map(scopes.map((s) => [s.ruleId, s.systemsJson]));
  const systemNames: Record<string, string> = Object.fromEntries(systems.map((s) => [s.id, s.name]));

  const rows: ExceptionView[] = exceptions.map((e) => ({
    id: e.id,
    ruleName: ruleById.get(e.ruleId)?.ruleName ?? "Rule",
    dataCategory: ruleById.get(e.ruleId)?.dataCategory ?? "—",
    process: e.process,
    blockingClause: e.blockingClause,
    currentScope: scopeByRule.get(e.ruleId) ?? e.narrowedScope ?? "all in-scope systems",
    investigatedAt: e.investigatedAt ? e.investigatedAt.toISOString() : null,
    resolution: e.resolution,
    proposals: e.proposals.map((p): Proposal => ({ id: p.id, originalScope: p.originalScope, proposedScope: p.proposedScope, status: p.status, cisoCounterScope: p.cisoCounterScope, proposedBy: p.proposedBy, decidedBy: p.decidedBy })),
  }));

  return (
    <Shell active="/risk/scope-adjustments" title="Risk & Compliance / Scope adjustments">
      <PageHead title="Rule exceptions & scope adjustments" titleTip="Investigate why an approved protection rule blocks a legitimate process, then propose a narrower scope for CISO approval. Implementation never silently drifts from what CISO approved, and a rule is never disabled to resolve a conflict." />
      <ScopeAdjustmentWorkspace exceptions={rows} role={role} systemNames={systemNames} />
    </Shell>
  );
}
