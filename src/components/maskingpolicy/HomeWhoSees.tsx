"use client";

import { useState } from "react";
import { PreviewDrawer } from "@/components/maskingpolicy/PreviewDrawer";
import type { GridView } from "@/lib/engines/maskingpolicy";

/**
 * Home "Who sees what": audience chips + the made-up record directly below for
 * the selected chip. Values that differ from Everyone are called out in words.
 * No dropdowns here — the full controls live in the preview drawer.
 */
export function HomeWhoSees({ view, startAudience = "Everyone" }: { view: GridView | null; startAudience?: string }) {
  const [aud, setAud] = useState(startAudience);
  if (!view) return <p className="cell-sub">No active policy — every field is fully hidden.</p>;
  const chips = ["Everyone", ...view.audiences.map((a) => a.label)];
  const audObj = view.audiences.find((a) => a.label === aud) ?? null;

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {chips.map((c) => <button key={c} className={`mp-filterchip${aud === c ? " on" : ""}`} onClick={() => setAud(c)}>{c}</button>)}
      </div>
      <div className="table-wrap"><table className="dtable compact"><tbody>
        {view.rows.map((r) => {
          const cell = audObj ? r.audiences.find((x) => x.audienceId === audObj.id) : null;
          const sees = cell && cell.kind === "full_raw" ? "sees the full value" : cell && cell.kind === "more" ? "sees more" : null;
          const value = cell && (cell.kind === "more" || cell.kind === "full_raw") ? cell.example : r.baseline.example;
          return (
            <tr key={r.code}>
              <td>{r.displayName}</td>
              <td className="mono">{value}</td>
              <td className="cell-sub">{sees ?? ""}</td>
            </tr>
          );
        })}
      </tbody></table></div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <PreviewDrawer draft={null} live={view} label="Open full preview" startVersion="live" startAudience={aud} />
        <span className="cell-sub">These values are made up.</span>
      </div>
    </div>
  );
}
