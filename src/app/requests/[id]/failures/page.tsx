import { db } from "@/lib/db";
import {
  Card,
  ExecutionPill,
  KeyValue,
  Notice,
  Pill,
  formatDateTime,
} from "@/components/ui";
import { EscalateFailureForm, RetryButton } from "@/components/actions";
import { computeCompletion } from "@/lib/engines/completion";
import { decodeObject } from "@/lib/codec/json";
import { ROLE_LABEL, type ActorRole } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * SCREEN 9 — Failure Investigation Workspace
 *
 * Acceptance criterion 7. A previous version of this product hid failure
 * diagnostics behind the DPO, which meant the person responsible for fixing a
 * failure could not see why it failed. Everything the connector returned is
 * shown here, to Admin, including the raw response body.
 *
 * The distinction the screen tries to hold: a failure Admin can fix (an expired
 * token, a refused connection) is theirs to retry; a failure that needs a
 * decision is escalated with the diagnostics attached automatically, so the DPO
 * rules on evidence rather than on a description of evidence.
 */
export default async function FailuresPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [completion, records, escalations] = await Promise.all([
    computeCompletion(id),
    db.executionRecord.findMany({
      where: { requestId: id, status: "failed" },
      include: { system: true, processor: true },
    }),
    db.escalation.findMany({
      where: { requestId: id, retentionExceptionId: null },
      include: { ruledBy: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="stack">
      {records.length === 0 ? (
        <Card>
          <div className="empty">
            No execution against this request has failed.
            {completion.state !== "verified" &&
              " Outstanding targets are pending rather than failing — see the completion tracker."}
          </div>
        </Card>
      ) : (
        <Notice tone="danger" title={`${records.length} failed execution${records.length === 1 ? "" : "s"}`}>
          Full diagnostics are shown below. This request cannot be reported
          complete while any of them stands.
        </Notice>
      )}

      {records.map((record) => (
        <Card
          key={record.id}
          title={
            <span className="row">
              {record.system?.name ?? record.processor?.name}
              <ExecutionPill status="failed" />
              <Pill tone="gray" dot={false}>
                Attempt {record.attempt}
              </Pill>
            </span>
          }
        >
          <KeyValue
            rows={[
              [
                "Error code",
                <code key="c" className="field-chip" style={{ color: "var(--red)" }}>
                  {record.failureCode}
                </code>,
              ],
              ["What went wrong", record.failureDetail],
              ["Last attempted", formatDateTime(record.dispatchedAt)],
              ["Owning team", record.system?.ownerTeam ?? "—"],
            ]}
          />

          {record.failureRawResponse && (
            <div style={{ marginTop: 14 }}>
              <div className="section-label">Raw response from the system</div>
              <pre className="code-block">{record.failureRawResponse}</pre>
            </div>
          )}

          <div className="grid-2" style={{ marginTop: 16 }}>
            <div>
              <div className="section-label">Retry</div>
              <p className="cell-sub" style={{ marginTop: 0 }}>
                Re-dispatch once the underlying cause is fixed. Each attempt is
                logged separately.
              </p>
              <RetryButton requestId={id} executionRecordId={record.id} />
            </div>
            <div>
              <div className="section-label">Escalate</div>
              <p className="cell-sub" style={{ marginTop: 0 }}>
                If this needs a decision rather than a fix, escalate to the DPO.
                The error code, detail and raw response are attached
                automatically.
              </p>
              <EscalateFailureForm requestId={id} executionRecordId={record.id} />
            </div>
          </div>
        </Card>
      ))}

      {escalations.length > 0 && (
        <Card title="Escalations raised from failures">
          {escalations.map((escalation) => {
            const context = decodeObject<Record<string, unknown>>(escalation.contextJson);
            return (
              <div
                key={escalation.id}
                style={{
                  borderTop: "1px solid var(--border-soft)",
                  paddingTop: 12,
                  marginTop: 12,
                }}
              >
                <div className="row" style={{ marginBottom: 8 }}>
                  <Pill tone={escalation.status === "ruled" ? "green" : "purple"}>
                    {escalation.status === "ruled" ? "Ruled" : "Awaiting ruling"}
                  </Pill>
                  <span className="cell-sub">
                    {ROLE_LABEL[escalation.sourceRole as ActorRole]} →{" "}
                    {ROLE_LABEL[escalation.targetRole as ActorRole]} ·{" "}
                    {formatDateTime(escalation.createdAt)}
                  </span>
                </div>
                <KeyValue
                  rows={[
                    ["Reason", escalation.reason],
                    [
                      "Evidence attached",
                      <pre key="c" className="code-block">
                        {JSON.stringify(context, null, 2)}
                      </pre>,
                    ],
                    ...(escalation.ruling
                      ? ([
                          [
                            "Ruling",
                            <span key="r">
                              {escalation.ruling}
                              <div className="cell-sub">{escalation.rulingRationale}</div>
                            </span>,
                          ],
                        ] as [React.ReactNode, React.ReactNode][])
                      : []),
                  ]}
                />
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
