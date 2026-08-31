import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, Citation, KeyValue, Notice, Pill, formatDate, formatDateTime } from "@/components/ui";
import { IdentityResolveForm, PreNoticeButton } from "@/components/actions";
import { evaluatePreNotice, evaluateSla } from "@/lib/engines/sla";
import { ERASURE_PRE_NOTICE, DPRR_FULFILMENT_PERIOD, GRIEVANCE_REDRESSAL_CEILING } from "@/lib/dpdp/statute";
import {
  ESCALATION_SOURCE_LABEL,
  EXECUTION_STATUS_LABEL,
  RETENTION_REVIEW_LABEL,
  IDENTIFIER_KIND_LABEL,
  REQUEST_STATUS_LABEL,
  REQUEST_TYPE_LABEL,
  type EscalationSource,
  type ExecutionStatus,
  type RetentionReviewStatus,
  type IdentifierKind,
  type RequestStatus,
  type RequestType,
} from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * SCREEN 2 — Request Detail
 *
 * Identifier lookup, the multi-account conflict warning, and the linked
 * Grievance case.
 *
 * The conflict warning is deliberately blocking rather than advisory. Two
 * people sharing a phone number is ordinary; erasing the wrong one is not
 * recoverable, so the request cannot proceed until someone records which
 * Data Principal this is and how they established it.
 */
