import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, Stat, Pill, Chip, Notice, formatDate } from "@/components/ui";
import { SEVERITY_TONE, BREACH_STATUS_LABEL } from "@/lib/breach";

export const dynamic = "force-dynamic";

/**
 * SCREEN — Investigation (cross-incident).
 *
 * The scoping workstream for every live incident in one place: PII/purpose/
 * processor impact mapping, the closed affected-cohort snapshot, and — most
 * importantly — the processor confirmations that are still outstanding. Acting
 * on any of these opens that incident's workspace, so this is the queue, not a
 * parallel editor.
 */
export default async function BreachInvestigationPage() {
  const incidents = await db.breachIncident.findMany({
    where: { status: { notIn: ["closed"] } },
    include: { entity: { select: { name: true } }, impacts: true, processorThreads: true, cohorts: { orderBy: { snapshotTakenAt: "desc" } } },
    orderBy: { detectedAt: "desc" },
  });

  const rows = incidents.map((i) => {
    const awaiting = i.processorThreads.filter((t) => t.responseReceivedAt && !t.fiduciaryConfirmed);
    return {
      i,
      impacts: i.impacts.length,
      cohort: i.cohorts[0] ? { count: i.cohorts[0].count, takenAt: formatDate(i.cohorts[0].snapshotTakenAt) } : null,
      threads: i.processorThreads,
      awaiting,
    };
  });

  // The one truly actionable thing on this screen: processor responses that came
  // back but have NOT been explicitly confirmed by the fiduciary.
  const awaitingConfirmation = rows.flatMap((r) =>
    r.awaiting.map((t) => ({ incidentId: r.i.id, reference: r.i.reference, processorName: t.processorName, responseAt: t.responseReceivedAt ? formatDate(t.responseReceivedAt) : null })),
  );
  const cohortsPending = rows.filter((r) => !r.cohort).length;

  return (
    <Shell active="/breach/investigation" title="Breach Management / Investigation">
      <PageHead
        title="Investigation"
        titleTip="Scoping the breach across every open incident: what data and whose (impact map + affected-cohort snapshot), and which processors were involved (outreach → response → fiduciary confirmation). Acting opens the incident workspace."
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Incidents in investigation" value={rows.length} tone={rows.length ? "yellow" : undefined} />
        <Stat label="Processor confirmations awaiting" value={awaitingConfirmation.length} tone={awaitingConfirmation.length ? "red" : undefined} />
        <Stat label="Cohorts not yet snapshotted" value={cohortsPending} tone={cohortsPending ? "yellow" : undefined} />
      </div>

      {awaitingConfirmation.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="warn" title={`${awaitingConfirmation.length} processor response${awaitingConfirmation.length === 1 ? "" : "s"} awaiting fiduciary confirmation`}>
            A processor replying is not the same as the fiduciary confirming remediation — each must be confirmed explicitly.
            <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {awaitingConfirmation.map((a, n) => (
                <li key={n} style={{ marginBottom: 3 }}>
                  <Link href={`/breach/incidents/${a.incidentId}`} className="row-link mono">{a.reference}</Link>
                  {" — "}<strong>{a.processorName}</strong> responded {a.responseAt ?? ""} · confirm in the incident&apos;s Processor tab
                </li>
              ))}
            </ul>
          </Notice>
        </div>
      )}

      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Impact map</th>
              <th>Processors</th>
              <th>Affected cohort</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ i, impacts, cohort, threads, awaiting }) => (
              <tr key={i.id}>
                <td>
                  <Link href={`/breach/incidents/${i.id}`} className="row-link mono">{i.reference}</Link>
                  <div className="cell-sub">{i.entity?.name ?? "Entity not set"} · detected {formatDate(i.detectedAt)}</div>
                </td>
                <td><Pill tone={SEVERITY_TONE[i.severity]}>{i.severity}</Pill></td>
                <td><Pill tone={i.status === "triage" ? "gray" : "blue"} dot={false}>{BREACH_STATUS_LABEL[i.status] ?? i.status}</Pill></td>
                <td>
                  <div className="cell-stack">
                    <span>{impacts > 0 ? `${impacts} element${impacts === 1 ? "" : "s"} mapped` : <em className="cell-sub">none mapped</em>}</span>
                    {i.isProcessorCaused && <Chip>Processor-caused</Chip>}
                  </div>
                </td>
                <td>
                  <div className="cell-stack">
                    {threads.length === 0 && <span className="cell-sub">—</span>}
                    {threads.length > 0 && (
                      <>
                        <span className="cell-sub">{threads.length} thread{threads.length === 1 ? "" : "s"}</span>
                        {awaiting.length > 0
                          ? <Pill tone="yellow" dot={false}>{awaiting.length} awaiting confirmation</Pill>
                          : <Pill tone="green" dot={false}>all confirmed</Pill>}
                      </>
                    )}
                  </div>
                </td>
                <td>
                  {cohort
                    ? <div className="cell-stack"><span>{cohort.count.toLocaleString()} principals</span><span className="cell-sub">snapshot {cohort.takenAt}</span></div>
                    : <Pill tone="yellow" dot={false}>not snapshotted</Pill>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6}><div className="empty">No incidents are currently under investigation.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
