import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { Card, InfoTip, Notice, PageHead, Pill, Stat } from "@/components/ui";
import { BulkApproveButton, OverrideForm } from "@/components/discoveryActions";

export const dynamic = "force-dynamic";

const TYPES = [
  "PAN", "Aadhaar", "Email", "Phone", "Date of birth", "Currency",
  "Customer ID", "Free text", "Not personal data",
];

/**
 * SCREEN 5 — Classification Review & Override.
 *
 * Reuses the onboarding accordion split exactly: high confidence is
 * bulk-approvable, needs-review is row-by-row with a required reason.
 *
 * Drift gets its own section above both. A field that was classified one way
 * last scan and differently this one is a different problem from a field nobody
 * has looked at — the data was trusted, and now the basis for that trust has
 * changed. Burying it among first-time classifications loses that.
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const params = await searchParams;

  const where = params.source ? { sourceId: params.source } : {};

  const [drifted, high, needsReview, purposes, sources] = await Promise.all([
    db.classifiedField.findMany({
      where: { ...where, driftFlag: true },
      include: { source: true },
      orderBy: { fieldPath: "asc" },
    }),
    db.classifiedField.findMany({
      where: { ...where, confidence: "high", reviewState: "pending", driftFlag: false },
      include: { source: true },
      orderBy: { fieldPath: "asc" },
    }),
    db.classifiedField.findMany({
      where: { ...where, confidence: "needs_review", reviewState: "pending", driftFlag: false },
      include: { source: true },
      orderBy: { fieldPath: "asc" },
    }),
    db.purposeTag.findMany({ where: { status: "approved" }, orderBy: { name: "asc" } }),
    db.discoverySource.findMany({ orderBy: { name: "asc" } }),
  ]);

  const purposeOptions = purposes.map((p) => ({ id: p.id, name: p.name }));

  return (
    <Shell active="/discovery" title="Discovery / Classification">
      <PageHead
        crumbs={[{ label: "Data Discovery", href: "/discovery" }, { label: "Classification" }]}
        title="Classification review"
        titleTip="Confirm what the scanner found. High-confidence detections can be approved in bulk; anything uncertain is reviewed individually with a recorded reason."
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Drifted" value={drifted.length} tone={drifted.length ? "red" : undefined} />
        <Stat label="High confidence" value={high.length} />
        <Stat label="Needs review" value={needsReview.length} tone={needsReview.length ? "yellow" : undefined} />
      </div>

      <div className="row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        <span className="section-label" style={{ margin: 0 }}>Source</span>
        <Link href="/discovery/review" className={`btn sm ${!params.source ? "primary" : "ghost"}`}>
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

      <div className="stack">
      {drifted.length > 0 && (
        <Card
          title={
            <span className="row">
              Changed since the last scan ({drifted.length})
              <Pill tone="orange">Drift</Pill>
              <InfoTip
                align="left"
                text="These fields were already classified and approved. This scan read them differently. Because the data was previously trusted, a change here matters more than a first-time classification."
              />
            </span>
          }
        >
          <Notice tone="warn" title="Previously trusted, now reclassified">
            Confirm whether the field genuinely changed or the detector is wrong.
            Either answer is useful; leaving it unresolved is not.
          </Notice>
          <div style={{ marginTop: 12 }}>
            {drifted.map((f) => (
              <FieldRow key={f.id} field={f} purposes={purposeOptions} showPrevious />
            ))}
          </div>
        </Card>
      )}

      <Card
        title={`High confidence — bulk-approvable (${high.length})`}
        actions={<BulkApproveButton fieldIds={high.map((f) => f.id)} />}
      >
        {high.length === 0 ? (
          <div className="empty">Nothing awaiting bulk approval.</div>
        ) : (
          <div className="table-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Source</th>
                  <th>Detected as</th>
                  <th>Sample</th>
                </tr>
              </thead>
              <tbody>
                {high.map((f) => (
                  <tr key={f.id}>
                    <td className="mono cell-primary">{f.fieldPath}</td>
                    <td className="cell-sub">{f.source.name}</td>
                    <td>
                      <Pill tone="blue">{f.detectedType}</Pill>
                    </td>
                    <td className="mono cell-sub">{f.maskedSample}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Needs review (${needsReview.length})`}>
        {needsReview.length === 0 ? (
          <div className="empty">Nothing needs individual review.</div>
        ) : (
          needsReview.map((f) => (
            <FieldRow key={f.id} field={f} purposes={purposeOptions} />
          ))
        )}
      </Card>
      </div>
    </Shell>
  );
}

function FieldRow({
  field,
  purposes,
  showPrevious = false,
}: {
  field: {
    id: string;
    fieldPath: string;
    detectedType: string;
    maskedSample: string;
    previousType: string | null;
    purposeTagId: string | null;
    source: { name: string };
  };
  purposes: { id: string; name: string }[];
  showPrevious?: boolean;
}) {
  return (
    <div
      style={{
        borderTop: "1px solid var(--border-soft)",
        paddingTop: 12,
        marginTop: 12,
      }}
    >
      <div className="row" style={{ gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <span className="mono cell-primary">{field.fieldPath}</span>
        <span className="cell-sub">{field.source.name}</span>
        <Pill tone="blue">{field.detectedType}</Pill>
        {showPrevious && field.previousType && (
          <span className="cell-sub">
            was <strong>{field.previousType}</strong>
          </span>
        )}
        <span className="mono cell-sub">{field.maskedSample}</span>
      </div>
      <OverrideForm
        fieldId={field.id}
        currentType={field.detectedType}
        types={TYPES}
        purposes={purposes}
        purposeTagId={field.purposeTagId}
      />
    </div>
  );
}
