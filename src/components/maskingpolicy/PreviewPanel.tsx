"use client";

import { useState } from "react";
import type { GridView } from "@/lib/engines/maskingpolicy";

/**
 * "View as" — a made-up customer record rendered for a chosen audience, channel
 * and version. In Draft view, values that differ from Live are marked and show
 * what they were. Clicking a value emits onField (the grid highlights it).
 */
export function PreviewPanel({ draft, live, startVersion = draft ? "draft" : "live", startAudience = "Everyone", onField }: { draft: GridView | null; live: GridView | null; startVersion?: "draft" | "live"; startAudience?: string; onField?: (code: string) => void }) {
  const [version, setVersion] = useState<"draft" | "live">(startVersion);
  const [audience, setAudience] = useState(startAudience);
  const [channel, setChannel] = useState("Any");
  const [compare, setCompare] = useState<string | null>(null);

  const view = version === "draft" ? draft : live;
  const audiences = ["Everyone", ...((view?.audiences ?? []).map((a) => a.label))];
  const NOT_SPECIFIED = "Channel not specified";
  const channels = [NOT_SPECIFIED, ...((view?.channels ?? []).map((c) => c.label))];

  const valueFor = (v: GridView | null, code: string, audLabel: string, chan: string): string => {
    if (!v) return "No policy · fully hidden";
    const row = v.rows.find((r) => r.code === code);
    if (!row) return "—";
    if (audLabel === "Everyone") return row.baseline.example;
    const aud = v.audiences.find((a) => a.label === audLabel);
    const cell = aud ? row.audiences.find((x) => x.audienceId === aud.id) : null;
    if (!cell || cell.kind === "same" || cell.kind === "not_used" || !cell.grant) return row.baseline.example;
    const selId = chan === NOT_SPECIFIED ? null : v.channels.find((c) => c.label === chan)?.id ?? null;
    const applies = cell.grant.channelIds.length === 0 || (selId != null && cell.grant.channelIds.includes(selId));
    return applies ? cell.example : row.baseline.example;
  };

  const rows = (view?.rows ?? live?.rows ?? draft?.rows ?? []);

  return (
    <div className="mp-preview">
      <div className="mp-preview-controls">
        <label className="fld"><span>Audience</span><select className="input sm" value={audience} onChange={(e) => setAudience(e.target.value)}>{audiences.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
        <label className="fld"><span>Channel</span><select className="input sm" value={channel} onChange={(e) => setChannel(e.target.value)}>{channels.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className="fld"><span>Version</span>
          <select className="input sm" value={version} onChange={(e) => setVersion(e.target.value as "draft" | "live")}>
            {draft && <option value="draft">Draft</option>}
            <option value="live">{live ? "Live" : "No policy · fully hidden"}</option>
          </select>
        </label>
      </div>

      <div className="table-wrap"><table className="dtable compact">
        <thead><tr><th>Field</th><th>{audience}</th>{compare && <th>{compare}</th>}</tr></thead>
        <tbody>
          {rows.map((r) => {
            const now = valueFor(view, r.code, audience, channel);
            const liveVal = live ? valueFor(live, r.code, audience, channel) : "fully hidden";
            const changed = version === "draft" && live && now !== liveVal;
            return (
              <tr key={r.code}>
                <td><button className="plain-link mp-prev-field" onClick={() => onField?.(r.code)}>{r.displayName}</button></td>
                <td className="mono">
                  {now}
                  {changed && <span className="mp-was"> · was {liveVal}</span>}
                </td>
                {compare && <td className="mono">{valueFor(view, r.code, compare, channel)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table></div>

      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        {compare ? <button className="link-btn" onClick={() => setCompare(null)}>Remove comparison</button>
          : <select className="input sm" value="" onChange={(e) => e.target.value && setCompare(e.target.value)}><option value="">Compare with…</option>{audiences.filter((a) => a !== audience).map((a) => <option key={a} value={a}>{a}</option>)}</select>}
        <span className="cell-sub">These values are made up.</span>
      </div>
    </div>
  );
}
