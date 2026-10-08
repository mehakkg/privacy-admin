"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { X, Search, ChevronRight, ChevronDown } from "lucide-react";
import { SENS_TONE } from "@/lib/inventory";
import { getPurposeDataAction, getDataPickerAction, addDataAction, removeDataAction, acceptSuggestedDataAction, acceptAllSuggestedDataAction } from "@/app/actions/activityData";
import type { PurposeDataView, DataPickerView, DataRow } from "@/lib/engines/activityData";

/** SCREEN 6 — Data section of a purpose pane. */
export function DataSection({ activityId, purposeId, purposeName }: { activityId: string; purposeId: string; purposeName: string }) {
  const [data, setData] = useState<PurposeDataView | null>(null);
  const [picker, setPicker] = useState(false);
  const [, start] = useTransition();
  const load = () => getPurposeDataAction(activityId, purposeId).then(setData);
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activityId, purposeId]);

  const act = (fn: () => Promise<unknown>) => start(async () => { await fn(); await load(); });
  const confirmed = data?.rows.filter((r) => r.state === "confirmed").length ?? 0;

  // Group by system.
  const groups = new Map<string, DataRow[]>();
  for (const r of data?.rows ?? []) (groups.get(r.system) ?? groups.set(r.system, []).get(r.system)!).push(r);

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="inv-sec-h" style={{ margin: 0 }}>Data <span className="cell-sub">{confirmed} field{confirmed === 1 ? "" : "s"}</span></div>
        <div className="row" style={{ gap: 12 }}>
          {(data?.suggestedCount ?? 0) > 0 && <button className="link-btn" onClick={() => act(() => acceptAllSuggestedDataAction(activityId, purposeId))}>Accept all suggested ({data!.suggestedCount})</button>}
          <button className="btn ghost sm" onClick={() => setPicker(true)}>Add data</button>
        </div>
      </div>

      {data && !data.approved && <div className="cell-sub" style={{ fontStyle: "italic" }}>These links take effect when the purpose is approved.</div>}

      {!data ? <span className="cell-sub">Loading…</span> : data.rows.length === 0 ? (
        <div className="notice info" style={{ margin: 0 }}>No data yet. Add the fields this purpose uses, or accept suggestions. <button className="link-btn" onClick={() => setPicker(true)}>Add data</button></div>
      ) : (
        [...groups.entries()].map(([system, rows]) => (
          <div key={system} className="stack" style={{ gap: 2 }}>
            <div className="cell-sub" style={{ fontWeight: 600, marginTop: 6 }}>{system} · {rows.length} field{rows.length === 1 ? "" : "s"}</div>
            {rows.map((r) => {
              const tone = SENS_TONE[r.sensitivity] ?? SENS_TONE["Not classified"];
              return (
                <div key={r.linkId} className="pa-data-row">
                  <span className="mono" style={{ minWidth: 220 }}>{r.path}</span>
                  <span className="cell-sub" style={{ minWidth: 90 }}>{r.dataType}</span>
                  <span className={`inv-sens ${tone.cls}`}><span className="dot" style={{ background: tone.dot }} />{r.sensitivity}</span>
                  <span className="row" style={{ gap: 8, marginLeft: "auto" }}>
                    {r.state === "suggested" ? (
                      <><span className="sev-accent">Suggested</span><button className="link-btn" onClick={() => act(() => acceptSuggestedDataAction(activityId, r.linkId, purposeId))}>Accept</button><button className="link-btn" onClick={() => act(() => removeDataAction(activityId, r.linkId, purposeId))}>Remove</button></>
                    ) : !data.approved ? (
                      <><span className="cell-sub">Inactive</span><button className="link-btn" onClick={() => act(() => removeDataAction(activityId, r.linkId, purposeId))}>Remove</button></>
                    ) : (
                      <button className="link-btn" onClick={() => act(() => removeDataAction(activityId, r.linkId, purposeId))}>Remove</button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ))
      )}

      {picker && <DataPicker activityId={activityId} purposeId={purposeId} purposeName={purposeName} onClose={() => setPicker(false)} onAdded={() => { setPicker(false); load(); }} />}
    </div>
  );
}

function DataPicker({ activityId, purposeId, purposeName, onClose, onAdded }: { activityId: string; purposeId: string; purposeName: string; onClose: () => void; onAdded: () => void }) {
  const [view, setView] = useState<DataPickerView | null>(null);
  const [tab, setTab] = useState<"suggested" | "browse">("suggested");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { getDataPickerAction(activityId, purposeId).then((v) => { setView(v); setTab(v.suggested.length ? "suggested" : "browse"); }); }, [activityId, purposeId]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const add = () => start(async () => { await addDataAction(activityId, purposeId, [...sel]); onAdded(); });

  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="modal std-modal" role="dialog" aria-modal="true" aria-label={`Add data to ${purposeName}`} style={{ width: 720, maxWidth: "94vw", maxHeight: "85vh" }}>
        <div className="std-modal-head"><h3 style={{ margin: 0 }}>Add data to {purposeName}</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="std-modal-body">
          <div className="row" style={{ gap: 10, marginBottom: 10, alignItems: "center" }}>
            <div className="mp-segment"><button className={tab === "suggested" ? "on" : ""} onClick={() => setTab("suggested")}>Suggested</button><button className={tab === "browse" ? "on" : ""} onClick={() => setTab("browse")}>Browse</button></div>
            {tab === "browse" && <div className="inv-search" style={{ flex: 1 }}><Search size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search fields" /></div>}
          </div>
          {!view ? <span className="cell-sub">Loading…</span> : tab === "suggested" ? (
            view.suggested.length === 0 ? <span className="cell-sub">No suggestions. Use Browse to add fields.</span> : (
              <div className="stack" style={{ gap: 4 }}>
                <div className="row" style={{ justifyContent: "flex-end" }}><button className="link-btn" onClick={() => setSel(new Set(view.suggested.map((f) => f.id)))}>Add all {view.suggested.length}</button></div>
                {view.suggested.map((f) => { const tone = SENS_TONE[f.sensitivity] ?? SENS_TONE["Not classified"]; return (
                  <label key={f.id} className="pa-data-row" style={{ cursor: "pointer" }}><input type="checkbox" checked={sel.has(f.id)} onChange={() => toggle(f.id)} /><span className="mono" style={{ minWidth: 200 }}>{f.path}</span><span className="cell-sub">{f.dataType}</span><span className={`inv-sens ${tone.cls}`}><span className="dot" style={{ background: tone.dot }} />{f.sensitivity}</span><span className="cell-sub" style={{ marginLeft: "auto" }}>{f.reason}</span></label>
                ); })}
              </div>
            )
          ) : (
            <div className="stack" style={{ gap: 2 }}>
              {view.systems.map((sysn) => {
                const tables = sysn.tables.map((t) => ({ ...t, fields: t.fields.filter((f) => f.path.toLowerCase().includes(q.toLowerCase())) })).filter((t) => t.fields.length);
                if (!tables.length) return null;
                const sysOpen = open.has(sysn.name);
                return (
                  <div key={sysn.name}>
                    <button className="pa-browse-h" onClick={() => setOpen((s) => { const n = new Set(s); n.has(sysn.name) ? n.delete(sysn.name) : n.add(sysn.name); return n; })}>{sysOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<strong>{sysn.name}</strong><span className="cell-sub">{tables.reduce((n, t) => n + t.fields.length, 0)} fields</span></button>
                    {sysOpen && tables.map((t) => (
                      <div key={t.name} style={{ marginLeft: 18 }}>
                        <div className="cell-sub" style={{ fontWeight: 600, margin: "4px 0" }}>{t.name} · {t.fields.length}</div>
                        {t.fields.map((f) => { const tone = SENS_TONE[f.sensitivity] ?? SENS_TONE["Not classified"]; return (
                          <label key={f.id} className="pa-data-row" style={{ cursor: "pointer" }}><input type="checkbox" checked={sel.has(f.id)} onChange={() => toggle(f.id)} /><span className="mono" style={{ minWidth: 200 }}>{f.path}</span><span className="cell-sub">{f.dataType}</span><span className={`inv-sens ${tone.cls}`}><span className="dot" style={{ background: tone.dot }} />{f.sensitivity}</span></label>
                        ); })}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="std-modal-foot"><span className="cell-sub">{sel.size} selected</span><div className="row" style={{ gap: 8 }}><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={pending || sel.size === 0} onClick={add}>Add {sel.size} field{sel.size === 1 ? "" : "s"}</button></div></div>
      </div>
    </div>, document.body);
}
