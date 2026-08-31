import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import {
  Card,
  Citation,
  FieldChips,
  KeyValue,
  Notice,
  PageHead,
  Pill,
  formatDate,
  formatDateTime,
} from "@/components/ui";
import { decodeList, decodeObject } from "@/lib/codec/json";
import {
  ESCALATION_RULING_LABEL,
  RETENTION_REVIEW_LABEL,
  ROLE_LABEL,
  type ActorRole,
  type EscalationRuling,
  type RetentionReviewStatus,
} from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * ESCALATION STATUS TRACKER (Scenario 3)
 *
 * Three states, not two: pending ruling → ruled → action executed. A ruling
 * that nobody carried out is not a closed conflict, so the tracker keeps them
 * separate and says which one this is.
 */
export default async function EscalationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const escalation = await db.escalation.findUnique({
    where: { id },
    include: {
      request: { include: { principal: true } },
      exception: true,
      ruledBy: true,
    },
  });
  if (!escalation) notFound();

  const context = decodeObject<Record<string, unknown>>(escalation.contextJson) ?? {};
  const evidenceRefs = decodeList(escalation.attachedEvidenceJson);

  const auditEntries = await db.auditLogEntry.findMany({
    where: {
      OR: [
        { targetId: escalation.id },
        ...(escalation.requestId ? [{ requestId: escalation.requestId }] : []),
      ],
    },
    orderBy: { seq: "asc" },
    take: 40,
  });

  // "Ruled" and "acted on" are different facts. A ruling to uphold retention is
  // complete once recorded; a ruling to override is only complete once the
  // exception actually moved.
  const ruled = escalation.status === "ruled";
  const actionExecuted =
    ruled &&
    (escalation.ruling === "uphold_retention"
      ? escalation.exception?.reviewStatus === "upheld" ||
        escalation.exception?.reviewStatus === "acknowledged"
      : escalation.exception?.reviewStatus === "overridden");

  const stage = escalation.status === "withdrawn"
    ? "closed"
    : !ruled
      ? "pending"
      : actionExecuted
        ? "executed"
        : "ruled";

  return (
    <Shell active="/escalations" title="Escalations">
      <PageHead
        crumbs={[{ label: "Escalations", href: "/escalations" }, { label: "Case" }]}
        title={
          escalation.exception
            ? `${escalation.exception.dataCategory.toUpperCase()} retention conflict`
            : escalation.request
              ? `Execution conflict — ${escalation.request.referenceCode}`
              : `Role baseline change — ${String(context.role ?? "")}`
        }
        subtitle={
          <span className="row" style={{ gap: 8 }}>
            {stage === "pending" && <Pill tone="yellow">Pending ruling</Pill>}
            {stage === "ruled" && <Pill tone="blue">Ruled — action outstanding</Pill>}
            {stage === "executed" && <Pill tone="green">Ruled and actioned</Pill>}
            {stage === "closed" && <Pill tone="gray">Closed</Pill>}
            <span className="cell-sub">
              Raised by {ROLE_LABEL[escalation.sourceRole as ActorRole]} on{" "}
              {formatDate(escalation.createdAt)} · with{" "}
              {ROLE_LABEL[escalation.targetRole as ActorRole]}
            </span>
          </span>
        }
        actions={
          escalation.request ? (
            <Link href={`/requests/${escalation.requestId}`} className="btn sm">
              Open {escalation.request.referenceCode}
            </Link>
          ) : undefined
        }
      />

      {stage === "pending" && (
        <Notice tone="warn" title="Waiting on a decision that is not Admin's to make">
          Nothing changes until{" "}
          {ROLE_LABEL[escalation.targetRole as ActorRole]} rules. Admin cannot
          record the ruling from this portal, and the server refuses the attempt
          — this is what stops a conflict being resolved quietly at the console.
        </Notice>
      )}

      {stage === "ruled" && (
        <Notice tone="warn" title="Ruled, but the resulting action has not been carried out">
          The decision is recorded. The change it calls for has not yet happened,
          so this case stays open on the tracker.
        </Notice>
      )}

      <Card title="What was raised">
        <p style={{ marginTop: 0 }}>{escalation.reason}</p>
        <div className="section-label" style={{ marginTop: 14 }}>
          Context attached at the time
        </div>
        <pre className="code-block">{JSON.stringify(context, null, 2)}</pre>
        {evidenceRefs.length > 0 && (
          <>
            <div className="section-label" style={{ marginTop: 14 }}>
              Evidence attached
            </div>
            <FieldChips fields={evidenceRefs} />
            <p className="cell-sub" style={{ margin: "4px 0 0" }}>
              Attached automatically when the escalation was raised, so the
              decision-maker sees what Admin saw.
            </p>
          </>
        )}
      </Card>

      {escalation.exception && (
        <Card title="The obligation in dispute">
          <KeyValue
            rows={[
              ["Data category", escalation.exception.dataCategory],
              ["Legal basis", escalation.exception.legalBasis],
              [
                "Citation",
                <Citation key="c" citation={escalation.exception.statuteRef} source="statute" />,
              ],
              ["Expiry condition", escalation.exception.expiryCondition],
              [
                "Current review state",
                <Pill key="s" tone="blue">
                  {
                    RETENTION_REVIEW_LABEL[
                      escalation.exception.reviewStatus as RetentionReviewStatus
                    ]
                  }
                </Pill>,
              ],
            ]}
          />
          <div style={{ marginTop: 12 }}>
            <div className="section-label">Fields it protects</div>
            <FieldChips fields={decodeList(escalation.exception.fieldPathsJson)} />
          </div>
        </Card>
      )}

      {ruled && (
        <Card title="Ruling">
          <KeyValue
            rows={[
              [
                "Decision",
                <Pill key="r" tone={escalation.ruling === "approve_override" ? "green" : "blue"}>
                  {escalation.ruling
                    ? ESCALATION_RULING_LABEL[escalation.ruling as EscalationRuling]
                    : "—"}
                </Pill>,
              ],
              ["Rationale", escalation.rulingRationale],
              [
                "Ruled by",
                `${escalation.ruledBy?.name ?? "—"} (${
                  escalation.ruledBy ? ROLE_LABEL[escalation.ruledBy.role as ActorRole] : "—"
                })`,
              ],
              ["Ruled at", formatDateTime(escalation.ruledAt)],
            ]}
          />
        </Card>
      )}

      {escalation.status === "withdrawn" && (
        <Card title="Why this was closed">
          <p style={{ marginTop: 0 }}>
            {String(context.withdrawnBecause ?? "Withdrawn by Admin.")}
          </p>
          <p className="cell-sub" style={{ marginBottom: 0 }}>
            Withdrawing does not delete the case. The record that it was raised,
            and why it was dropped, stays in the log.
          </p>
        </Card>
      )}

      <Card
        title="Related audit trail"
        actions={
          escalation.requestId ? (
            <Link href={`/audit?requestId=${escalation.requestId}`} className="btn sm">
              Full log
            </Link>
          ) : undefined
        }
      >
        {auditEntries.length === 0 ? (
          <div className="empty">No related entries.</div>
        ) : (
          <div className="table-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>Seq</th>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {auditEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="mono cell-sub">{entry.seq}</td>
                    <td className="cell-sub">{formatDateTime(entry.timestamp)}</td>
                    <td>
                      {entry.actorLabel}
                      <span className="cell-sub">
                        {" "}
                        · {ROLE_LABEL[entry.actorRole as ActorRole] ?? entry.actorRole}
                      </span>
                    </td>
                    <td>
                      <code className="field-chip" style={{ margin: 0 }}>
                        {entry.action}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Shell>
  );
}
