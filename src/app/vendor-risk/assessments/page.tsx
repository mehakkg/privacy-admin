import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { PageHead, Pill, Stat, formatDate, type PillTone } from "@/components/ui";

export const dynamic = "force-dynamic";

const VENDOR_TONE: Record<string, PillTone> = { not_started: "gray", in_progress: "yellow", submitted: "blue" };
const VENDOR_LABEL: Record<string, string> = { not_started: "Not started", in_progress: "In progress", submitted: "Submitted" };
const REVIEW_TONE: Record<string, PillTone> = { pending: "gray", partial: "yellow", verified: "green" };
const REVIEW_LABEL: Record<string, string> = { pending: "Pending", partial: "Partially complete", verified: "Fully verified" };
const RISK_TONE: Record<string, PillTone> = { low: "gray", medium: "yellow", high: "orange", critical: "red" };

/**
 * SCREEN 2.1 — Assessments Queue. The full risk-assessment lifecycle per vendor:
 * baseline → questionnaire → vendor response → Legal's final classification. An
 * unanswered questionnaire stays visible with an age indicator, never silently
 * forgotten.
 */
export default async function AssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ vendorStatus?: string; review?: string }>;
}) {
  const params = await searchParams;
  const now = Date.now();

  let assessments = await db.vendorAssessment.findMany({ include: { vendor: true }, orderBy: { assignedAt: "desc" } });
  if (params.vendorStatus) assessments = assessments.filter((a) => a.vendorStatus === params.vendorStatus);
  if (params.review) assessments = assessments.filter((a) => a.legalReviewStatus === params.review);

  const awaitingReview = assessments.filter((a) => a.legalReviewStatus === "partial").length;
  const outstanding = assessments.filter((a) => a.vendorStatus !== "submitted").length;

  return (
    <Shell active="/vendor-risk/assessments" title="Vendor Risk / Assessments">
      <PageHead
        title="Assessments"
        titleTip="Where a new vendor gets vetted before its register entry counts as 'reviewed'. Legal owns the final classification — the questionnaire and baseline only inform it."
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Assessments" value={assessments.length} />
        <Stat label="Awaiting Legal review" value={awaitingReview} tone={awaitingReview ? "yellow" : undefined} />
        <Stat label="Vendor response outstanding" value={outstanding} tone={outstanding ? "yellow" : undefined} />
      </div>

      <CompactFilterBar
        basePath="/vendor-risk/assessments"
        searchKey="q"
        searchPlaceholder="Search…"
        facets={[
          { key: "vendorStatus", label: "Vendor status", options: [
            { value: "not_started", label: "Not started" }, { value: "in_progress", label: "In progress" }, { value: "submitted", label: "Submitted" },
          ] },
          { key: "review", label: "Legal review", options: [
            { value: "pending", label: "Pending" }, { value: "partial", label: "Partially complete" }, { value: "verified", label: "Fully verified" },
          ] },
        ]}
        actions={<Link href="/vendor-risk/assessments/assign" className="btn primary sm">+ Assign questionnaire</Link>}
      />

      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr><th>Vendor</th><th>Template</th><th>Assigned</th><th>Vendor status</th><th>Legal review</th><th>Classification</th><th></th></tr>
          </thead>
          <tbody>
            {assessments.map((a) => {
              const ageDays = Math.floor((now - a.assignedAt.getTime()) / 86400000);
              const stale = a.vendorStatus !== "submitted" && ageDays > 14;
              return (
                <tr key={a.id}>
                  <td><Link href={`/vendor-risk/assessments/${a.id}`} className="row-link">{a.vendor.name}</Link></td>
                  <td className="cell-sub">{a.templateName}</td>
                  <td className="cell-sub">
                    {formatDate(a.assignedAt)}
                    {stale && <span className="cell-sub" style={{ color: "var(--yellow)" }}> · {ageDays}d, no response</span>}
                  </td>
                  <td><Pill tone={VENDOR_TONE[a.vendorStatus]}>{VENDOR_LABEL[a.vendorStatus]}</Pill></td>
                  <td><Pill tone={REVIEW_TONE[a.legalReviewStatus]}>{REVIEW_LABEL[a.legalReviewStatus]}</Pill></td>
                  <td>{a.classification ? <Pill tone={RISK_TONE[a.classification]}>{a.classification}</Pill> : <span className="muted">—</span>}</td>
                  <td><Link href={`/vendor-risk/assessments/${a.id}`} className="btn ghost xs">Open →</Link></td>
                </tr>
              );
            })}
            {assessments.length === 0 && (
              <tr><td colSpan={7}><div className="empty">
                <p style={{ margin: "0 0 12px" }}>No assessments yet.</p>
                <Link href="/vendor-risk/assessments/assign" className="btn primary sm">Assign a vendor questionnaire</Link>
              </div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
