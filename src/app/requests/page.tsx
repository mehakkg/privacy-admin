import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { SetupStrip } from "@/components/SetupStrip";
import {
  Citation,
  CompletionPill,
  Notice,
  PageHead,
  BadgeWithDetail,
  Pill,
  Stat,
  formatDate,
} from "@/components/ui";
import { TickButton } from "@/components/actions";
import { computeCompletion, completionSummary } from "@/lib/engines/completion";
import { evaluateSla } from "@/lib/engines/sla";
import { getRetentionPosture } from "@/lib/guards/retentionGate";
import { getSession } from "@/lib/session";
import { listNotifications } from "@/lib/engines/notification";
import {
  ESCALATION_SOURCE_LABEL,
  REQUEST_STATUS_LABEL,
  REQUEST_TYPE_LABEL,
  type EscalationSource,
  type RequestStatus,
  type RequestType,
} from "@/lib/domain";
import { DPRR_FULFILMENT_PERIOD } from "@/lib/dpdp/statute";

export const dynamic = "force-dynamic";

/**
 * SCREEN 1 — Deletion Request Queue
 *
 * Sorted by deadline severity rather than arrival, because the thing that makes
 * a request urgent is the statutory clock, not when it happened to land.
 *
 * The completion column shows the derived three-state value with the failure
 * count beside it. A row never reads as done because the primary database
 * confirmed.
 */
export default async function RequestQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; source?: string }>;
}) {
  const params = await searchParams;
  const session = await getSession();

  const requests = await db.dataPrincipalRequest.findMany({
    where: {
      ...(params.type ? { type: params.type } : {}),
      ...(params.source ? { escalationSource: params.source } : {}),
    },
    include: { principal: true },
  });

  const rows = await Promise.all(
    requests.map(async (request) => {
      const [completion, posture] = await Promise.all([
        computeCompletion(request.id),
        getRetentionPosture(request.principalId, request.id),
      ]);
      return {
        request,
        completion,
        posture,
        sla: evaluateSla(request.receivedAt, request.slaDeadline),
      };
    }),
  );

  // Most urgent first: breached, then closest to the deadline.
  rows.sort((a, b) => a.sla.msRemaining - b.sla.msRemaining);

  const notifications = await listNotifications(session.role, 5);
  const unread = notifications.filter((n) => !n.readAt);

  const breached = rows.filter((r) => r.sla.band === "breached").length;
  const blocked = rows.filter((r) => !r.posture.clear).length;
  const failing = rows.filter((r) => r.completion.hasFailures).length;

  return (
    <Shell active="/requests" title="Requests">
      <PageHead
        title="Data Principal Rights Requests"
        titleTip="Execution queue for access, correction and erasure requests. Admin implements the decision; it does not make it."
        actions={<TickButton />}
      />

      <SetupStrip />

      {unread.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="warn" title={`${unread.length} unread notification${unread.length === 1 ? "" : "s"}`}>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {unread.slice(0, 3).map((n) => (
                <li key={n.id} style={{ marginBottom: 2 }}>
                  <strong>{n.title}</strong> — {n.body}
                </li>
              ))}
            </ul>
            <Link href="/notifications" style={{ fontSize: 12.5 }}>
              View all
            </Link>
          </Notice>
        </div>
      )}

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Open requests" value={rows.length} />
        <Stat label="Past deadline" value={breached} tone={breached ? "red" : undefined} />
        <Stat label="Blocked on retention" value={blocked} tone={blocked ? "yellow" : undefined} />
        <Stat label="With failures" value={failing} tone={failing ? "red" : undefined} />
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <span className="section-label" style={{ margin: 0 }}>Filter</span>
        <FilterLink label="All" href="/requests" active={!params.type && !params.source} />
        <FilterLink label="Erasure" href="/requests?type=erasure" active={params.type === "erasure"} />
        <FilterLink label="Access" href="/requests?type=access" active={params.type === "access"} />
        <FilterLink
          label="From Grievance Officer"
          href="/requests?source=grievance_officer"
          active={params.source === "grievance_officer"}
        />
        <FilterLink label="From the Board" href="/requests?source=dpb" active={params.source === "dpb"} />
      </div>

      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Type</th>
              <th>Data Principal</th>
              <th>Source</th>
              <th>Status</th>
              <th>Completion</th>
              <th>Deadline</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ request, completion, posture, sla }) => (
              <tr key={request.id}>
                <td>
                  <Link href={`/requests/${request.id}`} className="row-link mono">
                    {request.referenceCode}
                  </Link>
                  <div className="cell-sub">{formatDate(request.receivedAt)}</div>
                </td>
                <td>
                  <Pill tone={request.type === "erasure" ? "orange" : "blue"} dot={false}>
                    {REQUEST_TYPE_LABEL[request.type as RequestType]}
                  </Pill>
                </td>
                <td>
                  <div className="cell-stack">
                    <span className="cell-primary">
                      {request.principal?.displayName ?? "Unresolved"}
                    </span>
                    <span className="cell-sub mono">{request.rawIdentifier}</span>
                  </div>
                </td>
                <td>
                  <div className="cell-stack">
                    <Pill
                      tone={
                        request.escalationSource === "dpb"
                          ? "red"
                          : request.escalationSource === "grievance_officer"
                            ? "purple"
                            : "gray"
                      }
                      dot={false}
                    >
                      {ESCALATION_SOURCE_LABEL[request.escalationSource as EscalationSource]}
                    </Pill>
                    {request.linkedGrievanceCaseId && (
                      <span className="cell-sub mono">{request.linkedGrievanceCaseId}</span>
                    )}
                  </div>
                </td>
                <td>
                  <div className="cell-stack">
                    <span>{REQUEST_STATUS_LABEL[request.status as RequestStatus]}</span>
                    {!posture.clear && (
                      <BadgeWithDetail
                        tone="yellow"
                        label={`${posture.unreviewedCount} unreviewed`}
                        detail={`${posture.unreviewedCount} legal-retention obligation${
                          posture.unreviewedCount === 1 ? "" : "s"
                        } must be reviewed before any deletion action on this request. Open Scope & Retention to review them.`}
                      />
                    )}
                  </div>
                </td>
                <td>
                  <div className="cell-stack">
                    <CompletionPill state={completion.state} hasFailures={completion.hasFailures} />
                    <span className="cell-sub">{completionSummary(completion)}</span>
                  </div>
                </td>
                <td>
                  <div className="cell-stack">
                    <span
                      style={{
                        color:
                          sla.band === "breached"
                            ? "var(--red)"
                            : sla.band === "due_soon"
                              ? "var(--yellow)"
                              : undefined,
                        fontWeight: sla.band === "ok" ? 400 : 500,
                      }}
                    >
                      {sla.label}
                    </span>
                    <span className="cell-sub">{formatDate(sla.deadline)}</span>
                    {sla.statutoryCeilingBreached && (
                      <Pill tone="red">Past the 90-day ceiling</Pill>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty">No requests match this filter.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 12 }}>
        <Citation
          citation={`Deadline basis: ${DPRR_FULFILMENT_PERIOD.citation}`}
          source={DPRR_FULFILMENT_PERIOD.source}
        />
      </p>
    </Shell>
  );
}

function FilterLink({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link href={href} className={`btn sm ${active ? "primary" : "ghost"}`}>
      {label}
    </Link>
  );
}
