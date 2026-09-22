import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { PageHead, Stat, Pill, type PillTone, formatDate } from "@/components/ui";
import { FulfillmentIntakeModal } from "@/components/fulfillment/FulfillmentIntakeModal";
import { evaluateSla } from "@/lib/engines/sla";

export const dynamic = "force-dynamic";

/** SCREEN 1 — Deletion Request Intake. Grievance-validated erasure requests
 *  (RightsFulfillmentRequest) with scope + deadline; rows open into scope. */
export default async function FulfillmentQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; due?: string }>;
}) {
  const params = await searchParams;
  const requests = await db.rightsFulfillmentRequest.findMany({
    include: { systems: true, instruction: { include: { conflict: true, escalation: { include: { ruling: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  const principals = await db.dataPrincipal.findMany({ select: { id: true, displayName: true } });
  const name = new Map(principals.map((p) => [p.id, p.displayName]));

  function stageOf(r: (typeof requests)[number]): { key: string; label: string; tone: PillTone } {
    if (r.status === "complete") return { key: "complete", label: "Complete", tone: "green" };
    const inst = r.instruction;
    const cleared = inst && ((!inst.conflict && inst.status === "queued") || inst.escalation?.ruling?.decision === "proceed" || inst.escalation?.ruling?.decision === "modify");
    if (inst?.conflict && !cleared) return { key: "retention", label: "Retention hold", tone: "red" };
    if (r.status === "verifying" || (r.systems.length > 0 && r.status !== "received")) return { key: "verifying", label: "Verifying systems", tone: "blue" };
    if (r.scopeConfirmedAt) return { key: "ready", label: "Ready to execute", tone: "yellow" };
    return { key: "intake", label: "Awaiting scope", tone: "gray" };
  }

  let rows = requests.map((r) => ({ r, stage: stageOf(r), sla: r.deadline ? evaluateSla(r.createdAt, r.deadline) : null, scope: r.instruction?.scope ?? "—" }));
  if (params.stage) rows = rows.filter((x) => x.stage.key === params.stage);
  if (params.due === "soon") rows = rows.filter((x) => x.sla && x.sla.band !== "ok");
  rows.sort((a, b) => (a.sla?.msRemaining ?? Infinity) - (b.sla?.msRemaining ?? Infinity));

  const awaiting = requests.filter((r) => r.status === "received").length;
  const verifying = requests.filter((r) => r.status === "verifying").length;
  const complete = requests.filter((r) => r.status === "complete").length;

  return (
    <Shell active="/fulfillment" title="Rights Fulfillment / Deletion requests">
      <PageHead title="Deletion requests" titleTip="Grievance-validated erasure requests (RightsFulfillmentRequest) with scope and deadline. Open one to confirm scope, pass the shared retention gate, execute across every system, and compile completion evidence." />

      <div className="stat-row" style={{ marginBottom: 14 }}>
        <Stat label="Awaiting scope" value={awaiting} tone={awaiting ? "yellow" : undefined} />
        <Stat label="Verifying systems" value={verifying} />
        <Stat label="Complete" value={complete} tone={complete ? "green" : undefined} />
        <Stat label="Total" value={requests.length} />
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
        actions={<FulfillmentIntakeModal principals={principals.map((p) => ({ id: p.id, label: p.displayName }))} />}
      />

      <div className="table-wrap">
        <table className="dtable">
          <thead><tr><th>Customer</th><th>Scope</th><th>Deadline</th><th>Stage</th><th>Systems</th></tr></thead>
          <tbody>
            {rows.map(({ r, stage, sla, scope }) => (
              <tr key={r.id}>
                <td><Link href={`/fulfillment/${r.id}`} className="row-link">{name.get(r.customerId) ?? r.customerId}</Link><div className="cell-sub">{r.source}</div></td>
                <td><span className="cell-clamp">{scope}</span></td>
                <td>{sla ? <div className="cell-stack"><span style={{ color: sla.band === "breached" ? "var(--red)" : sla.band === "due_soon" ? "var(--yellow)" : undefined, fontWeight: sla.band === "ok" ? 400 : 600 }}>{sla.label}</span><span className="cell-sub">{r.deadline ? formatDate(r.deadline) : ""}</span></div> : <span className="cell-sub">—</span>}</td>
                <td><Pill tone={stage.tone} dot={false}>{stage.label}</Pill></td>
                <td>{r.systems.length > 0 ? <span className="cell-sub">{r.systems.filter((s) => s.status === "confirmed").length}/{r.systems.length} confirmed</span> : <span className="cell-sub">—</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5}><div className="empty">No deletion requests match this filter.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
