import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, Stat, Pill, formatDate } from "@/components/ui";
import { DeletionCreateModal } from "@/components/scenario3/DeletionCreateModal";
import { DELETION_STATUS_LABEL, DELETION_STATUS_TONE } from "@/lib/scenario3";

export const dynamic = "force-dynamic";

/** SCREEN 5 (queue) — Deletion instructions. Each is checked against retention
 *  flags on creation; a conflict removes the normal execution action and leaves
 *  only "Escalate to DPO". */
export default async function DeletionsPage() {
  const [instructions, principals] = await Promise.all([
    db.deletionInstruction.findMany({ include: { conflict: true, escalation: { include: { ruling: { include: { execution: true } } } } }, orderBy: { createdAt: "desc" } }),
    db.dataPrincipal.findMany({ orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
  ]);
  const principalName = new Map(principals.map((p) => [p.id, p.displayName]));

  const conflicts = instructions.filter((i) => i.status === "conflict_detected").length;
  const escalated = instructions.filter((i) => i.status === "escalated").length;
  const executed = instructions.filter((i) => i.status === "executed").length;

  return (
    <Shell active="/audit-trail/deletions" title="Audit & Escalation / Deletion instructions">
      <PageHead
        title="Deletion instructions"
        titleTip="The shared deletion-instruction interface (a future DSR module writes into the same table). Each instruction is checked against active retention obligations on creation; a conflict routes it to a DPO ruling before anything is deleted."
      />

      <div className="stat-row" style={{ marginBottom: 14 }}>
        <Stat label="In conflict" value={conflicts} tone={conflicts ? "red" : undefined} />
        <Stat label="Escalated" value={escalated} tone={escalated ? "yellow" : undefined} />
        <Stat label="Executed" value={executed} tone={executed ? "green" : undefined} />
        <Stat label="Total" value={instructions.length} />
      </div>

      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 12 }}>
        <DeletionCreateModal principals={principals.map((p) => ({ id: p.id, label: p.displayName }))} />
      </div>

      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr><th>Customer</th><th>Scope</th><th>Source</th><th>Deadline</th><th>Status</th><th>Obligation</th></tr>
          </thead>
          <tbody>
            {instructions.map((i) => (
              <tr key={i.id}>
                <td>
                  <Link href={`/audit-trail/deletions/${i.id}`} className="row-link">{principalName.get(i.customerId) ?? i.customerId}</Link>
                  <div className="cell-sub mono">{i.customerId.slice(0, 10)}…</div>
                </td>
                <td><span className="cell-clamp">{i.scope}</span></td>
                <td><span className="cell-sub">{i.source}</span></td>
                <td><span className="cell-sub">{i.deadline ? formatDate(i.deadline) : "—"}</span></td>
                <td><Pill tone={DELETION_STATUS_TONE[i.status] ?? "gray"} dot={false}>{DELETION_STATUS_LABEL[i.status] ?? i.status}</Pill></td>
                <td>{i.conflict ? <span className="warn-chip">{i.conflict.obligationReference}</span> : <span className="cell-sub">no conflict</span>}</td>
              </tr>
            ))}
            {instructions.length === 0 && <tr><td colSpan={6}><div className="empty">No deletion instructions.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
