import { db } from "@/lib/db";
import { getCurrentRole } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { TprmConfig, type RuleRow, type TemplateRow } from "@/components/tprmConfig";

export const dynamic = "force-dynamic";

/**
 * TPRM Configuration — the templates, question sets and baseline-risk rules that
 * were hardcoded in src/lib/tprm.ts, now editable, policy-locked to DPO/Legal.
 */
export default async function ConfigurationPage() {
  const [rules, templates, role] = await Promise.all([
    db.riskAppetiteRule.findMany({ orderBy: { sortOrder: "asc" } }),
    db.questionnaireTemplate.findMany({ include: { questions: { orderBy: { sortOrder: "asc" } } }, orderBy: { createdAt: "asc" } }),
    getCurrentRole(),
  ]);

  const ruleRows: RuleRow[] = rules.map((r) => ({ id: r.id, categoryPattern: r.categoryPattern, baselineRating: r.baselineRating }));
  const templateRows: TemplateRow[] = templates.map((t) => ({
    id: t.id, name: t.name, forTiers: t.forTiers.split(",").filter(Boolean), description: t.description, active: t.active,
    questions: t.questions.map((q) => ({ id: q.id, section: q.section, label: q.label })),
  }));

  return (
    <Shell active="/vendor-risk/configuration" title="Vendor Risk / Configuration">
      <PageHead
        title="Configuration"
        titleTip="Assessment templates, their questions, and the category → baseline-risk rules — previously hardcoded, now editable. Governance-owned: only DPO/Legal can change them."
      />
      <TprmConfig rules={ruleRows} templates={templateRows} canEdit={role === "dpo" || role === "legal"} />
    </Shell>
  );
}