export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const request = await db.dataPrincipalRequest.findUnique({
    where: { id },
    include: { principal: { include: { identifiers: true } } },
  });
  if (!request) notFound();

  // Identifier lookup: find every Data Principal asserting this identifier.
  const matches = await db.principalIdentifier.findMany({
    where: { value: request.rawIdentifier },
    include: { principal: { include: { identifiers: true } } },
  });

  const candidates = [
    ...new Map(matches.map((m) => [m.principal.id, m.principal])).values(),
  ];

  const sla = evaluateSla(request.receivedAt, request.slaDeadline);
  const preNotice = evaluatePreNotice(request.preNoticeSentAt, request.preNoticeDueAt);

  return (
    <div className="stack">
      {request.requiresIdentityReview && candidates.length > 1 && (
        <Notice tone="danger" title={`${candidates.length} Data Principals match this identifier`}>
          {request.identityNote}
        </Notice>
      )}

      <div className="grid-2">
        <Card title="Request">
          <KeyValue
            rows={[
              ["Reference", <span key="r" className="mono">{request.referenceCode}</span>],
              ["Type", REQUEST_TYPE_LABEL[request.type as RequestType]],
              ["Status", REQUEST_STATUS_LABEL[request.status as RequestStatus]],
              ["Received", formatDateTime(request.receivedAt)],
              [
                "Source",
                <span key="s" className="row">
                  <Pill tone={request.escalationSource === "dpb" ? "red" : "gray"} dot={false}>
                    {ESCALATION_SOURCE_LABEL[request.escalationSource as EscalationSource]}
                  </Pill>
                  {request.linkedGrievanceCaseId && (
                    <span className="mono cell-sub">
                      Case {request.linkedGrievanceCaseId}
                    </span>
                  )}
                </span>,
              ],
              ["Notes", <span key="n" className="muted">{request.notes ?? "—"}</span>],
            ]}
          />
        </Card>

        <Card title="Deadlines">
          <KeyValue
            rows={[
              [
                "Fulfilment deadline",
                <span key="d">
                  {formatDate(sla.deadline)} —{" "}
                  <strong
                    style={{
                      color:
                        sla.band === "breached"
                          ? "var(--red)"
                          : sla.band === "due_soon"
                            ? "var(--yellow)"
                            : undefined,
                    }}
                  >
                    {sla.label}
                  </strong>
                </span>,
              ],
              [
                "Basis",
                <Citation
                  key="b"
                  citation={DPRR_FULFILMENT_PERIOD.citation}
                  source={DPRR_FULFILMENT_PERIOD.source}
                />,
              ],
              [
                "Statutory ceiling",
                <span key="c">
                  {formatDate(sla.ceilingAt)}{" "}
                  {sla.statutoryCeilingBreached && <Pill tone="red">Passed</Pill>}
                  <div>
                    <Citation
                      citation={GRIEVANCE_REDRESSAL_CEILING.citation}
                      source="statute"
                    />
                  </div>
                </span>,
              ],
            ]}
          />

          {request.type === "erasure" && (
            <div style={{ marginTop: 16 }}>
              <div className="section-label">Pre-erasure notice</div>
              {preNotice.sent ? (
                <Notice tone={preNotice.cleared ? "ok" : "warn"}>
                  Notice sent {formatDateTime(preNotice.sentAt)}. Erasure{" "}
                  {preNotice.cleared
                    ? "is now permitted."
                    : `becomes permitted at ${formatDateTime(preNotice.clearsAt)} (${Math.ceil(preNotice.hoursRemaining)}h).`}
                  <div style={{ marginTop: 6 }}>
                    <Citation citation={ERASURE_PRE_NOTICE.citation} source="statute" />
                  </div>
                </Notice>
              ) : (
                <>
                  <Notice tone="warn" title="Notice not yet sent">
                    The Data Principal must be given at least{" "}
                    {ERASURE_PRE_NOTICE.hours} hours&apos; notice before erasure.
                    Until it has been sent and elapsed, execution is refused.
                    <div style={{ marginTop: 6 }}>
                      <Citation citation={ERASURE_PRE_NOTICE.citation} source="statute" />
                    </div>
                  </Notice>
                  <div style={{ marginTop: 10 }}>
                    <PreNoticeButton requestId={id} />
                  </div>
                </>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card title="Identifier lookup">
        <p className="cell-sub" style={{ marginTop: 0 }}>
          Searched for{" "}
          <code className="field-chip">{request.rawIdentifier}</code> as{" "}
          {IDENTIFIER_KIND_LABEL[request.rawIdentifierKind as IdentifierKind]}.
          Found {candidates.length} matching Data Principal
          {candidates.length === 1 ? "" : "s"}.
        </p>

        {request.requiresIdentityReview && candidates.length > 1 ? (
          <IdentityResolveForm
            requestId={id}
            candidates={candidates.map((c) => ({
              id: c.id,
              label: c.displayName,
              detail: c.identifiers
                .map(
                  (i) =>
                    `${IDENTIFIER_KIND_LABEL[i.kind as IdentifierKind]}: ${i.value}${i.verified ? "" : " (unverified)"}`,
                )
                .join(" · "),
            }))}
          />
        ) : request.principal ? (
          <>
            <KeyValue
              rows={[
                ["Data Principal", request.principal.displayName],
                [
                  "Identifiers",
                  <div key="i">
                    {request.principal.identifiers.map((i) => (
                      <div key={i.id} style={{ marginBottom: 3 }}>
                        <span className="cell-sub">
                          {IDENTIFIER_KIND_LABEL[i.kind as IdentifierKind]}
                        </span>{" "}
                        <code className="field-chip">{i.value}</code>
                        {i.verified ? (
                          <Pill tone="green">Verified</Pill>
                        ) : (
                          <Pill tone="yellow">Unverified</Pill>
                        )}
                        {i.assertedBy && (
                          <span className="cell-sub"> asserted by {i.assertedBy}</span>
                        )}
                      </div>
                    ))}
                  </div>,
                ],
                ["Customer since", formatDate(request.principal.createdAt)],
              ]}
            />
            {request.identityNote && (
              <div style={{ marginTop: 12 }}>
                <Notice tone="ok" title="Identity resolved">
                  {request.identityNote}
                </Notice>
              </div>
            )}
          </>
        ) : (
          <div className="empty">No Data Principal matched this identifier.</div>
        )}
      </Card>

      <SubTasks id={id} />

      {request.linkedGrievanceCaseId && (
        <Card title="Linked grievance case">
          <p style={{ marginTop: 0 }}>
            This request came from the Grievance Officer under case{" "}
            <span className="mono">{request.linkedGrievanceCaseId}</span>. They are
            answerable to the Data Principal for it, so completion, failure and
            escalation on this request notify them automatically — Admin performs
            no separate notify step.
          </p>
          <Link href={`/audit?requestId=${id}`} className="btn sm">
            View everything recorded against this case
          </Link>
        </Card>
      )}
    </div>
  );
}

/**
 * SUB-TASKS under the parent request.
 *
 * A count is not a tracker. "2 retention obligations unreviewed" tells you a
 * number; it does not tell you WHICH obligation is outstanding, who owns it, or
 * whether the other one moved. Each obligation and each execution target is
 * listed here as its own item with its own state, under one parent reference.
 *
 * Ownership is shown per item because these do not all belong to Admin: an
 * obligation escalated for a ruling is waiting on the DPO, and saying so stops
 * it reading as Admin inaction.
 */
async function SubTasks({ id }: { id: string }) {
  const request = await db.dataPrincipalRequest.findUnique({
    where: { id },
    select: { principalId: true },
  });
  if (!request?.principalId) return null;

  const [exceptions, executions] = await Promise.all([
    db.retentionException.findMany({
      where: { principalId: request.principalId },
      include: { escalations: true },
      orderBy: { dataCategory: "asc" },
    }),
    db.executionRecord.findMany({
      where: { requestId: id },
      include: { system: true, processor: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  type Tone = "green" | "yellow" | "red" | "blue" | "gray" | "purple";
  const items: {
    key: string;
    label: string;
    kind: string;
    state: string;
    tone: Tone;
    owner: string;
    href: string;
  }[] = [
    ...exceptions.map((e) => {
      const openEscalation = e.escalations.find((x) => x.status === "open");
      const reviewed = e.reviewStatus !== "unreviewed";
      return {
        key: e.id,
        label: `${e.dataCategory.toUpperCase()} retention obligation`,
        kind: "Legal sign-off",
        state: openEscalation
          ? "Awaiting DPO ruling"
          : RETENTION_REVIEW_LABEL[e.reviewStatus as RetentionReviewStatus],
        tone: (openEscalation ? "purple" : reviewed ? "green" : "yellow") as Tone,
        owner: openEscalation ? "Data Protection Officer" : "Admin",
        href: `/requests/${id}/scope`,
      };
    }),
    ...executions.map((x) => ({
      key: x.id,
      label: x.system?.name ?? x.processor?.name ?? "Target",
      kind: x.processor ? "Processor instruction" : "System execution",
      state: EXECUTION_STATUS_LABEL[x.status as ExecutionStatus],
      tone:
        x.status === "verified"
          ? ("green" as const)
          : x.status === "failed"
            ? ("red" as const)
            : x.status === "partial"
              ? ("yellow" as const)
              : ("gray" as const),
      owner: x.processor ? "Data Processor" : "Admin",
      href: `/requests/${id}/${x.processor ? "processors" : "execution"}`,
    })),
  ];

  if (items.length === 0) return null;

  const outstanding = items.filter((i) => i.tone !== "green").length;

  return (
    <Card
      title={`Sub-tasks (${items.length - outstanding}/${items.length} settled)`}
    >
      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <th>Item</th>
              <th>Type</th>
              <th>State</th>
              <th>Owner</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.key}>
                <td>
                  <Link href={item.href} className="row-link">
                    {item.label}
                  </Link>
                </td>
                <td className="cell-sub">{item.kind}</td>
                <td>
                  <Pill tone={item.tone}>{item.state}</Pill>
                </td>
                <td className="cell-sub">{item.owner}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {outstanding > 0 && (
        <p className="cell-sub" style={{ marginTop: 10, marginBottom: 0 }}>
          {outstanding} of {items.length} sub-tasks are still open. The parent
          request cannot read fully verified until every one of them settles.
        </p>
      )}
    </Card>
  );
}
