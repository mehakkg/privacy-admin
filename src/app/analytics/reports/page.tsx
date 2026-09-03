import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { ReportsLibrary, type ReportDef } from "@/components/reportsLibrary";

export const dynamic = "force-dynamic";

const REPORTS: ReportDef[] = [
  { slug: "consent-compliance", name: "Consent Compliance", desc: "Consent capture, withdrawal and expiry across every channel, against the notices in force.", mode: "view" },
  { slug: "ropa", name: "RoPA", desc: "The Record of Processing Activities register — activities, purposes, categories and recipients.", mode: "view" },
  { slug: "dpia", name: "DPIA", desc: "Data Protection Impact Assessments for high-risk processing, formatted for filing.", mode: "download" },
  { slug: "breach", name: "Breach", desc: "The personal data breach register and the Board intimations made under Rule 7.", mode: "download" },
  { slug: "overall-compliance", name: "Overall Compliance", desc: "A platform-wide compliance posture snapshot across requests, consent, access and data flow.", mode: "view" },
];

/**
 * SCREEN — Reports.
 *
 * A library of standardized regulatory deliverables, distinct from Evidence
 * Compiler (ad hoc packages built for a specific inquiry). Each report type is
 * either viewable inline or export-only, matching production's own grouping.
 */
export default function ReportsPage() {
  return (
    <Shell active="/analytics/reports" title="Analytics &amp; Reporting / Reports">
      <PageHead
        title="Reports"
        titleTip="Standardized regulatory reports, generated from your live platform data. Distinct from Evidence Compiler, which builds ad hoc packages for a specific inquiry."
      />
      <ReportsLibrary reports={REPORTS} />
    </Shell>
  );
}
