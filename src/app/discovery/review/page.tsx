import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, Stat } from "@/components/ui";
import { ClassificationReview, type ReviewRow } from "@/components/classificationReview";

export const dynamic = "force-dynamic";

/**
 * SCREEN 5 — Classification Review & Override.
 *
 * List + detail rather than a page of stacked forms: browse compact, edit one
 * at a time. Drift, needs-review and high-confidence are a status column on a
 * single list instead of three separate accordions, so a reviewer sorts and
 * works one queue rather than deciding which section to open.
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const params = await searchParams;
  const where = params.source ? { sourceId: params.source } : {};

  const [fields, purposes, sources] = await Promise.all([
    db.classifiedField.findMany({
      where: { ...where, reviewState: "pending" },
      include: { source: true },
      // Drift first, then needs-review, then the bulk-approvable remainder:
      // the rows that need a human are the ones that should be reachable
      // without scrolling.
      orderBy: [{ driftFlag: "desc" }, { confidence: "asc" }, { fieldPath: "asc" }],
    }),
    db.purposeTag.findMany({ where: { status: "approved" }, orderBy: { name: "asc" } }),
    db.discoverySource.findMany({ orderBy: { name: "asc" } }),
  ]);

  const rows: ReviewRow[] = fields.map((f) => ({
    id: f.id,
    fieldPath: f.fieldPath,
    sourceName: f.source.name,
    detectedType: f.detectedType,
    maskedSample: f.maskedSample,
    previousType: f.previousType,
    purposeTagId: f.purposeTagId,
    confidence: f.confidence,
    reviewState: f.reviewState,
    driftFlag: f.driftFlag,
  }));

  const drifted = rows.filter((r) => r.driftFlag).length;
  const needsReview = rows.filter((r) => !r.driftFlag && r.confidence === "needs_review").length;
  const high = rows.filter((r) => !r.driftFlag && r.confidence === "high").length;

  return (
    <Shell active="/discovery" title="Discovery / Classification">
      <PageHead
        crumbs={[{ label: "Data Discovery", href: "/discovery" }, { label: "Classification" }]}
        title="Classification review"
        titleTip="Confirm what the scanner found. High-confidence detections can be approved in bulk from the list; anything uncertain is reviewed one at a time with a recorded reason."
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Drifted" value={drifted} tone={drifted ? "red" : undefined} />
        <Stat label="Needs review" value={needsReview} tone={needsReview ? "yellow" : undefined} />
        <Stat label="High confidence" value={high} />
      </div>

      <div className="row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        <span className="section-label" style={{ margin: 0 }}>
          Source
        </span>
        <Link
          href="/discovery/review"
          className={`btn sm ${!params.source ? "primary" : "ghost"}`}
        >
          All
        </Link>
        {sources.map((s) => (
          <Link
            key={s.id}
            href={`/discovery/review?source=${s.id}`}
            className={`btn sm ${params.source === s.id ? "primary" : "ghost"}`}
          >
            {s.name}
          </Link>
        ))}
      </div>

      <ClassificationReview
        rows={rows}
        purposes={purposes.map((p) => ({ id: p.id, name: p.name }))}
      />
    </Shell>
  );
}
