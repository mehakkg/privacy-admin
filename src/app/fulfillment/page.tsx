import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { PageHead, Stat, Pill, type PillTone, formatDate } from "@/components/ui";
import { evaluateSla } from "@/lib/engines/sla";

export const dynamic = "force-dynamic";

/** SCREEN 1 — Deletion Request Intake. A Grievance-validated erasure lands in
 *  Admin's queue with scope and deadline. Rows open into scope confirmation. */
export default async function FulfillmentQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; due?: string }>;
}) {
  const params = await searchParams;
  const instructions = await db.deletionInstruction.findMany({
    include: { systems: true, conflict: true, escalation: { include: { ruling: true } } },
    orderBy: { createdAt: "desc" },
  });
  const principals = await db.dataPrincipal.findMany({ select: { id: true, displayName: true } });
  const name = new Map(principals.map((p) => [p.id, p.displayName]));

  function stageOf(i: (typeof instructions)[number]): { key: string; label: string; tone: PillTone } {
    if (i.completedAt) return { key: "complete", label: "Complete", tone: "green" };
    if (i.status === "executed" && i.systems.length > 0) return { key: "verifying", label: "Verifying systems", tone: "blue" };
    const cleared = (!i.conflict && i.status === "queued") || i.escalation?.ruling?.decision === "proceed" || i.escalation?.ruling?.decision === "modify";
    if ((i.status === "conflict_detected" || i.status === "escalated") && !cleared) return { key: "retention", label: "Retention hold", tone: "red" };
    if (i.scopeConfirmedAt) return { key: "ready", label: "Ready to execute", tone: "yellow" };
    return { key: "intake", label: "Awaiting scope", tone: "gray" };
  }

  let rows = instructions.map((i) => {
    const sla = i.deadline ? evaluateSla(i.createdAt, i.deadline) : null;
    return { i, stage: stageOf(i), sla };
  });
  if (params.stage) rows = rows.filter((r) => r.stage.key === params.stage);
  if (params.due === "soon") rows = rows.filter((r) => r.sla && r.sla.band !== "ok");
  rows.sort((a, b) => (a.sla?.msRemaining ?? Infinity) - (b.sla?.msRemaining ?? Infinity));

  const awaiting = instructions.filter((i) => !i.completedAt && !i.scopeConfirmedAt).length;
  const executing = instructions.filter((i) => i.status === "executed" && i.systems.length > 0 && !i.completedAt).length;
  const complete = instructions.filter((i) => i.completedAt).length;

  return (
    <Shell active="/fulfillment" title="Rights Fulfillment / Deletion requests">
      <PageHead
        title="Deletion requests"
        titleTip="Grievance-validated erasure requests land here with scope and deadline (the shared DeletionInstruction). Open one to confirm scope, pass the retention gate, execute across every system, and compile completion evidence."
      />

      <div className="stat-row" style={{ marginBottom: 14 }}>
        <Stat label="Awaiting scope" value={awaiting} tone={awaiting ? "yellow" : undefined} />
        <Stat label="Verifying systems" value={executing} />
        <Stat label="Complete" value={complete} tone={complete ? "green" : undefined} />
        <Stat label="Total" value={instructions.length} />
      </div>

      <CompactFilterBar
        basePath="/fulfillment"
        facets={[
          { key: "stage", label: "Stage", options: [
            { value: "intake", label: "Awaiting scope" }, { value: "ready", label: "Ready to execute" },
            { value: "verifying", label: "Verifying systems" }, { value: "retention", label: "Retention hold" }, { value: "complete", label: "Complete" },
          ] },
          { key: "due", label: "Deadline", options: [{ value: "soon", label: "Due soon / overdue" }] },
        ]}
      />

      <div className="table-wrap">
        <table className="dtable">
          <thead><tr><th>Customer</th><th>Scope</th><th>Deadline</th><th>Stage</th><th>Systems</th></tr></thead>
          <tbody>
            {rows.map(({ i, stage, sla }) => (
              <tr key={i.id}>
                <td>
                  <Link href={`/fulfillment/${i.id}`} className="row-link">{name.get(i.customerId) ?? i.customerId}</Link>
                  <div className="cell-sub">{i.source}</div>
                </td>
                <td><span className="cell-clamp">{i.scope}</span></td>
                <td>
                  {sla
                    ? <div className="cell-stack"><span style={{ color: sla.band === "breached" ? "var(--red)" : sla.band === "due_soon" ? "var(--yellow)" : undefined, fontWeight: sla.band === "ok" ? 400 : 600 }}>{sla.label}</span><span className="cell-sub">{i.deadline ? formatDate(i.deadline) : ""}</span></div>
                    : <span className="cell-sub">—</span>}
                </td>
                <td><Pill tone={stage.tone} dot={false}>{stage.label}</Pill></td>
                <td>{i.systems.length > 0 ? <span className="cell-sub">{i.systems.filter((s) => s.status === "confirmed").length}/{i.systems.length} confirmed</span> : <span className="cell-sub">—</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5}><div className="empty">No deletion requests match this filter.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
