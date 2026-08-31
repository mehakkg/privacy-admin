import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  Card,
  Citation,
  FieldChips,
  KeyValue,
  Notice,
  Pill,
  formatDate,
  formatDateTime,
} from "@/components/ui";
import { RetentionActions, RulingForm } from "@/components/actions";
import { getRetentionPosture } from "@/lib/guards/retentionGate";
import { getSession } from "@/lib/session";
import { mayRule } from "@/lib/guards/escalationGate";
import { decodeObject } from "@/lib/codec/json";
import { RETENTION_OVERRIDE_BASIS } from "@/lib/dpdp/statute";
import {
  ESCALATION_RULING_LABEL,
  RETENTION_REVIEW_LABEL,
  ROLE_LABEL,
  type EscalationRuling,
  type RetentionReviewStatus,
} from "@/lib/domain";

export const dynamic = "force-dynamic";

const REVIEW_TONE: Record<RetentionReviewStatus, "gray" | "yellow" | "green" | "purple" | "red"> = {
  unreviewed: "yellow",
  acknowledged: "green",
  override_requested: "purple",
  overridden: "red",
  upheld: "green",
};

/**
 * SCREEN 3 — Retention Exception Panel
 *
 * Reached before Execute, and the gate the server enforces regardless.
 *
 * Two things this screen refuses to do:
 *
 *  - It never offers all-or-nothing deletion. Every exception is scoped to
 *    field paths, and acknowledging one withholds exactly those fields while
 *    the rest of the record still proceeds.
 *
 *  - It offers no override control. The only route towards releasing protected
 *    fields is "Request override from DPO", which raises an escalation with the
 *    full context attached and waits. Admin cannot rule on it, in this UI or by
 *    any other route (guards/escalationGate.ts).
 */
export default async function RetentionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();

  const request = await db.dataPrincipalRequest.findUnique({ where: { id } });
  if (!request) notFound();

  const posture = await getRetentionPosture(request.principalId, id);

  const escalations = await db.escalation.findMany({
    where: { requestId: id, retentionExceptionId: { not: null } },
    include: { ruledBy: true, exception: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="stack">
      <Notice
        tone={posture.clear ? "ok" : "warn"}
        title={
          posture.clear
            ? "No unreviewed retention obligations — execution is unlocked"
            : `${posture.unreviewedCount} obligation${posture.unreviewedCount === 1 ? "" : "s"} must be reviewed before any deletion action`
        }
      >
        Under the {RETENTION_OVERRIDE_BASIS.label.toLowerCase()}, personal data
        must be erased on withdrawal of consent, except where retention is
        necessary for compliance with a law in force. That exception covers only
        the data the law actually requires — which is why each obligation below
        lists the specific fields it protects, and why the rest of the record can
        still be erased.
        <div style={{ marginTop: 6 }}>
          <Citation citation={RETENTION_OVERRIDE_BASIS.citation} source="statute" />
        </div>
      </Notice>

      {posture.exceptions.length === 0 && (
        <Card title="Retention obligations">
          <div className="empty">
            No statutory retention obligation was flagged for this Data Principal.
          </div>
        </Card>
      )}

      {posture.exceptions.map((exception) => (
        <Card
          key={exception.id}
          title={
            <span className="row">
              {exception.dataCategory.toUpperCase()} retention
              <Pill tone={REVIEW_TONE[exception.reviewStatus]}>
                {RETENTION_REVIEW_LABEL[exception.reviewStatus]}
              </Pill>
              {exception.autoFlagged && (
                <Pill tone="gray" dot={false}>
                  Auto-flagged
                </Pill>
              )}
            </span>
          }
        >
          <KeyValue
            rows={[
              ["Legal basis", exception.legalBasis],
              [
                "Citation",
                <span key="c" className="mono">
                  {exception.statuteRef}
                </span>,
              ],
              ["Expiry condition", exception.expiryCondition],
              [
                "Expires",
                exception.expiresAt ? formatDate(exception.expiresAt) : "No fixed date",
              ],
              [
                "Fields protected",
                <FieldChips key="f" fields={exception.fieldPaths} />,
              ],
              [
                "Effect on this erasure",
                exception.withholds ? (
                  <span>
                    These fields are <strong>excluded</strong> from deletion. Every
                    other field in the record is still erased.
                  </span>
                ) : (
                  <span style={{ color: "var(--red)" }}>
                    Released by a DPO ruling — these fields will be deleted.
                  </span>
                ),
              ],
            ]}
          />

          <div style={{ marginTop: 14 }}>
            <RetentionActions
              requestId={id}
              exceptionId={exception.id}
              reviewStatus={exception.reviewStatus}
            />
          </div>
        </Card>
      ))}

      {posture.protectedFields.length > 0 && (
        <Card title="Fields that will be withheld from deletion">
          <FieldChips fields={posture.protectedFields} />
          <p className="cell-sub" style={{ marginBottom: 0 }}>
            Execution payloads carry this list as <code>excludedFields</code>. A
            deletion that withholds fields is recorded as a partial deletion, not
            as a completed one.
          </p>
        </Card>
      )}

      {escalations.length > 0 && (
        <Card title="Escalations to the DPO">
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
                    Raised by {ROLE_LABEL[escalation.sourceRole as keyof typeof ROLE_LABEL]} ·{" "}
                    {formatDateTime(escalation.createdAt)}
                  </span>
                </div>

                <KeyValue
                  rows={[
                    ["Reason given", escalation.reason],
                    [
                      "Context attached",
                      <pre key="ctx" className="code-block">
                        {JSON.stringify(context, null, 2)}
                      </pre>,
                    ],
                    ...(escalation.status === "ruled"
                      ? ([
                          [
                            "Ruling",
                            <span key="r">
                              <strong>
                                {ESCALATION_RULING_LABEL[escalation.ruling as EscalationRuling]}
                              </strong>
                              <div className="cell-sub">
                                {escalation.rulingRationale}
                              </div>
                              <div className="cell-sub">
                                {escalation.ruledBy?.name} ·{" "}
                                {formatDateTime(escalation.ruledAt)}
                              </div>
                            </span>,
                          ],
                        ] as [React.ReactNode, React.ReactNode][])
                      : []),
                  ]}
                />

                {escalation.status === "open" && (
                  <div style={{ marginTop: 12 }}>
                    {mayRule(session.role) ? (
                      <RulingForm requestId={id} escalationId={escalation.id} />
                    ) : (
                      <Notice tone="policy" title="Waiting on the Data Protection Officer">
                        You are acting as {ROLE_LABEL[session.role]}. Recording a
                        ruling requires the DPO — the server refuses it for any
                        other role, so this conflict cannot be resolved here.
                      </Notice>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
