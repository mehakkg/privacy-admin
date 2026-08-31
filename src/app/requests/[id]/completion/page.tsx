import Link from "next/link";
import {
  Card,
  CompletionPill,
  ExecutionPill,
  FieldChips,
  Notice,
  Pill,
  Stat,
  formatDate,
  formatDateTime,
} from "@/components/ui";
import { computeCompletion } from "@/lib/engines/completion";
import { COMPLETION_STATE_LABEL, EXECUTION_MODE_LABEL, type ExecutionMode } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * SCREEN 7 — Completion Tracker
 *
 * The per-system status grid, and the one screen that would be most tempting to
 * simplify into a progress bar with a tick at the end.
 *
 * It does not do that. The headline is the derived three-state value; failures
 * sit beside it rather than inside it; and when the request is not verified, the
 * reasons are listed individually. "Why is this not done" is the question this
 * screen exists to answer.
 */
export default async function CompletionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const completion = await computeCompletion(id);

  return (
    <div className="stack">
      <Card
        title={
          <span className="row">
            Completion
            <CompletionPill state={completion.state} hasFailures={completion.hasFailures} />
          </span>
        }
      >
        <p style={{ marginTop: 0 }}>
          {completion.state === "verified" ? (
            <>
              Every connected system and every Data Processor has confirmed, and
              the location map is complete. This is the only condition under which
              this request reads as fully verified.
            </>
          ) : completion.state === "partial" ? (
            <>
              Some targets have confirmed and others have not. This request is{" "}
              <strong>partially complete</strong> — it is not done, and reporting
              it as done because the primary database confirmed would be wrong.
            </>
          ) : (
            <>Nothing has confirmed yet.</>
          )}
        </p>

        <div className="stat-row">
          <Stat label="Targets" value={completion.totals.targets} />
          <Stat label="Verified" value={completion.totals.verified} tone="green" />
          <Stat label="Pending" value={completion.totals.pending} />
          <Stat
            label="Partial"
            value={completion.totals.partial}
            tone={completion.totals.partial ? "yellow" : undefined}
          />
          <Stat
            label="Failed"
            value={completion.totals.failed}
            tone={completion.totals.failed ? "red" : undefined}
          />
        </div>
      </Card>

      {completion.state !== "verified" && completion.blockedBy.length > 0 && (
        <Notice tone="warn" title={`Why this is ${COMPLETION_STATE_LABEL[completion.state].toLowerCase()}`}>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {completion.blockedBy.map((reason, i) => (
              <li key={i} style={{ marginBottom: 3 }}>
                {reason}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {!completion.coverage.complete && (
        <Notice tone="danger" title="Coverage is incomplete — verified is withheld">
          Even if every target below confirmed, this request could not be called
          fully verified: the map of where this person&apos;s data lives is not
          itself trustworthy.{" "}
          <Link href={`/requests/${id}/locations`}>See the coverage gaps →</Link>
        </Notice>
      )}

      <Card title="Per-target status">
        <div className="table-wrap">
          <table className="dtable">
            <thead>
              <tr>
                <th>Target</th>
                <th>Mode</th>
                <th>Status</th>
                <th>Confirmed</th>
                <th>Verification</th>
                <th>Withheld fields</th>
              </tr>
            </thead>
            <tbody>
              {completion.targets.map((target) => (
                <tr key={target.targetId}>
                  <td>
                    <div className="cell-stack">
                      <span className="cell-primary">{target.name}</span>
                      <span className="cell-sub">
                        {target.kind === "system" ? "Connected system" : "Data Processor"}
                        {" · "}
                        {target.recordCount.toLocaleString("en-IN")} records
                      </span>
                    </div>
                  </td>
                  <td>
                    {target.mode ? (
                      <Pill tone="gray" dot={false}>
                        {EXECUTION_MODE_LABEL[target.mode as ExecutionMode]}
                      </Pill>
                    ) : (
                      <span className="muted">Not started</span>
                    )}
                  </td>
                  <td>
                    <div className="cell-stack">
                      <ExecutionPill status={target.status} />
                      {target.scheduledFor && target.status === "pending" && (
                        <span className="cell-sub">
                          Scheduled {formatDate(target.scheduledFor)}
                        </span>
                      )}
                      {target.requiresManualVerification && target.status === "pending" && (
                        <span className="cell-sub">Awaiting attestation</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="cell-stack">
                      <span>{formatDateTime(target.confirmedAt)}</span>
                      {target.confirmedBy && (
                        <span className="cell-sub">by {target.confirmedBy}</span>
                      )}
                    </div>
                  </td>
                  <td className="cell-sub">{target.verificationMethod ?? "—"}</td>
                  <td>
                    {target.excludedFields.length > 0 ? (
                      <FieldChips fields={target.excludedFields} />
                    ) : (
                      <span className="muted">None</span>
                    )}
                  </td>
                </tr>
              ))}
              {completion.targets.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty">No targets discovered yet.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {completion.hasFailures && (
        <Notice tone="danger" title={`${completion.totals.failed} target(s) failed`}>
          Failures are reported alongside the completion state, never folded into
          it. A request with confirmed systems and a hard failure is partially
          complete <em>and</em> failing, and both halves need acting on.{" "}
          <Link href={`/requests/${id}/failures`}>Investigate →</Link>
        </Notice>
      )}
    </div>
  );
}
