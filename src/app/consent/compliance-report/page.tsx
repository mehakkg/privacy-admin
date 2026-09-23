import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { ComplianceReport, type ReportRow } from "@/components/consentInfra/ComplianceReport";
import { EIGHTH_SCHEDULE_LANGUAGES } from "@/lib/dpdp/statute";

export const dynamic = "force-dynamic";

/** SCREEN 8 — Monthly compliance report export, compiling scan results,
 *  categorisation actions, and geo/language verification status. */
export default async function ComplianceReportPage() {
  const notice = await db.notice.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  const [findings, cats, variants, policyVersions, schedule] = await Promise.all([
    db.cookieScanFinding.findMany({ select: { status: true, disclosed: true, firedBeforeConsent: true, triggerSource: true } }),
    db.cookieCategory.findMany({ select: { status: true, custom: true } }),
    notice ? db.noticeVariant.findMany({ where: { noticeId: notice.id }, select: { language: true, publishStatus: true } }) : Promise.resolve([]),
    db.cookiePolicyVersion.findMany({ orderBy: { publishedAt: "desc" }, take: 5 }),
    db.cookieScanSchedule.findUnique({ where: { id: "cookie" } }),
  ]);

  const flagged = findings.filter((f) => !f.disclosed || f.firedBeforeConsent || f.status === "blocked");
  const categorised = findings.filter((f) => f.status === "categorised").length;
  const blocked = findings.filter((f) => f.status === "blocked").length;
  const scheduled = findings.filter((f) => f.triggerSource === "scheduled").length;
  const availLangs = variants.length;
  const pendingCats = cats.filter((c) => c.status === "pending_dpo_approval").length;

  const month = new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });

  const rows: ReportRow[] = [
    { section: "Scan coverage", metric: "Scan cadence", value: schedule?.cadence ?? "on_demand" },
    { section: "Scan coverage", metric: "Last scan", value: schedule?.lastRunAt ? schedule.lastRunAt.toISOString() : "—" },
    { section: "Scan coverage", metric: "Findings from scheduled scans", value: String(scheduled) },
    { section: "Script findings", metric: "Total findings", value: String(findings.length) },
    { section: "Script findings", metric: "Currently flagged", value: String(flagged.filter((f) => f.status !== "categorised").length) },
    { section: "Script findings", metric: "Auto-blocked", value: String(blocked) },
    { section: "Categorisation actions", metric: "Categorised this period", value: String(categorised) },
    { section: "Categorisation actions", metric: "Categories awaiting DPO approval", value: String(pendingCats) },
    { section: "Geo verification", metric: "Compliance models supported", value: "DPDP (India), GDPR (EU/EEA), baseline fallback" },
    { section: "Language verification", metric: "Managed language variants", value: `${availLangs} of ${EIGHTH_SCHEDULE_LANGUAGES.length}` },
    { section: "Policy changes", metric: "Cookie-policy versions published", value: String(policyVersions.length) },
    { section: "Policy changes", metric: "Latest version", value: policyVersions[0]?.version ?? "—" },
  ];

  const headline = [
    { label: "Currently flagged", value: flagged.filter((f) => f.status !== "categorised").length, tone: flagged.some((f) => f.status !== "categorised") ? ("red" as const) : ("green" as const) },
    { label: "Categorised", value: categorised },
    { label: "Language coverage", value: `${availLangs}/${EIGHTH_SCHEDULE_LANGUAGES.length}`, tone: availLangs >= EIGHTH_SCHEDULE_LANGUAGES.length ? ("green" as const) : ("yellow" as const) },
    { label: "Policy versions", value: policyVersions.length },
  ];

  return (
    <Shell active="/consent/compliance-report" title="Consent / Compliance report">
      <PageHead title="Monthly compliance report" titleTip="A ready compliance report compiling scan results, categorisation actions, and geo/language verification status — one structured export." />
      <ComplianceReport month={month} rows={rows} headline={headline} />
    </Shell>
  );
}
