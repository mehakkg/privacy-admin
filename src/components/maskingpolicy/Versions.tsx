import Link from "next/link";
import { listVersions, getDraft } from "@/lib/engines/maskingpolicy";
import { RestoreButton } from "@/components/maskingpolicy/PolicyActions";

const MP = "/data-flow/masking-policy";

/** SCREEN 6 — All versions. Restore is replaced while a draft exists. */
export async function Versions() {
  const [versions, draft] = await Promise.all([listVersions(), getDraft()]);
  const rows = versions.filter((v) => v.state !== "draft");
  return (
    <div className="stack" style={{ gap: 14, maxWidth: 820 }}>
      <div><Link href={MP} className="row-link">← Back to Masking policy</Link></div>
      <h2 style={{ margin: 0 }}>All versions</h2>
      <div className="table-wrap"><table className="dtable compact">
        <thead><tr><th>Version</th><th>State</th><th>Activated</th><th>Reason</th><th>Impact</th><th /></tr></thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.number}>
              <td><strong>v{v.number}</strong></td>
              <td><span className={`mp-state ${v.state === "active" ? "active" : ""}`}>{v.state === "active" ? "Live" : "Archived"}</span></td>
              <td className="cell-sub">{v.activatedBy ?? "—"}{v.activatedAt ? ` · ${new Date(v.activatedAt).toISOString().slice(0, 10)}` : ""}</td>
              <td className="cell-sub">{v.whyNote ? `“${v.whyNote}”` : "—"}</td>
              <td className="cell-sub">{v.impactSummary ?? "—"}</td>
              <td>
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <Link href={`${MP}?version=${v.number}`} className="row-link">View</Link>
                  {draft ? <span className="cell-sub">Finish or discard draft {draft.number} first · <Link href={`${MP}?view=workspace`} className="row-link">Continue draft</Link></span> : <RestoreButton number={v.number} />}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
