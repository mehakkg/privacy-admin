import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { PageHead, Stat } from "@/components/ui";
import { ProtectionRulesTable, type RuleRow } from "@/components/protectionRules";
import { decodeList, decodeObject } from "@/lib/codec/json";

export const dynamic = "force-dynamic";

/**
 * SCREEN 2 — Protection Rules.
 *
 * The rule definition (name, category, type, strictness) is CISO-owned and
 * policy-locked. The only column Admin owns is Scope. There is deliberately no
 * "+ Add rule" button — the absence communicates the governance boundary. A
 * rule that does not exist yet is requested from CISO via an escalation.
 */
export default async function ProtectionRulesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const term = (params.q ?? "").trim().toLowerCase();

  const [rules, scopes, exceptions, systems, locations] = await Promise.all([
    db.protectionRule.findMany({ orderBy: { ruleName: "asc" } }),
    db.protectionRuleScope.findMany({ select: { ruleId: true, systemsJson: true, fieldsJson: true } }),
    db.protectionRuleException.findMany(),
    db.connectedSystem.findMany({ orderBy: { name: "asc" } }),
    db.dataLocation.findMany({ where: { systemId: { not: null } }, select: { systemId: true, dataCategoriesJson: true } }),
  ]);

  const scopeByRule = new Map(scopes.map((s) => [s.ruleId, decodeList(s.systemsJson)]));
  const fieldsByRule = new Map(scopes.map((s) => [s.ruleId, decodeObject<Record<string, string[]>>(s.fieldsJson) ?? {}]));

  // Per-system data categories, so configuring a scope onto a system that does
  // not hold the rule's data category can be flagged (not silently accepted).
  const systemCategories: Record<string, string[]> = {};
  for (const l of locations) {
    if (!l.systemId) continue;
    const set = new Set(systemCategories[l.systemId] ?? []);
    for (const c of decodeList(l.dataCategoriesJson)) set.add(c);
    systemCategories[l.systemId] = [...set];
  }

  let rows: RuleRow[] = rules.map((r) => {
    const scoped = scopeByRule.get(r.id) ?? [];
    const scopedFields = fieldsByRule.get(r.id) ?? {};
    const ruleExc = exceptions.filter((e) => e.ruleId === r.id);
    const activeExc = ruleExc.filter((e) => e.status === "approved");
    const pendingExc = ruleExc.filter((e) => e.status === "requested");
    const status = activeExc.length
      ? "exception_active"
      : scoped.length === 0
        ? "needs_scope"
        : "implemented";
    return {
      id: r.id,
      ruleName: r.ruleName || `${r.dataCategory} ${r.ruleType}`,
      dataCategory: r.dataCategory,
      ruleType: r.ruleType,
      strictness: r.strictness,
      definition: r.definition,
      setBy: r.approvedBy,
      scopedSystemIds: scoped,
      scopedFields,
      status,
      exceptions: activeExc.map((e) => ({ process: e.process, narrowedScope: e.narrowedScope })),
      pendingException: pendingExc.length > 0,
    };
  });

  if (params.type) rows = rows.filter((r) => r.ruleType === params.type);
  if (params.status) rows = rows.filter((r) => r.status === params.status);
  if (term) rows = rows.filter((r) => r.ruleName.toLowerCase().includes(term) || r.dataCategory.includes(term));

  const needsScope = rows.filter((r) => r.status === "needs_scope").length;

  return (
    <Shell active="/data-flow" title="Data Flow / Protection rules">
      <PageHead
        title="Protection rules"
        titleTip="Rule definitions are set by your CISO. You implement the technical scope — which systems and fields each rule applies to."
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Rules" value={rules.length} />
        <Stat label="Needs scope" value={needsScope} tone={needsScope ? "yellow" : undefined} />
        <Stat label="Active exceptions" value={exceptions.filter((e) => e.status === "approved").length} />
      </div>

      <CompactFilterBar
        basePath="/data-flow/protection-rules"
        searchPlaceholder="Search rule or category…"
        facets={[
          {
            key: "type",
            label: "Type",
            options: [
              { value: "mask", label: "Mask" },
              { value: "encrypt", label: "Encrypt" },
              { value: "dlp", label: "DLP" },
            ],
          },
          {
            key: "status",
            label: "Status",
            options: [
              { value: "implemented", label: "Implemented" },
              { value: "needs_scope", label: "Needs scope" },
              { value: "exception_active", label: "Exception active" },
            ],
          },
        ]}
      />

      <ProtectionRulesTable
        rows={rows}
        systems={systems.map((s) => ({ id: s.id, name: s.name }))}
        systemCategories={systemCategories}
      />
    </Shell>
  );
}
