import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import {
  Citation, Chip, Notice, PageHead, Pill, type PillTone, Stat, formatDate,
} from "@/components/ui";
import { DprrQueueActions, type ExportRow } from "@/components/dprr/DprrQueueActions";
import { evaluateSla, computeStatutoryCeiling } from "@/lib/engines/sla";
import {
  ESCALATION_SOURCE_LABEL, REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL,
  type EscalationSource, type RequestStatus, type RequestType,
} from "@/lib/domain";
import { GRIEVANCE_REDRESSAL_CEILING } from "@/lib/dpdp/statute";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, PillTone> = {
  received: "gray", identity_review: "blue", retention_review: "yellow",
  executing: "blue", awaiting_confirmation: "yellow", closed: "green", rejected: "red",
};

/**
 * SCREEN — Central DPRR Queue (SLA & routing)
 *
 * One unified view of every rights request with its routing owner and statutory
 * clock. It reuses the SLA engine and the request models; the DPRRTicket adds
 * the owner, the extendable-but-original-preserving deadline, and the permanent
 * automatic Board-escalation flag. Sorted by deadline severity.
 */
export default async function DprrQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; source?: string; status?: string; routing?: string; q?: string }>;
}) {
  const params = await searchParams;
  const term = (params.q ?? "").trim();

  const requests = await db.dataPrincipalRequest.findMany({
    where: {
      ...(params.type ? { type: params.type } : {}),
      ...(params.source ? { escalationSource: params.source } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(term
        ? { OR: [{ referenceCode: { contains: term } }, { rawIdentifier: { contains: term } }, { principal: { displayName: { contains: term } } }] }
        : {}),
    },
    include: { principal: true, assignedTo: true, dprrTicket: { include: { assignedTo: true, escalations: true, extensions: true } } },
  });

  const rows = requests.map((r) => {
    const ticket = r.dprrTicket;
    const currentDeadline = ticket?.currentDeadline ?? r.slaDeadline;
    const originalDeadline = ticket?.originalDeadline ?? r.slaDeadline;
    const sla = evaluateSla(r.receivedAt, currentDeadline);
    const owner = ticket?.assignedTo?.name ?? r.assignedTo?.name ?? null;
    const routingState = ticket?.routingState ?? (r.assignedToActorId ? "assigned" : "unassigned");
    return {
      r, ticket, sla, currentDeadline, originalDeadline, owner, routingState,
      boardEscalated: ticket?.boardEscalated ?? false,
      extCount: ticket?.extensions.length ?? 0,
      ceilingAt: computeStatutoryCeiling(r.receivedAt),
    };
  });

  rows.sort((a, b) => a.sla.msRemaining - b.sla.msRemaining);

  const open = rows.filter((x) => !["closed", "rejected"].includes(x.r.status)).length;
  const unassigned = rows.filter((x) => x.routingState === "unassigned").length;
  const escalated = rows.filter((x) => x.boardEscalated).length;
  const breached = rows.filter((x) => x.sla.band === "breached").length;

  const exportRows: ExportRow[] = rows.map((x) => ({
    reference: x.r.referenceCode,
    type: REQUEST_TYPE_LABEL[x.r.type as RequestType],
    principal: x.r.principal?.displayName ?? x.r.rawIdentifier,
    source: ESCALATION_SOURCE_LABEL[x.r.escalationSource as EscalationSource],
    owner: x.owner ?? "Unassigned",
    routingState: x.routingState,
    originalDeadline: formatDate(x.originalDeadline),
    currentDeadline: formatDate(x.currentDeadline),
    slaLabel: x.sla.label,
    boardEscalated: x.boardEscalated,
  }));

  return (
    <Shell active="/requests/sla" title="Requests / DPRR queue">
      <PageHead
        title="Central DPRR queue"
        titleTip="Every rights request in one place with its routing owner and statutory clock. Assignment and countdown are unified here; the deadline can be extended (append-only) and passing the 90-day ceiling escalates to the Board automatically."
      />

      <div className="stat-row" style={{ marginBottom: 14 }}>
        <Stat label="Open requests" value={open} />
        <Stat label="Unassigned" value={unassigned} tone={unassigned ? "yellow" : undefined} />
        <Stat label="Past deadline" value={breached} tone={breached ? "red" : undefined} />
        <Stat label="Board-escalated" value={escalated} tone={escalated ? "red" : undefined} />
      </div>

      <CompactFilterBar
        basePath="/requests/sla"
        searchPlaceholder="Search reference, name or email…"
        facets={[
          { key: "type", label: "Type", options: (Object.keys(REQUEST_TYPE_LABEL) as RequestType[]).map((t) => ({ value: t, label: REQUEST_TYPE_LABEL[t] })) },
          { key: "source", label: "Source", options: (Object.keys(ESCALATION_SOURCE_LABEL) as EscalationSource[]).map((s) => ({ value: s, label: ESCALATION_SOURCE_LABEL[s] })) },
          { key: "status", label: "Status", options: (["received", "identity_review", "retention_review", "executing", "awaiting_confirmation"] as RequestStatus[]).map((s) => ({ value: s, label: REQUEST_STATUS_LABEL[s] })) },
        ]}
        actions={<DprrQueueActions rows={exportRows} />}
      />

      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Type</th>
              <th>Data Principal</th>
              <th>Source</th>
              <th>Owner</th>
              <th>Deadline</th>
              <th>Board</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.r.id}>
                <td>
                  <Link href={`/requests/sla/${x.r.id}`} className="row-link mono">{x.r.referenceCode}</Link>
                  <div className="cell-sub">
                    <Pill tone={STATUS_TONE[x.r.status] ?? "gray"} dot={false}>{REQUEST_STATUS_LABEL[x.r.status as RequestStatus]}</Pill>
                  </div>
                </td>
                <td><Chip>{REQUEST_TYPE_LABEL[x.r.type as RequestType]}</Chip></td>
                <td>
                  <div className="cell-stack">
                    <span className="cell-primary">{x.r.principal?.displayName ?? "Unresolved"}</span>
                    <span className="cell-sub mono">{x.r.rawIdentifier}</span>
                  </div>
                </td>
                <td>
                  <Pill tone={x.r.escalationSource === "dpb" ? "red" : x.r.escalationSource === "grievance_officer" ? "purple" : "gray"} dot={false}>
                    {ESCALATION_SOURCE_LABEL[x.r.escalationSource as EscalationSource]}
                  </Pill>
                </td>
                <td>
                  <div className="cell-stack">
                    <span className="cell-primary">{x.owner ?? <em className="cell-sub">Unassigned</em>}</span>
                    <Pill tone={x.routingState === "reassigned" ? "purple" : x.routingState === "assigned" ? "blue" : "yellow"} dot={false}>
                      {x.routingState === "unassigned" ? "Unassigned" : x.routingState === "reassigned" ? "Reassigned" : "Auto-assigned"}
                    </Pill>
                  </div>
                </td>
                <td>
                  <div className="cell-stack">
                    <span style={{ color: x.sla.band === "breached" ? "var(--red)" : x.sla.band === "due_soon" ? "var(--yellow)" : undefined, fontWeight: x.sla.band === "ok" ? 400 : 500 }}>
                      {x.sla.label}
                    </span>
                    <span className="cell-sub">{formatDate(x.currentDeadline)}</span>
                    {x.extCount > 0 && <span className="cell-sub">extended ×{x.extCount} · orig {formatDate(x.originalDeadline)}</span>}
                    {x.sla.statutoryCeilingBreached && <Pill tone="red">Past the 90-day ceiling</Pill>}
                  </div>
                </td>
                <td>
                  {x.boardEscalated
                    ? <Pill tone="red">Escalated</Pill>
                    : <span className="cell-sub">—</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7}><div className="empty">No requests match this filter.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Notice tone="info" title="How this queue routes and escalates" >
        Auto-assignment routes grievance- and Board-sourced requests to the Grievance Officer and everything else to the fulfilment desk. Deadline extensions are append-only and never overwrite the original commitment. If a request passes the {GRIEVANCE_REDRESSAL_CEILING.label}, the system escalates it to the Data Protection Board on its own — there is no control anywhere to trigger, delay or reverse that.
      </Notice>

      <p style={{ marginTop: 12 }}>
        <Citation citation={`Statutory ceiling: ${GRIEVANCE_REDRESSAL_CEILING.citation}`} source={GRIEVANCE_REDRESSAL_CEILING.source} />
      </p>
    </Shell>
  );
}
