import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { Card, Chip, PageHead, Pill, formatDate, type PillTone } from "@/components/ui";
import { ReviewClassification } from "@/components/reviewClassification";
import { ASSESSMENT_QUESTIONS, ASSESSMENT_SECTIONS } from "@/lib/tprm";

export const dynamic = "force-dynamic";

const VENDOR_TONE: Record<string, PillTone> = { not_started: "gray", in_progress: "yellow", submitted: "blue" };

/** SCREEN 2.4 — Assessment Review & Classification (Legal-facing, full page). */
export default async function AssessmentReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await db.vendorAssessment.findUnique({ where: { id }, include: { vendor: true } });
  if (!a) notFound();

  const responses: Record<string, string> = (() => { try { return JSON.parse(a.responseJson || "{}"); } catch { return {}; } })();

  return (
    <Shell active="/vendor-risk/assessments" title={`Assessments / ${a.vendor.name}`}>
      <PageHead
        crumbs={[{ label: "Assessments", href: "/vendor-risk/assessments" }, { label: a.vendor.name }]}
        title={a.vendor.name}
        subtitle={
          <span className="row" style={{ gap: 8 }}>
            <Pill tone={VENDOR_TONE[a.vendorStatus]}>{a.vendorStatus.replace("_", " ")}</Pill>
            <Chip>{a.templateName}</Chip>
            <span className="cell-sub">assigned {formatDate(a.assignedAt)}</span>
          </span>
        }
        actions={<Link href={`/vendor-risk/assessments/${id}/respond`} className="btn ghost sm">Open vendor portal →</Link>}
      />

      <div className="grid-2">
        <Card title="Vendor's submitted answers">
          {a.vendorStatus !== "submitted" ? (
            <p className="cell-sub" style={{ margin: 0 }}>The vendor has not submitted yet ({a.vendorStatus.replace("_", " ")}).</p>
          ) : (
            <div className="stack" style={{ gap: 14 }}>
              {ASSESSMENT_SECTIONS.map((section) => (
                <div key={section}>
                  <div className="section-label" style={{ marginTop: 0 }}>{section}</div>
                  <div className="stack" style={{ gap: 8 }}>
                    {ASSESSMENT_QUESTIONS.filter((q) => q.section === section).map((q) => (
                      <div key={q.id}>
                        <div className="cell-sub">{q.label}</div>
                        <div className="cell-primary">{responses[q.id]?.trim() || "—"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <ReviewClassification
          assessmentId={id}
          baseline={a.baselineRating}
          classification={a.classification}
          reason={a.classificationReason}
          verified={a.legalReviewStatus === "verified"}
          vendorSubmitted={a.vendorStatus === "submitted"}
        />
      </div>
    </Shell>
  );
}
