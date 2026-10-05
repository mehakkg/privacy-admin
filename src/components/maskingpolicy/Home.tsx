import Link from "next/link";
import { ShieldCheck, Clock, AlertTriangle } from "lucide-react";
import { getHome, getActiveVersion, getDraft, getGrid } from "@/lib/engines/maskingpolicy";
import { StartDraftButton, ContinueDraftButton, DiscardDraftButton, RestoreButton } from "@/components/maskingpolicy/PolicyActions";
import { PreviewPanel } from "@/components/maskingpolicy/PreviewPanel";

const BASE = "/data-flow/masking-policy";

export async function Home({ activated }: { activated?: number }) {
  const [home, active, draft] = await Promise.all([getHome(), getActiveVersion(), getDraft()]);
  const [liveView, draftView] = await Promise.all([
    active ? getGrid(active.id) : Promise.resolve(null),
    draft ? getGrid(draft.id) : Promise.resolve(null),
  ]);

  return (
    <div className="stack" style={{ gap: 18, maxWidth: 1000 }}>
      {activated != null && (
        <div className="mp-activated-banner">
          <div><ShieldCheck size={16} /> <strong>Version {activated} is live.</strong></div>
          <div className="row" style={{ gap: 8 }}>
            {activated > 1 && <RestoreButton number={activated - 1} />}
          </div>
        </div>
      )}

      {/* Status block */}
      <section className="mp-card">
        {home.active ? (
          <div className="stack" style={{ gap: 6 }}>
            <div className="row" style={{ gap: 8, alignItems: "center" }}><ShieldCheck size={18} style={{ color: "var(--green)" }} /><h3 style={{ margin: 0 }}>Version {home.active.number} is protecting all your applications.</h3></div>
            <p className="cell-sub" style={{ margin: 0 }}>Activated by {home.active.activatedBy} · {home.active.activatedAt}. {home.active.whyNote}</p>
            {home.active.impact && <p className="cell-sub" style={{ margin: 0 }}>{home.active.impact}</p>}
          </div>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            <h3 style={{ margin: 0 }}>Your applications aren&rsquo;t using a masking policy yet.</h3>
            <p className="cell-sub" style={{ margin: 0 }}>Every sensitive field is fully hidden. That is the safe default.</p>
            <div><StartDraftButton label="Review recommended policy" /></div>
          </div>
        )}
      </section>

      {/* Draft block */}
      {home.draft ? (
        <section className="mp-card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div className="stack" style={{ gap: 2 }}>
              <strong>Draft version {home.draft.number} · based on version {home.draft.basedOn ?? "—"}</strong>
              <span className="cell-sub">{home.draft.changes} change{home.draft.changes === 1 ? "" : "s"}</span>
            </div>
            <div className="row" style={{ gap: 8 }}><ContinueDraftButton /><DiscardDraftButton /></div>
          </div>
        </section>
      ) : home.active ? (
        <section className="mp-card"><div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}><span className="cell-sub">No draft in progress.</span><StartDraftButton /></div></section>
      ) : null}

      {/* Needs attention */}
      {home.needsAttention.length > 0 && (
        <section className="mp-card">
          <h4 className="mp-card-h">Needs attention</h4>
          <div className="stack" style={{ gap: 4 }}>
            {home.needsAttention.map((a) => {
              const href = a.link?.startsWith("/") ? a.link : a.link === "decisions" ? `${BASE}?view=workspace` : `${BASE}?view=workspace`;
              return <Link key={a.id} href={href} className="mp-attn"><AlertTriangle size={14} style={{ color: "var(--yellow)" }} /> {a.label}</Link>;
            })}
          </div>
        </section>
      )}

      {/* View as (read-only) */}
      <section className="mp-card">
        <h4 className="mp-card-h">View as</h4>
        <PreviewPanel draft={draftView} live={liveView} startVersion="live" />
      </section>

      {/* Version timeline */}
      <section className="mp-card">
        <h4 className="mp-card-h">Version history</h4>
        <div className="table-wrap"><table className="dtable compact">
          <thead><tr><th>Version</th><th>State</th><th>Activated</th><th>Why</th><th>Impact</th><th /></tr></thead>
          <tbody>
            {home.timeline.map((v) => (
              <tr key={v.number}>
                <td><strong>v{v.number}</strong></td>
                <td><span className={`mp-state ${v.state}`}>{v.state}</span></td>
                <td className="cell-sub">{v.who ?? "—"}{v.when ? ` · ${v.when}` : ""}</td>
                <td className="cell-sub">{v.why ?? "—"}</td>
                <td className="cell-sub">{v.impact ?? "—"}</td>
                <td>
                  <div className="row" style={{ gap: 8 }}>
                    <Link href={`${BASE}?version=${v.number}`} className="row-link">View</Link>
                    {home.draft ? <span className="cell-sub" title="A draft already exists">Restore unavailable</span> : <RestoreButton number={v.number} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {home.draft && <p className="cell-sub" style={{ marginTop: 6 }}>A draft already exists, so Restore is unavailable. <Link href={`${BASE}?view=workspace`} className="row-link">Continue editing</Link>.</p>}
      </section>
    </div>
  );
}
