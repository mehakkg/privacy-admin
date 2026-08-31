import Link from "next/link";
import { db } from "@/lib/db";
import { Card, Notice, PageHead, Pill, Stat, formatDateTime } from "@/components/ui";
import { ScanRunner, StepFooter } from "@/components/onboardingForms";
import { SCAN_STATUS_LABEL, type ScanStatus } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * SCREEN 3 — Run Initial Discovery Scan. Skippable.
 *
 * Two things this screen refuses to do:
 *
 *  - Pre-check a source the DPO has not approved for scanning. Discovery SCOPE
 *    is a governance decision; a source Admin can connect is not automatically
 *    one Admin may scan. Unapproved sources are visible but disabled, with a
 *    route to request approval.
 *  - Report "no personal data found" as success. Across a set of connected
 *    sources that is far more likely to be a misconfiguration than a genuinely
 *    clean estate, and calling it clean would be the same "claim without
 *    verification" failure the audit found everywhere else.
 */
export default async function ScanStep() {
  const sources = await db.discoverySource.findMany({
    include: { _count: { select: { fields: true } } },
    orderBy: { name: "asc" },
  });

  const scanned = sources.filter((s) => s.scanStatus === "scanned");
  const failedScans = sources.filter((s) => s.scanStatus === "failed");
  const attempted = scanned.length + failedScans.length;
  const unapproved = sources.filter((s) => !s.dpoApprovedForScanning);
  const totalFields = sources.reduce((sum, s) => sum + s._count.fields, 0);

  const zeroPiiAcrossAll = attempted > 0 && scanned.length > 0 && totalFields === 0;

  return (
    <div className="stack">
      <PageHead
        title="Run initial discovery scan"
        subtitle="Finds where personal data sits in each connected source. Progress is shown here as each source completes — never by email alone."
      />

      <div className="stat-row">
        <Stat label="Sources" value={sources.length} />
        <Stat label="Scanned" value={scanned.length} tone={scanned.length ? "green" : undefined} />
        <Stat
          label="Scan failures"
          value={failedScans.length}
          tone={failedScans.length ? "red" : undefined}
        />
        <Stat
          label="Awaiting DPO approval"
          value={unapproved.length}
          tone={unapproved.length ? "yellow" : undefined}
        />
        <Stat label="Fields found" value={totalFields} />
      </div>

      {sources.length === 0 ? (
        <Card title="Nothing to scan yet">
          <div className="empty">
            <p style={{ margin: "0 0 10px" }}>
              No sources are connected, so there is nothing to scan. This step
              will stay available on your dashboard.
            </p>
            <Link href="/onboarding/sources" className="btn primary sm">
              Go back and connect a source
            </Link>
          </div>
        </Card>
      ) : (
        <>
          {unapproved.length > 0 && (
            <Notice
              tone="warn"
              title={`${unapproved.length} source${unapproved.length === 1 ? "" : "s"} awaiting DPO scope approval`}
            >
              Connecting a source and being allowed to scan it are separate
              decisions. Scanning determines what personal data we hold and why,
              which is the DPO&apos;s scope to approve.{" "}
              <Link href="/escalations">Request approval →</Link>
            </Notice>
          )}

          <Card title="Select sources to scan">
            <ScanRunner
              sources={sources.map((s) => ({
                id: s.id,
                name: s.name,
                approved: s.dpoApprovedForScanning,
                connectionState: s.connectionState,
                estimatedDurationMinutes: s.estimatedDurationMinutes,
              }))}
            />
          </Card>

          {attempted > 0 && (
            <Card
              title={
                failedScans.length > 0
                  ? `${scanned.length} of ${attempted} sources scanned, ${failedScans.length} failed`
                  : `${scanned.length} source${scanned.length === 1 ? "" : "s"} scanned`
              }
            >
              <div className="table-wrap">
                <table className="dtable">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Status</th>
                      <th>Fields found</th>
                      <th>Last scanned</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources
                      .filter((s) => s.scanStatus !== "pending")
                      .map((s) => (
                        <tr key={s.id}>
                          <td className="cell-primary">{s.name}</td>
                          <td>
                            <Pill
                              tone={
                                s.scanStatus === "scanned"
                                  ? "green"
                                  : s.scanStatus === "failed"
                                    ? "red"
                                    : "yellow"
                              }
                            >
                              {SCAN_STATUS_LABEL[s.scanStatus as ScanStatus]}
                            </Pill>
                          </td>
                          <td className="mono">{s._count.fields}</td>
                          <td className="cell-sub">{formatDateTime(s.lastScanned)}</td>
                          <td className="cell-sub" style={{ maxWidth: 380 }}>
                            {s.scanFailureDetail ?? s.classificationSummary ?? "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {failedScans.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <Notice tone="warn" title="Partial result, reported per source">
                    The sources that scanned are usable now — their results are
                    on the next step. Only the failed ones need attention, and
                    each says specifically what went wrong rather than the run
                    reporting itself as a single failure.
                  </Notice>
                </div>
              )}
            </Card>
          )}

          {zeroPiiAcrossAll && (
            <Notice tone="danger" title="No personal data detected — verify source connections">
              A scan across connected sources that finds nothing is far more
              likely to be a permissions or scope problem than a genuinely clean
              estate. This is not being recorded as a clean result. Check that
              the service account can read the schemas that hold customer data,
              then scan again.
            </Notice>
          )}
        </>
      )}

      <StepFooter
        step={3}
        nextHref="/onboarding/classification"
        skippable
        primaryLabel={scanned.length > 0 ? "Continue to review" : "Continue"}
        skipLabel="Skip — I'll scan later from Data Discovery"
      />
    </div>
  );
}
