import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { PageHead, Stat, Pill, formatDate } from "@/components/ui";
import { EvidenceIntakeModal } from "@/components/scenario3/EvidenceIntakeModal";
import { EVIDENCE_STATUS, EVIDENCE_STATUS_LABEL, EVIDENCE_STATUS_TONE } from "@/lib/scenario3";

export const dynamic = "force-dynamic";

/**
 * SCREEN 1 — Evidence Request Queue. Grievance Officer requests (arriving over
 * the intake interface or logged manually) for audit evidence about a customer.
 * A row opens the unified search pre-filled with its identifier and date range.
 */
export default async function EvidenceQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; source?: string; q?: string }>;
}) {
  const params = await searchParams;
  const term = (params.q ?? "").trim();

  const requests = await db.evidenceRequest.findMany({
    where: {
      ...(params.status ? { status: params.status } : {}),
      ...(params.source ? { source: params.source } : {}),
      ...(term ? { OR: [{ customerId: { contains: term } }, { requestedBy: { contains: term } }, { claimedEvent: { contains: term } }] } : {}),
    },
    include: { _count: { select: { confirmations: true } } },
    orderBy: { createdAt: "desc" },
  });

  const openCount = requests.filter((r) => r.status !== "delivered").length;
  const delivered = requests.filter((r) => r.status === "delivered").length;

  return (
    <Shell active="/audit-trail/evidence" title="Audit & Escalation / Evidence requests">
      <PageHead
        title="Evidence requests"
        titleTip="Grievance Officer requests for audit evidence about a customer. Each opens a unified search across every module's audit log, per-entry verification, and a structured export — the evidence produced is itself logged."
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Open requests" value={openCount} tone={openCount ? "yellow" : undefined} />
        <Stat label="Delivered" value={delivered} tone={delivered ? "green" : undefined} />
        <Stat label="Total" value={requests.length} />
      </div>

      <CompactFilterBar
        basePath="/audit-trail/evidence"
        searchPlaceholder="Search customer, requester or claim…"
        facets={[
          { key: "status", label: "Status", options: EVIDENCE_STATUS.map((s) => ({ value: s, label: EVIDENCE_STATUS_LABEL[s] })) },
          { key: "source", label: "Source", options: [{ value: "api", label: "Intake API" }, { value: "manual", label: "Manual" }] },
        ]}
        actions={<EvidenceIntakeModal />}
      />

      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr><th>Requester</th><th>Customer</th><th>Date range</th><th>Claimed event</th><th>Status</th></tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/audit-trail/evidence/${r.id}`} className="row-link">{r.requestedBy}</Link>
                  <div className="cell-sub">{r.source === "api" ? "via intake API" : "logged manually"}</div>
                </td>
                <td><span className="mono cell-primary">{r.customerId}</span></td>
                <td><span className="cell-sub">{r.dateFrom ? formatDate(r.dateFrom) : "—"} → {r.dateTo ? formatDate(r.dateTo) : "—"}</span></td>
                <td><span className="cell-clamp">{r.claimedEvent}</span></td>
                <td>
                  <div className="cell-stack">
                    <Pill tone={EVIDENCE_STATUS_TONE[r.status] ?? "gray"} dot={false}>{EVIDENCE_STATUS_LABEL[r.status] ?? r.status}</Pill>
                    {r._count.confirmations > 0 && <span className="cell-sub">{r._count.confirmations} decided</span>}
                  </div>
                </td>
              </tr>
            ))}
            {requests.length === 0 && <tr><td colSpan={5}><div className="empty">No evidence requests.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
