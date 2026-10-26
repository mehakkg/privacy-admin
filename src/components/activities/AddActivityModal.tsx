"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { X, Lightbulb, LayoutTemplate, FilePlus2, Search } from "lucide-react";
import { getAddActivityDataAction, createActivityFromStartAction, type AddActivityData } from "@/app/actions/activities";

type Start = "blank" | "template" | "suggestion";

/**
 * Add activity — name-first, one screen. The fast path is: type a name and
 * Create (owner defaults to you, fiduciary to the only one). "Start from" is an
 * optional shortcut that pre-fills from a DLP suggestion or a template, not a
 * gate. On create you land in the detail pane, where the checklist does the rest.
 */
export function AddActivityModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string, start: Start) => void }) {
  const [data, setData] = useState<AddActivityData | null>(null);
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [entityId, setEntityId] = useState("");
  const [start, setStart] = useState<Start>("blank");
  const [ref, setRef] = useState<string | null>(null);
  const [tplQ, setTplQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTx] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { getAddActivityDataAction().then((d) => { setData(d); setOwner(d.currentUser); }); }, []);
  useEffect(() => { nameRef.current?.focus(); }, []);

  const owners = data ? [data.currentUser, "R. Iyer", "P. Shah", "A. Menon", "N. Rao", "S. Pillai", "L. Joshi", "K. Das"].filter((v, i, a) => v && a.indexOf(v) === i) : [];

  const pick = (s: Start) => { setStart(s); setRef(null); setErr(null); };
  const create = () => {
    if (name.trim().length < 3) { setErr("Give it a name of at least 3 characters."); nameRef.current?.focus(); return; }
    if (start !== "blank" && !ref) { setErr(start === "suggestion" ? "Choose a suggestion, or switch to Blank." : "Choose a template, or switch to Blank."); return; }
    if (data?.multiEntity && !entityId) { setErr("Choose a fiduciary."); return; }
    startTx(async () => {
      const r = await createActivityFromStartAction({ start, ref: ref ?? undefined, name, ownerName: owner, entityId: entityId || undefined });
      if (r.ok && r.id) onCreated(r.id, start); else setErr(r.error ?? "Couldn’t create.");
    });
  };

  const starts: { key: Start; icon: React.ReactNode; title: string }[] = [
    { key: "blank", icon: <FilePlus2 size={15} />, title: "Blank" },
    { key: "template", icon: <LayoutTemplate size={15} />, title: "Template" },
    { key: "suggestion", icon: <Lightbulb size={15} />, title: `Suggestion${data && data.suggestions.length ? ` (${data.suggestions.length})` : ""}` },
  ];

  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal std-modal md" role="dialog" aria-modal="true" aria-label="Add activity" style={{ maxHeight: "82vh" }}>
        <div className="std-modal-head"><h3 style={{ margin: 0 }}>Add an activity</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="std-modal-body stack" style={{ gap: 14 }}>
          <label className="fld"><span>Name</span><input ref={nameRef} className="input" value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") create(); }} placeholder="e.g. Retail loan origination" /></label>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <label className="fld" style={{ flex: "1 1 180px" }}><span>Owner</span><select className="input" value={owner} onChange={(e) => setOwner(e.target.value)}>{owners.map((u) => <option key={u} value={u}>{u}{u === data?.currentUser ? " (you)" : ""}</option>)}</select></label>
            {data?.multiEntity && <label className="fld" style={{ flex: "1 1 180px" }}><span>Fiduciary</span><select className="input" value={entityId} onChange={(e) => setEntityId(e.target.value)}><option value="">Choose…</option>{data.entities.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}</select></label>}
          </div>

          <div className="stack" style={{ gap: 8 }}>
            <span className="cell-sub">Start from <span style={{ opacity: 0.7 }}>— optional, to pre-fill</span></span>
            <div className="mp-segment" style={{ alignSelf: "flex-start" }}>
              {starts.map((s) => <button key={s.key} className={start === s.key ? "on" : ""} onClick={() => pick(s.key)}>{s.icon} {s.title}</button>)}
            </div>
            {start === "template" && (
              <div className="pa-start-panel">
                <div className="inv-search sm" style={{ marginBottom: 6, maxWidth: 260 }}><Search size={13} /><input placeholder="Search templates" value={tplQ} onChange={(e) => setTplQ(e.target.value)} /></div>
                {!data ? <span className="cell-sub">Loading…</span> : data.templates.filter((t) => t.name.toLowerCase().includes(tplQ.toLowerCase())).map((t) => (
                  <label key={t.id} className={`pa-pick-row${ref === t.id ? " on" : ""}`}><input type="radio" name="tpl" checked={ref === t.id} onChange={() => { setRef(t.id); if (!name) setName(t.name); }} /><span className="stack" style={{ gap: 1 }}><span>{t.name}</span><span className="cell-sub">{t.sub}</span></span></label>
                ))}
                {data && data.templates.length === 0 && <span className="cell-sub">No templates yet.</span>}
              </div>
            )}
            {start === "suggestion" && (
              <div className="pa-start-panel">
                {!data ? <span className="cell-sub">Loading…</span> : data.suggestions.length === 0 ? <span className="cell-sub">No pending suggestions. Blank is a good start.</span> :
                  data.suggestions.map((s) => (
                    <label key={s.id} className={`pa-pick-row${ref === s.id ? " on" : ""}`}><input type="radio" name="sug" checked={ref === s.id} onChange={() => { setRef(s.id); if (!name) setName(s.name); }} /><span className="stack" style={{ gap: 1 }}><span>{s.name}</span><span className="cell-sub">{s.sub}</span></span></label>
                  ))}
              </div>
            )}
          </div>

          {err && <div className="notice warn" style={{ margin: 0 }}>{err}</div>}
        </div>
        <div className="std-modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={pending} onClick={create}>Create</button>
        </div>
      </div>
    </div>, document.body);
}
