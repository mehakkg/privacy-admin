import Link from "next/link";
import { Lock } from "lucide-react";
import { getVersionByNumber, getGrid, getDraft } from "@/lib/engines/maskingpolicy";
import { RestoreButton } from "@/components/maskingpolicy/PolicyActions";
import { PreviewPanel } from "@/components/maskingpolicy/PreviewPanel";

const BASE = "/data-flow/masking-policy";

export async function VersionView({ number }: { number: number }) {
  const v = await getVersionByNumber(number);
  if (!v) return <div className="mp-card"><p>No such version. <Link href={BASE} className="row-link">Back to Masking Policy</Link></p></div>;
  const [grid, draft] = await Promise.all([getGrid(v.id), getDraft()]);
  if (!grid) return null;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div className="stack" style={{ gap: 2 }}>
          <h2 style={{ margin: 0 }}>Version {v.number} · <span className={`mp-state ${v.state}`}>{v.state}</span> · Read-only</h2>
          <span className="cell-sub">{v.activatedBy ? `Activated by ${v.activatedBy}` : "Never activated"}{v.activatedAt ? ` · ${new Date(v.activatedAt).toISOString().slice(0, 10)}` : ""}{v.whyNote ? ` · ${v.whyNote}` : ""}</span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {draft ? <span className="cell-sub">A draft exists — restore unavailable.</span> : <RestoreButton number={v.number} />}
          <Link href={BASE} className="btn">Back to Masking Policy</Link>
        </div>
      </div>

      <div className="mp-workspace">
        <div className="mp-workspace-main">
          <div className="table-wrap"><table className="dtable mp-grid">
            <thead><tr><th>Field</th><th>Everyone sees</th>{grid.audiences.map((a) => <th key={a.id}>{a.label}</th>)}</tr></thead>
            <tbody>
              {grid.categories.map((cat) => (
                <>
                  <tr key={cat.id} className="mp-cat-row"><td colSpan={2 + grid.audiences.length}><strong>{cat.name}</strong> <span className="cell-sub">{cat.definition}</span></td></tr>
                  {grid.rows.filter((r) => r.categoryId === cat.id).map((r) => (
                    <tr key={r.code}>
                      <td><div className="cell-stack"><span className="cell-primary">{r.displayName}</span><span className="cell-sub mono">{r.code}</span></div></td>
                      <td><span className="mono">{r.baseline.example}</span></td>
                      {r.audiences.map((c) => (
                        <td key={c.audienceId}>
                          {c.kind === "same" ? <span className="cell-sub">Same</span> : c.kind === "locked" ? <span className="row" style={{ gap: 4 }}><Lock size={11} /> <span className="mono">{c.example}</span></span> : c.kind === "not_used" ? <span className="cell-sub">—</span> : <span className="mono">{c.example}{c.channelLabel && <span className="mp-chan">{c.channelLabel}</span>}</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table></div>
        </div>
        <aside className="mp-workspace-side">
          <div className="mp-card"><h4 className="mp-card-h">View as</h4><PreviewPanel draft={null} live={grid} startVersion="live" /></div>
        </aside>
      </div>
    </div>
  );
}
