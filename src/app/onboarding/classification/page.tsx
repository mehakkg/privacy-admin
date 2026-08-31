import Link from "next/link";
import { db } from "@/lib/db";
import { Card, Notice, PageHead, Pill, Stat } from "@/components/ui";
import {
  BulkApproveButton,
  FieldReviewRow,
  StepFooter,
} from "@/components/onboardingForms";
import { DATA_CATEGORY_LABEL, type DataCategory } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * SCREEN 4 — Review Classification Output. ALWAYS requires explicit action.
 *
 * This screen never auto-advances, and never auto-skips — not even when the
 * "needs review" accordion is empty. The click is the point: it has to exist in
 * the audit trail as a real confirmation event, made by a named person at a
 * known time. An auto-advance would leave the classification of the entire data
 * estate unattributed.
 *
 * Sample values are masked. The review needs enough to judge the detected type,
 * not the actual personal data.
 */
export default async function ClassificationStep() {
  const fields = await db.classifiedField.findMany({
    include: { source: true },
    orderBy: [{ confidence: "asc" }, { fieldPath: "asc" }],
  });

  const high = fields.filter((f) => f.confidence === "high");
  const needsReview = fields.filter((f) => f.confidence === "needs_review");
  const highPending = high.filter((f) => f.reviewState === "pending");
  const reviewPending = needsReview.filter((f) => f.reviewState === "pending");
  const overridden = fields.filter((f) => f.reviewState === "overridden");
  const scoringFeedback = fields.filter((f) => f.highConfidenceOverride);

  const allSettled = fields.length > 0 && highPending.length === 0 && reviewPending.length === 0;

  if (fields.length === 0) {
    return (
      <div className="stack">
        <PageHead
          title="Review classification"
          subtitle="Confirm what the scan detected before it becomes the basis for every rights request."
        />
        <Card title="Nothing to review">
          <div className="empty">
            <p style={{ margin: "0 0 10px" }}>
              No scan results yet, so there is nothing classified to confirm.
            </p>
            <Link href="/onboarding/scan" className="btn primary sm">
              Go back and run a scan
            </Link>
          </div>
        </Card>
        <StepFooter
          step={4}
          nextHref="/onboarding/integrations"
          skippable={false}
          primaryLabel="Acknowledge — nothing to classify"
        />
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHead
        title="Review classification"
        subtitle="What the scan thinks each field is. This becomes the basis for scoping every rights request, so it needs a person's confirmation rather than a default."
        actions={<Pill tone="red">Explicit confirmation required</Pill>}
      />

      <div className="stat-row">
        <Stat label="Fields" value={fields.length} />
        <Stat label="High confidence" value={high.length} />
        <Stat
          label="Needs review"
          value={reviewPending.length}
          tone={reviewPending.length ? "yellow" : undefined}
        />
        <Stat label="Corrected" value={overridden.length} />
      </div>

      {scoringFeedback.length > 0 && (
        <Notice
          tone="info"
          title={`${scoringFeedback.length} high-confidence detection${scoringFeedback.length === 1 ? "" : "s"} corrected`}
        >
          These were logged separately from ordinary corrections. A wrong
          high-confidence call is evidence the detector is wrong about that
          pattern, not just about that row, so it is recorded as scoring feedback
          rather than filed with routine overrides.
        </Notice>
      )}

      <div className="accordion">
        <div className="accordion-head">
          <span>High confidence</span>
          <Pill tone={highPending.length ? "yellow" : "green"}>
            {highPending.length ? `${highPending.length} awaiting approval` : "All approved"}
          </Pill>
          <span style={{ marginLeft: "auto" }}>
            {highPending.length > 0 && <BulkApproveButton count={highPending.length} />}
          </span>
        </div>
        <div className="accordion-body">
          <table className="dtable">
            <thead>
              <tr>
                <th>Field</th>
                <th>Source</th>
                <th>Detected as</th>
                <th>Sample (masked)</th>
                <th>State</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {high.map((f) => (
                <tr key={f.id}>
                  <td className="mono">{f.fieldPath}</td>
                  <td className="cell-sub">{f.source.name}</td>
                  <td>
                    {DATA_CATEGORY_LABEL[f.detectedType as DataCategory] ?? f.detectedType}
                    {f.overriddenType && (
                      <div className="cell-sub" style={{ color: "var(--orange-600)" }}>
                        corrected to {f.overriddenType}
                      </div>
                    )}
                  </td>
                  <td className="mono cell-sub">{f.maskedSample}</td>
                  <td>
                    <Pill
                      tone={
                        f.reviewState === "approved"
                          ? "green"
                          : f.reviewState === "overridden"
                            ? "blue"
                            : "gray"
                      }
                    >
                      {f.reviewState === "pending" ? "Not confirmed" : f.reviewState}
                    </Pill>
                  </td>
                  <td>
                    {f.reviewState === "pending" && (
                      <FieldReviewRow
                        fieldId={f.id}
                        detectedType={f.detectedType}
                        highConfidence
                      />
                    )}
                    {f.overrideReason && (
                      <span className="cell-sub">{f.overrideReason}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="accordion">
        <div className="accordion-head">
          <span>Needs review</span>
          {needsReview.length === 0 ? (
            <Pill tone="green">Nothing flagged</Pill>
          ) : (
            <Pill tone={reviewPending.length ? "yellow" : "green"}>
              {reviewPending.length
                ? `${reviewPending.length} outstanding`
                : "All resolved"}
            </Pill>
          )}
        </div>
        <div className="accordion-body">
          {needsReview.length === 0 ? (
            <div className="empty">
              Nothing was flagged for manual review. The confirmation on the
              high-confidence set is still required — that click is what puts a
              named person and a timestamp against this classification.
            </div>
          ) : (
            <table className="dtable">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Source</th>
                  <th>Best guess</th>
                  <th>Sample (masked)</th>
                  <th>State</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {needsReview.map((f) => (
                  <tr key={f.id}>
                    <td className="mono">{f.fieldPath}</td>
                    <td className="cell-sub">{f.source.name}</td>
                    <td>
                      {DATA_CATEGORY_LABEL[f.detectedType as DataCategory] ?? f.detectedType}
                      {f.overriddenType && (
                        <div className="cell-sub" style={{ color: "var(--orange-600)" }}>
                          corrected to {f.overriddenType}
                        </div>
                      )}
                    </td>
                    <td className="mono cell-sub">{f.maskedSample}</td>
                    <td>
                      <Pill
                        tone={
                          f.reviewState === "approved"
                            ? "green"
                            : f.reviewState === "overridden"
                              ? "blue"
                              : "yellow"
                        }
                      >
                        {f.reviewState === "pending" ? "Awaiting decision" : f.reviewState}
                      </Pill>
                    </td>
                    <td>
                      {f.reviewState === "pending" ? (
                        <FieldReviewRow
                          fieldId={f.id}
                          detectedType={f.detectedType}
                          highConfidence={false}
                        />
                      ) : (
                        <span className="cell-sub">{f.overrideReason ?? "Approved as detected"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <StepFooter
        step={4}
        nextHref="/onboarding/integrations"
        skippable={false}
        primaryLabel="Confirm classification and continue"
        primaryDisabled={!allSettled}
        primaryTitle={
          allSettled
            ? undefined
            : "Every field needs a decision — approve the high-confidence set and resolve anything flagged."
        }
      />
    </div>
  );
}
