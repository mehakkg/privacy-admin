import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, formatDateTime } from "@/components/ui";
import { decodeList, decodeObject } from "@/lib/codec/json";
import { getCurrentRole } from "@/lib/session";
import { ruleLabel, type RulePatch, type Rule } from "@/lib/masking";
import { EnforcementNotice } from "@/components/masking/EnforcementNotice";
import { ByFieldTab, type ByFieldSP } from "@/components/masking/ByFieldTab";
import { FieldDrawer } from "@/components/masking/FieldDrawer";
import { AddFieldDrawer } from "@/components/masking/AddFieldDrawer";
import { ByRuleGroups } from "@/components/masking/ByRuleGroups";
import { PendingChangesList, type PendingItem } from "@/components/masking/PendingChangesList";
import { RuleLibrary, type TemplateCard, type PendingRule } from "@/components/datamap/RuleLibrary";
import { ProtectionRulesTable, type RuleRow } from "@/components/protectionRules";
import { ScopeAdjustmentWorkspace, type ExceptionView, type Proposal } from "@/components/risk/ScopeAdjustmentWorkspace";
import {
  resolveField, getPendingChange, fieldHistory, associatedRegionalTemplates,
  getRuleGroups, listFieldCodes,
} from "@/lib/engines/masking";

export const dynamic = "force-dynamic";

const BASE = "/data-flow/protection-rules";
const TABS = [
  { key: "by-field", label: "By field" },
  { key: "by-rule", label: "By rule" },
  { key: "library", label: "Library" },
  { key: "pending", label: "Pending changes" },
] as const;

type SP = ByFieldSP & { type?: string };

/**
 * PROTECTION RULES — one page for the Rule 6(1)(a) safeguards, replacing the four
 * former Data Protection items. Four tabs: By field (the resolver-backed field
 * inventory), By rule (RuleGroups that apply one rule to many fields atomically),
 * Library (templates), and Pending changes (DPO approvals + scope adjustments).
 */
export default async function ProtectionRulesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tab = (TABS as readonly { key: string }[]).some((t) => t.key === sp.tab) ? sp.tab! : "by-field";
  const role = await getCurrentRole();

  const tabHref = (key: string) => `${BASE}?tab=${key}`;

  return (
    <Shell active="/data-flow/protection-rules" title="Protection rules">
      <PageHead title="Protection rules" subtitle="Every field, its effective rule, and the safeguards applied across your data — masking, and (when added) tokenization and encryption." />
      <EnforcementNotice />

      <nav className="stepper" style={{ margin: "14px 0" }} role="tablist">
        {TABS.map((t) => (
          <Link key={t.key} href={tabHref(t.key)} role="tab" aria-selected={t.key === tab} className={`step${t.key === tab ? " active" : ""}`}>
            <span className="step-label">{t.label}</span>
          </Link>
        ))}
      </nav>

      {tab === "by-field" && <ByFieldTabPanel sp={sp} role={role} />}
      {tab === "by-rule" && <ByRuleTabPanel />}
      {tab === "library" && <LibraryTabPanel type={sp.type} />}
      {tab === "pending" && <PendingTabPanel role={role} />}
    </Shell>
  );
}

// --- By field ---------------------------------------------------------------

async function ByFieldTabPanel({ sp, role }: { sp: SP; role: string }) {
  const drawerCode = sp.field?.toUpperCase();
  const [res, regional] = await Promise.all([
    drawerCode ? resolveField(drawerCode) : Promise.resolve(null),
    sp.add ? associatedRegionalTemplates() : Promise.resolve([]),
  ]);
  const pendingRaw = res ? await getPendingChange(res.code) : null;
  const pending = pendingRaw ? { ...pendingRaw, proposedAt: formatDateTime(pendingRaw.proposedAt) } : null;
  const historyRows = res ? await fieldHistory(res.code) : [];
  const floor: Rule | null = res && res.chain.length > 1 ? { family: res.chain[1].family, params: res.chain[1].params } : null;
  const floorName = res && res.chain.length > 1 ? `${res.chain[1].layer === "regional" ? `${res.chain[1].source} template` : "Baseline"} floor` : null;

  const closeParams = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v && k !== "field" && k !== "add" && k !== "created") closeParams.set(k, String(v));
  if (!closeParams.get("tab")) closeParams.set("tab", "by-field");
  const closeHref = `${BASE}?${closeParams.toString()}`;

  return (
    <>
      <ByFieldTab sp={sp} />
      {res && <FieldDrawer res={res} pending={pending} history={historyRows.map((h) => ({ seq: h.seq, action: h.action, actor: h.actorLabel, at: formatDateTime(h.timestamp) }))} role={role} closeHref={closeHref} floor={floor} floorName={floorName} />}
      {sp.add && <AddFieldDrawer closeHref={closeHref} regionalNames={regional.map((t) => t.name)} />}
    </>
  );
}

