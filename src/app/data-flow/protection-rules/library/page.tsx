import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { RuleLibrary, type TemplateCard, type PendingRule } from "@/components/datamap/RuleLibrary";
import { getCurrentRole } from "@/lib/session";

export const dynamic = "force-dynamic";

/** PROTECTION RULE LIBRARY — the template layer that sits before rule
 *  implementation. Three tiers (Baseline PII, DPDP-Specific, Custom) all route
 *  through the same CISO propose→approve flow. */
export default async function RuleLibraryPage() {
  const [templates, pending, role] = await Promise.all([
    db.protectionRuleTemplate.findMany({ orderBy: [{ tier: "asc" }, { sortOrder: "asc" }] }),
    db.protectionRule.findMany({ where: { status: "pending_ciso_approval" }, orderBy: { proposedAt: "desc" } }),
    getCurrentRole(),
  ]);

  const t: TemplateCard[] = templates.map((x) => ({
    id: x.id, tier: x.tier, name: x.name, piiCategory: x.piiCategory, defaultMethod: x.defaultMethod,
    suggestedScope: x.suggestedScope, strictness: x.strictness, definition: x.definition, statutoryCitation: x.statutoryCitation,
  }));
  const p: PendingRule[] = pending.map((r) => ({
    id: r.id, ruleName: r.ruleName, dataCategory: r.dataCategory, ruleType: r.ruleType, strictness: r.strictness,
    definition: r.definition, tier: r.tier, statutoryCitation: r.statutoryCitation, proposedBy: r.proposedBy, fromTemplate: r.sourceTemplateId != null,
  }));

  return (
    <Shell active="/data-flow/protection-rules" title="Protection rules / Library">
      <PageHead
        crumbs={[{ label: "Protection rules", href: "/data-flow/protection-rules" }, { label: "Rule library" }]}
        title="Protection rule library"
        titleTip="Start a new protection rule from a Baseline PII or DPDP-Specific template, or compose a custom one. A template pre-fills the definition; the CISO still reviews and approves."
        actions={<Link href="/data-flow/protection-rules" className="btn sm">Implementation screen →</Link>}
      />
      <RuleLibrary templates={t} pending={p} role={role} />
    </Shell>
  );
}
