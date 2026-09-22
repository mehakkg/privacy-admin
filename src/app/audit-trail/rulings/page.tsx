import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, Stat, Pill, formatDate } from "@/components/ui";
import { RULING_DECISION_LABEL } from "@/lib/scenario3";

export const dynamic = "force-dynamic";

/** SCREEN 7 (queue) — DPO Ruling queue. Retention-conflict escalations awaiting
 *  a ruling, ruled, or executed. */
export default async function RulingsQueuePage() {
  const escalations = await db.conflictEscalation.findMany({
    include: { instruction: true, ruling: { include: { execution: true } } },
    orderBy: { submittedAt: "desc" },
  });
  const principals = await db.dataPrincipal.findMany({ select: { id: true, displayName: true } });
  const name = new Map(principals.map((p) => [p.id, p.displayName]));

  const awaiting = escalations.filter((e) => !e.ruling).length;
  const executed = escalations.filter((e) => e.ruling?.execution).length;

  return (
    <Shell active="/audit-trail/rulings" title="Audit & Escalation / DPO rulings">
      <PageHead title="DPO rulings" titleTip="Retention-vs-erasure conflicts routed to the DPO. A ruling requires reasoning and a legal basis, is immutable once issued, and its execution writes a linked audit thread." />

      <div className="stat-row" style={{ marginBottom: 14 }}>
        <Stat label="Awaiting ruling" value={awaiting} tone={awaiting ? "yellow" : undefined} />
        <Stat label="Executed" value={executed} tone={executed ? "green" : undefined} />
        <Stat label="Total" value={escalations.length} />
      </div>

      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr><th>Customer</th><th>Obligation in conflict</th><th>Action requested</th><th>Status</th><th>Submitted</th></tr>
          </thead>
          <tbody>
            {escalations.map((e) => (
              <tr key={e.id}>
                <td><Link href={`/audit-trail/rulings/${e.id}`} className="row-link">{name.get(e.instruction.customerId) ?? e.instruction.customerId}</Link></td>
                <td><span className="cell-clamp">{e.obligationInConflict}</span></td>
                <td><span className="cell-clamp cell-sub">{e.actionRequested}</span></td>
                <td>
                  {e.ruling?.execution
                    ? <Pill tone="green" dot={false}>Executed</Pill>
                    : e.ruling
                      ? <Pill tone="blue" dot={false}>Ruled: {RULING_DECISION_LABEL[e.ruling.decision] ?? e.ruling.decision}</Pill>
                      : <Pill tone="yellow" dot={false}>Awaiting ruling</Pill>}
                </td>
                <td><span className="cell-sub">{formatDate(e.submittedAt)}</span></td>
              </tr>
            ))}
            {escalations.length === 0 && <tr><td colSpan={5}><div className="empty">No escalations. Conflicts escalated from a deletion instruction appear here.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
