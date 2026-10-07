"use client";

import { useEffect, useState } from "react";
import { Lock, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { PreviewDrawer } from "@/components/maskingpolicy/PreviewDrawer";
import type { GridView } from "@/lib/engines/maskingpolicy";

const NOT_SPECIFIED = "Channel not specified";

/** "What version N does" — audience list (left) + the made-up record (right).
 *  Selection persists in the URL (aud, chan). Read-only. */
export function WhatVersionDoes({ view, number, startAudience, startChannel }: { view: GridView; number: number; startAudience?: string; startChannel?: string }) {
  const [aud, setAud] = useState(startAudience || "Everyone");
  const [chan, setChan] = useState(startChannel || NOT_SPECIFIED);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(view.categories.length > 0 && view.rows.length > 16 ? view.categories.slice(1).map((c) => c.id) : []));

  // persist selection in the URL
  useEffect(() => {
    const u = new URL(window.location.href);
    aud === "Everyone" ? u.searchParams.delete("aud") : u.searchParams.set("aud", aud);
    chan === NOT_SPECIFIED ? u.searchParams.delete("chan") : u.searchParams.set("chan", chan);
    window.history.replaceState(null, "", u.toString());
  }, [aud, chan]);

  const audObj = view.audiences.find((a) => a.label === aud) ?? null;
  const isEveryone = aud === "Everyone";
  const selChanId = chan === NOT_SPECIFIED ? null : view.channels.find((c) => c.label === chan)?.id ?? null;

  const summaryFor = (label: string): string => {
    if (label === "Everyone") return `${view.rows.filter((r) => r.status !== "not_used" && !r.baseline.hidden).length} fields masked`;
    const a = view.audiences.find((x) => x.label === label)!;
    const cells = view.rows.map((r) => r.audiences.find((c) => c.audienceId === a.id)!).filter((c) => c.kind === "more" || c.kind === "full_raw");
    if (cells.length === 0) return "Same as everyone";
    const full = cells.filter((c) => c.kind === "full_raw").length;
    const scoped = cells.filter((c) => (c.grant?.channelIds.length ?? 0) > 0).length;
    return `Sees more of ${cells.length} field${cells.length === 1 ? "" : "s"}${full ? ` · ${full} full value` : ""}${scoped ? ` · ${scoped} on one channel` : ""}`;
  };

  return (
    <section className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>What version {number} does</h3>
        <PreviewDrawer draft={null} live={view} label="Open full preview" startVersion="live" startAudience={aud} />
      </div>
      <div className="mp-wvd">
        <div className="mp-wvd-auds">
          {["Everyone", ...view.audiences.map((a) => a.label)].map((label) => {
            const sum = summaryFor(label);
            const hasFull = sum.includes("full value");
            return (
              <button key={label} className={`mp-wvd-aud${aud === label ? " on" : ""}`} aria-pressed={aud === label} onClick={() => setAud(label)}>
                <span className="cell-primary">{label}</span>
                <span className="cell-sub row" style={{ gap: 4, alignItems: "center" }}>{hasFull && <AlertTriangle size={11} style={{ color: "var(--yellow-700, #b45309)" }} />}{sum}</span>
              </button>
            );
          })}
        </div>
        <div className="mp-wvd-record">
          <div className="mp-wvd-rechead">Customer #1 (made up), as {aud}</div>
          {!isEveryone && view.channels.length > 0 && (
            <div className="stack" style={{ gap: 4, marginBottom: 8 }}>
              <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}><span className="cell-sub">Channel</span>{[NOT_SPECIFIED, ...view.channels.map((c) => c.label)].map((c) => <button key={c} className={`mp-filterchip${chan === c ? " on" : ""}`} onClick={() => setChan(c)}>{c}</button>)}</div>
              <span className="cell-sub">When an application doesn&rsquo;t send a channel, only grants that apply on any channel take effect.</span>
            </div>
          )}
          {isEveryone && view.channels.length > 0 && <span className="cell-sub">Everyone sees the same on every channel. Channels only change what an audience sees beyond that.</span>}

          {isEveryone ? (
            <div className="stack" style={{ gap: 6, marginTop: 8 }}>
              {view.categories.map((cat) => {
                const isC = collapsed.has(cat.id);
                const members = view.rows.filter((r) => r.categoryId === cat.id && r.status !== "not_used");
                if (members.length === 0) return null;
                return (
                  <div key={cat.id}>
                    <button className="mp-catgroup-head" onClick={() => setCollapsed((s) => { const n = new Set(s); n.has(cat.id) ? n.delete(cat.id) : n.add(cat.id); return n; })} style={{ width: "100%", justifyContent: "space-between" }}>
                      <span className="row" style={{ gap: 6 }}><strong>{cat.name}</strong><span className="cell-sub">{members.length} fields{cat.regulatedCount ? ` · ${cat.regulatedCount} protected by law` : ""}</span></span>
                      {isC ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {!isC && members.map((r) => (
                      <div key={r.code} className="mp-rec-row">
                        <span className="row" style={{ gap: 5, alignItems: "center", flex: 1 }}>{r.regulated && <Lock size={11} />}{r.displayName}</span>
                        <span className="cell-sub">{r.baseline.choiceLabel}</span>
                        <span className="mono">{r.baseline.example}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            <AudienceRecord view={view} audObj={audObj!} selChanId={selChanId} />
          )}
          <div className="cell-sub" style={{ marginTop: 10 }}>Values are made up.</div>
        </div>
      </div>
    </section>
  );
}

function AudienceRecord({ view, audObj, selChanId }: { view: GridView; audObj: { id: string }; selChanId: string | null }) {
  const [sameOpen, setSameOpen] = useState(false);
  const cells = view.rows.map((r) => ({ r, c: r.audiences.find((x) => x.audienceId === audObj.id)! }));
  const more = cells.filter(({ c }) => c.kind === "more" || c.kind === "full_raw");
  const same = cells.filter(({ c }) => c.kind === "same" || c.kind === "locked");
  return (
    <div className="stack" style={{ gap: 8, marginTop: 8 }}>
      <div className="mp-group-h">Sees more than everyone</div>
      {more.length === 0 ? <p className="cell-sub">No exceptions.</p> : more.map(({ r, c }) => {
        const applies = c.grant && (c.grant.channelIds.length === 0 || (selChanId != null && c.grant.channelIds.includes(selChanId)));
        const note = c.kind === "full_raw" ? "sees the full value" : applies ? (c.channelLabel ? `sees more, only on ${c.channelLabel}` : "sees more") : `sees more only on ${c.channelLabel}`;
        return (
          <div key={r.code} className="mp-rec-row">
            <span style={{ flex: 1 }}>{r.displayName}</span>
            <span className="mono">{applies ? c.example : r.baseline.example}</span>
            <span className={`cell-sub${c.kind === "full_raw" ? " mp-warn" : ""}`}>{note}</span>
          </div>
        );
      })}
      <button className="mp-catgroup-head" onClick={() => setSameOpen((o) => !o)}>{sameOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<strong>Same as everyone · {same.length} fields</strong></button>
      {sameOpen && same.map(({ r }) => <div key={r.code} className="mp-rec-row"><span style={{ flex: 1 }}>{r.displayName}</span><span className="mono">{r.baseline.example}</span><span /></div>)}
    </div>
  );
}
