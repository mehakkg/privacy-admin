import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { RuleLibrary, type TemplateCard, type PendingRule } from "@/components/datamap/RuleLibrary";
import { getCurrentRole } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * RULE LIBRARY — the single library for the Data Protection section, merging the
 * masking and protection-rule libraries. A Control type filter (Masking,
 * Tokenization, Encryption, Flow rules) replaces the second library; the legacy
 * /masking/rules route redirects here with ?type=masking.
 */
const CONTROL_TYPES = [
  { key: "", label: "All controls" },
  { key: "masking", label: "Masking", methods: ["masking"] },
  { key: "tokenization", label: "Tokenization", methods: ["tokenization"] },
  { key: "encryption", label: "Encryption", methods: ["encryption"] },
  { key: "flow", label: "Flow rules", methods: ["dlp"] },
] as const;

export default async function RuleLibraryPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const active = CONTROL_TYPES.find((c) => c.key === type) ?? CONTROL_TYPES[0];

  const [templates, pending, role] = await Promise.all([
    db.protectionRuleTemplate.findMany({ orderBy: [{ tier: "asc" }, { sortOrder: "asc" }] }),
    db.protectionRule.findMany({ where: { status: "pending_ciso_approval" }, orderBy: { proposedAt: "desc" } }),
    getCurrentRole(),
  ]);

  const methods = "methods" in active ? active.methods : null;
  const filtered = methods ? templates.filter((x) => (methods as readonly string[]).includes(x.defaultMethod)) : templates;

  const t: TemplateCard[] = filtered.map((x) => ({
    id: x.id, tier: x.tier, name: x.name, piiCategory: x.piiCategory, defaultMethod: x.defaultMethod,
    suggestedScope: x.suggestedScope, strictness: x.strictness, definition: x.definition, statutoryCitation: x.statutoryCitation,
  }));
  const p: PendingRule[] = pending.map((r) => ({
    id: r.id, ruleName: r.ruleName, dataCategory: r.dataCategory, ruleType: r.ruleType, strictness: r.strictness,
    definition: r.definition, tier: r.tier, statutoryCitation: r.statutoryCitation, proposedBy: r.proposedBy, fromTemplate: r.sourceTemplateId != null,
  }));

  return (
    <Shell active="/data-flow/protection-rules/library" title="Rule library">
      <PageHead
        crumbs={[{ label: "Data Protection" }, { label: "Rule library" }]}
        title="Rule library"
        titleTip="One library for every Rule 6(1)(a) safeguard — masking, tokenization, encryption and flow rules. Start a rule from a template; a template pre-fills the definition and the CISO still reviews and approves."
      />

      <div className="row" style={{ gap: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <span className="cell-sub" style={{ marginRight: 4 }}>Control type</span>
        {CONTROL_TYPES.map((c) => (
          <Link
            key={c.key || "all"}
            href={c.key ? `/data-flow/protection-rules/library?type=${c.key}` : "/data-flow/protection-rules/library"}
            className={`filter-chip${active.key === c.key ? " on" : ""}`}
          >
            {c.label}
          </Link>
        ))}
      </div>

      <RuleLibrary templates={t} pending={p} role={role} />
    </Shell>
  );
}
