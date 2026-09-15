import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { AssignWizard, type TemplateOpt } from "@/components/assignWizard";
import { ASSESSMENT_TEMPLATES, DEFAULT_RISK_RULES, type RiskRule } from "@/lib/tprm";

export const dynamic = "force-dynamic";

export default async function AssignPage() {
  const [vendors, dbTemplates, dbRules] = await Promise.all([
    db.vendor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, category: true, riskBaseline: true } }),
    db.questionnaireTemplate.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, forTiers: true, description: true } }),
    db.riskAppetiteRule.findMany({ orderBy: { sortOrder: "asc" }, select: { categoryPattern: true, baselineRating: true } }),
  ]);

  // Fall back to the built-in defaults if Configuration hasn't been seeded yet.
  const templates: TemplateOpt[] = dbTemplates.length
    ? dbTemplates.map((t) => ({ id: t.id, name: t.name, forTiers: t.forTiers.split(",").filter(Boolean), description: t.description }))
    : ASSESSMENT_TEMPLATES.map((t) => ({ id: t.id, name: t.name, forTiers: [...t.forTiers], description: t.description }));
  const rules: RiskRule[] = dbRules.length ? dbRules : DEFAULT_RISK_RULES;

  return (
    <Shell active="/vendor-risk/assessments" title="Vendor Risk / Assign questionnaire">
      <PageHead
        crumbs={[{ label: "Assessments", href: "/vendor-risk/assessments" }, { label: "Assign questionnaire" }]}
        title="Assign a vendor questionnaire"
        titleTip="Pick a vendor, confirm the system's baseline suggestion, choose a template scoped to that risk tier, and send. Templates and baseline rules come from Configuration."
      />
      <AssignWizard
        vendors={vendors.map((v) => ({ id: v.id, name: v.name, category: v.category, baseline: v.riskBaseline }))}
        templates={templates}
        rules={rules}
      />
    </Shell>
  );
}
