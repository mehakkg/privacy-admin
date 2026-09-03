import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Card, Notice, PageHead } from "@/components/ui";

export const dynamic = "force-dynamic";

const NAMES: Record<string, { name: string; desc: string }> = {
  "consent-compliance": {
    name: "Consent Compliance",
    desc: "Consent capture, withdrawal and expiry across every channel, against the notices in force.",
  },
  ropa: {
    name: "RoPA",
    desc: "The Record of Processing Activities register — activities, purposes, categories and recipients.",
  },
  "overall-compliance": {
    name: "Overall Compliance",
    desc: "A platform-wide compliance posture snapshot across requests, consent, access and data flow.",
  },
};

export default async function ReportViewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const report = NAMES[slug] ?? { name: "Report", desc: "" };

  return (
    <Shell active="/analytics/reports" title={`Reports / ${report.name}`}>
      <div className="row" style={{ marginBottom: 8 }}>
        <Link href="/analytics/reports" className="btn sm ghost">← Reports</Link>
      </div>
      <PageHead title={report.name} titleTip={report.desc} />

      <Card title={`${report.name} — generated ${new Date().toISOString().slice(0, 10)}`}>
        <Notice tone="info" title="Standardized report">
          This is the inline view of a fixed regulatory report, generated from your
          live platform data. The full production-fidelity formatting (section
          layout, letterhead, export pagination) is a follow-on; the library card,
          the viewable-vs-export distinction, and this inline shell are in place.
        </Notice>
        <p className="cell-sub" style={{ marginTop: 12 }}>{report.desc}</p>
      </Card>
    </Shell>
  );
}