// --- By rule ----------------------------------------------------------------

async function ByRuleTabPanel() {
  const [groups, fields] = await Promise.all([getRuleGroups(), listFieldCodes()]);

  // Preserve the CISO-governed protection rules (Scenario 6) below the groups.
  const [rules, scopes, exceptions, systems, locations] = await Promise.all([
    db.protectionRule.findMany({ where: { status: "approved" }, orderBy: { ruleName: "asc" } }),
    db.protectionRuleScope.findMany({ select: { ruleId: true, systemsJson: true, fieldsJson: true } }),
    db.protectionRuleException.findMany(),
    db.connectedSystem.findMany({ orderBy: { name: "asc" } }),
    db.dataLocation.findMany({ where: { systemId: { not: null } }, select: { systemId: true, dataCategoriesJson: true } }),
  ]);
  const scopeByRule = new Map(scopes.map((s) => [s.ruleId, decodeList(s.systemsJson)]));
  const fieldsByRule = new Map(scopes.map((s) => [s.ruleId, decodeObject<Record<string, string[]>>(s.fieldsJson) ?? {}]));
  const systemCategories: Record<string, string[]> = {};
  for (const l of locations) {
    if (!l.systemId) continue;
    const set = new Set(systemCategories[l.systemId] ?? []);
    for (const c of decodeList(l.dataCategoriesJson)) set.add(c);
    systemCategories[l.systemId] = [...set];
  }
  const rows: RuleRow[] = rules.map((r) => {
    const scoped = scopeByRule.get(r.id) ?? [];
    const ruleExc = exceptions.filter((e) => e.ruleId === r.id);
    const activeExc = ruleExc.filter((e) => e.status === "approved");
    const status = activeExc.length ? "exception_active" : scoped.length === 0 ? "needs_scope" : "implemented";
    return {
      id: r.id, ruleName: r.ruleName || `${r.dataCategory} ${r.ruleType}`, dataCategory: r.dataCategory, ruleType: r.ruleType,
      strictness: r.strictness, definition: r.definition, setBy: r.approvedBy, scopedSystemIds: scoped,
      scopedFields: fieldsByRule.get(r.id) ?? {}, status,
      exceptions: activeExc.map((e) => ({ process: e.process, narrowedScope: e.narrowedScope })),
      pendingException: ruleExc.some((e) => e.status === "requested"),
    };
  });

  return (
    <div className="stack" style={{ gap: 24 }}>
      <ByRuleGroups groups={groups} fields={fields} />
      <div>
        <h2 className="card-title" style={{ marginBottom: 6 }}>CISO-governed protection rules</h2>
        <p className="cell-sub" style={{ margin: "0 0 12px" }}>Rule definitions are set by your CISO; you implement the technical scope. Method filter shows only methods with rules.</p>
        <ProtectionRulesTable rows={rows} systems={systems.map((s) => ({ id: s.id, name: s.name }))} systemCategories={systemCategories} />
      </div>
    </div>
  );
}

// --- Library ----------------------------------------------------------------

const CONTROL_TYPES = [
  { key: "", label: "All controls" },
  { key: "masking", label: "Masking", methods: ["masking"] },
  { key: "tokenization", label: "Tokenization", methods: ["tokenization"] },
  { key: "encryption", label: "Encryption", methods: ["encryption"] },
  { key: "flow", label: "Flow rules", methods: ["dlp"] },
] as const;

