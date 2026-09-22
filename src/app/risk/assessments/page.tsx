import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, Stat, Pill, type PillTone, Notice, formatDate } from "@/components/ui";

export const dynamic = "force-dynamic";

const VENDOR_TONE: Record<string, PillTone> = { not_started: "gray", in_progress: "yellow", submitted: "blue" };
const VENDOR_LABEL: Record<string, string> = { not_started: "Not started", in_progress: "In progress", submitted: "Submitted" };
const REVIEW_TONE: Record<string, PillTone> = { pending: "gray", partial: "yellow", verified: "green" };
const REVIEW_LABEL: Record<string, string> = { pending: "Pending", partial: "Partial", verified: "Verified" };
const RISK_TONE: Record<string, PillTone> = { low: "gray", medium: "yellow", high: "red", critical: "red" };

/**
 * SCREEN — Assessments (Risk & Compliance): the Admin-side rollup of vendor /
 * processor risk assessments — outstanding responses, Legal's review backlog,
 * and the high-risk classifications, with a link into the full Vendor Risk
 * lifecycle. DPIA is deliberately excluded: it is a DPO-exclusive Governance
 * Portal function, not an Admin surface.
 */
export default async function RiskAssessmentsPage() {
  const now = Date.now();
  const assessments = await db.vendorAssessment.findMany({ include: { vendor: true }, orderBy: { assignedAt: "desc" } });

  const outstanding = assessments.filter((a) => a.vendorStatus !== "submitted");
  const awaitingLegal = assessments.filter((a) => a.vendorStatus === "submitted" && a.legalReviewStatus !== "verified");
  // Effective risk = the verified classification if there is one, else the
  // system baseline — so the count matches the "high"/"critical" rows shown.
  const highRisk = assessments.filter((a) => {
    const r = a.classification ?? a.baselineRating;
    return r === "high" || r === "critical";
  });

  return (
    <Shell active="/risk/assessments" title="Risk & Compliance / Assessments">
      <PageHead
        title="Assessments"
        titleTip="The Admin-side rollup of vendor and processor risk assessments — outstanding responses, Legal's review backlog and high-risk classifications. DPIA is excluded: it is a DPO-exclusive Governance Portal function."
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Total assessments" value={assessments.length} />
        <Stat label="Outstanding responses" value={outstanding.length} tone={outstanding.length ? "yellow" : undefined} />
        <Stat label="Awaiting Legal review" value={awaitingLegal.length} tone={awaitingLegal.length ? "yellow" : undefined} />
        <Stat label="High / critical risk" value={highRisk.length} tone={highRisk.length ? "red" : undefined} />
      </div>

      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr><th>Vendor</th><th>Template</th><th>Vendor status</th><th>Legal review</th><th>Classification</th><th>Assigned</th></tr>
          </thead>
          <tbody>
            {assessments.map((a) => {
              const ageDays = Math.floor((now - a.assignedAt.getTime()) / 86_400_000);
              const cls = a.classification ?? a.baselineRating;
              return (
                <tr key={a.id}>
                  <td>
                    <Link href="/vendor-risk/assessments" className="row-link">{a.vendor?.name ?? "—"}</Link>
                    <div className="cell-sub">{a.vendor?.category ?? ""}</div>
                  </td>
                  <td><span className="cell-sub">{a.templateName}</span></td>
                  <td>
                    <div className="cell-stack">
                      <Pill tone={VENDOR_TONE[a.vendorStatus] ?? "gray"} dot={false}>{VENDOR_LABEL[a.vendorStatus] ?? a.vendorStatus}</Pill>
                      {a.vendorStatus !== "submitted" && <span className="cell-sub">{ageDays}d outstanding</span>}
                    </div>
                  </td>
                  <td><Pill tone={REVIEW_TONE[a.legalReviewStatus] ?? "gray"} dot={false}>{REVIEW_LABEL[a.legalReviewStatus] ?? a.legalReviewStatus}</Pill></td>
                  <td>
                    <Pill tone={RISK_TONE[cls] ?? "gray"} dot={false}>{cls}</Pill>
                    {!a.classification && <span className="cell-sub"> (baseline)</span>}
                  </td>
                  <td><span className="cell-sub">{formatDate(a.assignedAt)}</span></td>
                </tr>
              );
            })}
            {assessments.length === 0 && <tr><td colSpan={6}><div className="empty">No assessments assigned yet.</div></td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16 }}>
        <Notice tone="info" title="Where the full lifecycle lives">
          This is a risk-oriented rollup. To assign questionnaires, review vendor responses and record Legal&apos;s final classification, use <Link href="/vendor-risk/assessments">Vendor Risk → Assessments</Link>. DPIA sits with the DPO in the Governance Portal and is not an Admin function.
        </Notice>
      </div>
    </Shell>
  );
}
