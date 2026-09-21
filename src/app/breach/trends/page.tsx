import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, Stat, Pill } from "@/components/ui";
import { SEVERITY_TONE, NOTIFY_WINDOW_HOURS } from "@/lib/breach";

export const dynamic = "force-dynamic";

/** SCREEN 7 — Breach Trends. New breach-specific reporting: severity/type mix,
 *  average time-to-notify, and 72-hour SLA compliance. */
export default async function BreachTrendsPage() {
  const incidents = await db.breachIncident.findMany({ include: { boardPackage: true } });

  const bySeverity = incidents.reduce((m, i) => { m[i.severity] = (m[i.severity] ?? 0) + 1; return m; }, {} as Record<string, number>);
  const byCategory = incidents.reduce((m, i) => { const k = i.category || "Uncategorized"; m[k] = (m[k] ?? 0) + 1; return m; }, {} as Record<string, number>);

  const notified = incidents.filter((i) => i.boardPackage?.submittedAt);
  const hoursToNotify = notified.map((i) => (i.boardPackage!.submittedAt!.getTime() - i.detectedAt.getTime()) / 3_600_000);
  const avgTtn = hoursToNotify.length ? Math.round(hoursToNotify.reduce((a, b) => a + b, 0) / hoursToNotify.length) : null;
  const onTime = hoursToNotify.filter((h) => h <= NOTIFY_WINDOW_HOURS).length;
  const slaRate = notified.length ? Math.round((onTime / notified.length) * 100) : null;

  const maxSev = Math.max(1, ...Object.values(bySeverity));
  const maxCat = Math.max(1, ...Object.values(byCategory));

  return (
    <Shell active="/breach/trends" title="Breach Management / Trends">
      <PageHead title="Breach trends" titleTip="Breach-specific reporting: incident mix by severity and type, average time from detection to Board notification, and 72-hour SLA compliance." />

      <div className="stat-row">
        <Stat label="Total incidents" value={incidents.length} />
        <Stat label="Avg time to notify" value={avgTtn === null ? "—" : `${avgTtn}h`} />
        <Stat label="72h SLA compliance" value={slaRate === null ? "—" : `${slaRate}%`} tone={slaRate === null ? undefined : slaRate >= 100 ? "green" : slaRate >= 80 ? "yellow" : "red"} />
        <Stat label="Notified to Board" value={notified.length} />
      </div>

      <div className="row" style={{ gap: 16, flexWrap: "wrap", marginTop: 8 }}>
        <div className="trend-card">
          <div className="section-label">By severity</div>
          {(["critical", "high", "medium", "low"] as const).map((s) => (
            <div key={s} className="trend-bar-row"><span className="trend-bar-label"><Pill tone={SEVERITY_TONE[s]}>{s}</Pill></span><span className="trend-bar"><span style={{ width: `${((bySeverity[s] ?? 0) / maxSev) * 100}%`, background: s === "critical" || s === "high" ? "var(--red)" : s === "medium" ? "var(--yellow)" : "var(--text-3)" }} /></span><span className="trend-bar-num">{bySeverity[s] ?? 0}</span></div>
          ))}
        </div>
        <div className="trend-card">
          <div className="section-label">By category</div>
          {Object.entries(byCategory).map(([k, v]) => (
            <div key={k} className="trend-bar-row"><span className="trend-bar-label cell-sub">{k}</span><span className="trend-bar"><span style={{ width: `${(v / maxCat) * 100}%`, background: "var(--blue)" }} /></span><span className="trend-bar-num">{v}</span></div>
          ))}
          {Object.keys(byCategory).length === 0 && <p className="cell-sub">No incidents yet.</p>}
        </div>
      </div>

      <div className="trend-card" style={{ marginTop: 16 }}>
        <div className="section-label">Notifications — on time vs overdue</div>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="dtable"><thead><tr><th>Incident</th><th>Detected → submitted</th><th>Within 72h?</th></tr></thead>
            <tbody>
              {notified.map((i) => { const h = (i.boardPackage!.submittedAt!.getTime() - i.detectedAt.getTime()) / 3_600_000; return (
                <tr key={i.id}><td className="cell-primary">{i.reference}</td><td className="cell-sub">{Math.round(h)}h</td><td>{h <= NOTIFY_WINDOW_HOURS ? <Pill tone="green" dot={false}>On time</Pill> : <Pill tone="red">Overdue</Pill>}</td></tr>
              ); })}
              {notified.length === 0 && <tr><td colSpan={3}><div className="empty" style={{ padding: 12 }}>No Board notifications submitted yet.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