async function LibraryTabPanel({ type }: { type?: string }) {
  const active = CONTROL_TYPES.find((c) => c.key === type) ?? CONTROL_TYPES[0];
  const [templates, pending, role] = await Promise.all([
    db.protectionRuleTemplate.findMany({ orderBy: [{ tier: "asc" }, { sortOrder: "asc" }] }),
    db.protectionRule.findMany({ where: { status: "pending_ciso_approval" }, orderBy: { proposedAt: "desc" } }),
    getCurrentRole(),
  ]);
  const methods = "methods" in active ? (active.methods as readonly string[]) : null;
  const filtered = methods ? templates.filter((x) => methods.includes(x.defaultMethod)) : templates;
  const t: TemplateCard[] = filtered.map((x) => ({ id: x.id, tier: x.tier, name: x.name, piiCategory: x.piiCategory, defaultMethod: x.defaultMethod, suggestedScope: x.suggestedScope, strictness: x.strictness, definition: x.definition, statutoryCitation: x.statutoryCitation }));
  const p: PendingRule[] = pending.map((r) => ({ id: r.id, ruleName: r.ruleName, dataCategory: r.dataCategory, ruleType: r.ruleType, strictness: r.strictness, definition: r.definition, tier: r.tier, statutoryCitation: r.statutoryCitation, proposedBy: r.proposedBy, fromTemplate: r.sourceTemplateId != null }));

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span className="cell-sub" style={{ marginRight: 4 }}>Control type</span>
        {CONTROL_TYPES.map((c) => (
          <Link key={c.key || "all"} href={c.key ? `${BASE}?tab=library&type=${c.key}` : `${BASE}?tab=library`} className={`filter-chip${active.key === c.key ? " on" : ""}`}>{c.label}</Link>
        ))}
      </div>
      <p className="cell-sub" style={{ margin: 0 }}>Template items are live-associated, not copied. DPDP items are read-only to tenants; Baseline/regional changes are proposals routed to DPO approval.</p>
      <RuleLibrary templates={t} pending={p} role={role} />
    </div>
  );
}

// --- Pending changes --------------------------------------------------------

function patchLabel(patches: RulePatch[]): string {
  if (patches.length === 0) return "—";
  return patches.map((p) => `${p.channel ?? "default"}: ${ruleLabel(p as Rule)}`).join(", ");
}

async function PendingTabPanel({ role }: { role: string }) {
  const [crs, exceptions, rules, scopes, systems] = await Promise.all([
    db.maskingChangeRequest.findMany({ where: { status: "pending" }, orderBy: { proposedAt: "desc" } }),
    db.protectionRuleException.findMany({ include: { proposals: { orderBy: { createdAt: "desc" } } }, orderBy: { approvedAt: "desc" } }),
    db.protectionRule.findMany({ select: { id: true, ruleName: true, dataCategory: true } }),
    db.protectionRuleScope.findMany({ select: { ruleId: true, systemsJson: true } }),
    db.connectedSystem.findMany({ select: { id: true, name: true } }),
  ]);

  const items: PendingItem[] = crs.map((cr) => {
    const before = decodeObject<RulePatch[]>(cr.beforeJson) ?? [];
    const after = decodeObject<RulePatch[]>(cr.afterJson) ?? [];
    return {
      id: cr.id, fieldCode: cr.fieldCode, kind: cr.kind, proposedBy: cr.proposedBy,
      proposedAt: formatDateTime(cr.proposedAt), ageDays: Math.max(0, Math.floor((Date.now() - cr.proposedAt.getTime()) / 86400000)),
      before: cr.kind === "exception_add" ? "No exception" : patchLabel(before),
      after: cr.kind === "exception_add" ? `${after[0]?.params.role}: ${after[0]?.params.purpose}` : patchLabel(after),
      reason: cr.reason,
    };
  });

  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const scopeByRule = new Map(scopes.map((s) => [s.ruleId, s.systemsJson]));
  const systemNames: Record<string, string> = Object.fromEntries(systems.map((s) => [s.id, s.name]));
  const scopeRows: ExceptionView[] = exceptions.map((e) => ({
    id: e.id, ruleName: ruleById.get(e.ruleId)?.ruleName ?? "Rule", dataCategory: ruleById.get(e.ruleId)?.dataCategory ?? "—",
    process: e.process, blockingClause: e.blockingClause, currentScope: scopeByRule.get(e.ruleId) ?? e.narrowedScope ?? "all in-scope systems",
    investigatedAt: e.investigatedAt ? e.investigatedAt.toISOString() : null, resolution: e.resolution,
    proposals: e.proposals.map((p): Proposal => ({ id: p.id, originalScope: p.originalScope, proposedScope: p.proposedScope, status: p.status, cisoCounterScope: p.cisoCounterScope, proposedBy: p.proposedBy, decidedBy: p.decidedBy })),
  }));

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <h2 className="card-title" style={{ marginBottom: 8 }}>Masking rule proposals</h2>
        <PendingChangesList items={items} role={role} />
      </div>
      <div>
        <h2 className="card-title" style={{ marginBottom: 8 }}>Rule exceptions & scope adjustments</h2>
        <ScopeAdjustmentWorkspace exceptions={scopeRows} role={role as never} systemNames={systemNames} />
      </div>
    </div>
  );
}
