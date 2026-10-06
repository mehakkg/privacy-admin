"use client";

import { useState } from "react";
import { PreviewDrawer } from "@/components/maskingpolicy/PreviewDrawer";
import type { GridView } from "@/lib/engines/maskingpolicy";

const NOT_SPECIFIED = "Channel not specified";

/**
 * Home "Who sees what": audience chips + the record below. A second "Channel" row
 * appears only when channels exist and the audience isn't Everyone. Values that
 * differ are called out in words; a grant that doesn't apply on the chosen channel
 * shows the baseline with "sees more only on …".
 */
export function HomeWhoSees({ view, startAudience = "Everyone" }: { view: GridView | null; startAudience?: string }) {
  const [aud, setAud] = useState(startAudience);
  const [chan, setChan] = useState(NOT_SPECIFIED);
  if (!view) return <p className="cell-sub">No active policy — every field is fully hidden.</p>;
  const chips = ["Everyone", ...view.audiences.map((a) => a.label)];
  const audObj = view.audiences.find((a) => a.label === aud) ?? null;
  const isEveryone = aud === "Everyone";
  const showChannelRow = view.channels.length > 0 && !isEveryone;
  const selChanId = chan === NOT_SPECIFIED ? null : view.channels.find((c) => c.label === chan)?.id ?? null;

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {chips.map((c) => <button key={c} className={`mp-filterchip${aud === c ? " on" : ""}`} onClick={() => setAud(c)}>{c}</button>)}
      </div>
      {showChannelRow && (
        <div className="stack" style={{ gap: 4 }}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span className="cell-sub">Channel</span>
            {[NOT_SPECIFIED, ...view.channels.map((c) => c.label)].map((c) => <button key={c} className={`mp-filterchip${chan === c ? " on" : ""}`} onClick={() => setChan(c)}>{c}</button>)}
          </div>
          <span className="cell-sub">When an application doesn&rsquo;t send a channel, only grants that apply on any channel take effect.</span>
        </div>
      )}
      {isEveryone && view.channels.length > 0 && <span className="cell-sub">Everyone sees the same on every channel. Channels only change what an audience sees beyond that.</span>}

      <div className="table-wrap"><table className="dtable compact"><tbody>
        {view.rows.map((r) => {
          const cell = audObj ? r.audiences.find((x) => x.audienceId === audObj.id) : null;
          const g = cell?.grant ?? null;
          const applies = !!g && (g.channelIds.length === 0 || (selChanId != null && g.channelIds.includes(selChanId)));
          const sees = applies ? (cell!.kind === "full_raw" ? "sees the full value" : "sees more") : null;
          const value = applies ? cell!.example : r.baseline.example;
          const note = !applies && g && g.channelIds.length > 0 ? `sees more only on ${cell!.channelLabel}` : (sees ?? "");
          return (
            <tr key={r.code}>
              <td>{r.displayName}</td>
              <td className="mono">{value}</td>
              <td className="cell-sub">{note}</td>
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
