"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { X, Lightbulb, LayoutTemplate, FilePlus2 } from "lucide-react";
import { getAddActivityDataAction, createActivityFromStartAction, type AddActivityData } from "@/app/actions/activities";

type Start = "suggestion" | "template" | "blank";

/** SCREEN 2 — Add activity (2-step). How to start → name it. */
export function AddActivityModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string, start: Start) => void }) {
  const [data, setData] = useState<AddActivityData | null>(null);
  const [step, setStep] = useState(1);
  const [start, setStart] = useState<Start | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [entityId, setEntityId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [tplQ, setTplQ] = useState("");
  const [pending, startTx] = useTransition();

  useEffect(() => { getAddActivityDataAction().then((d) => { setData(d); setOwner(d.currentUser); }); }, []);

  const chosenLabel = start === "suggestion" ? data?.suggestions.find((s) => s.id === ref)?.name : start === "template" ? data?.templates.find((t) => t.id === ref)?.name : "a blank activity";

  const next = () => {
    if (!start) { setErr("Choose how to start."); return; }
    if (start !== "blank" && !ref) { setErr(start === "suggestion" ? "Choose a suggestion." : "Choose a template."); return; }
    setErr(null); setStep(2);
  };
  const create = () => {
    if (name.trim().length < 3) { setErr("Use a name of 3 to 80 characters."); return; }
    if (data?.multiEntity && !entityId) { setErr("Choose an entity."); return; }
    startTx(async () => {
      const r = await createActivityFromStartAction({ start: start!, ref: ref ?? undefined, name, ownerName: owner, entityId: entityId || undefined });
      if (r.ok && r.id) onCreated(r.id, start!); else setErr(r.error ?? "Couldn’t create.");
    });
  };

  const cards: { key: Start; icon: React.ReactNode; title: string; desc: string }[] = [
    { key: "suggestion", icon: <Lightbulb size={18} />, title: "From a suggestion", desc: "Use what your data already tells us." },
    { key: "template", icon: <LayoutTemplate size={18} />, title: "From a template", desc: "Start from a common process." },
    { key: "blank", icon: <FilePlus2 size={18} />, title: "Start blank", desc: "Add everything yourself." },
  ];

  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal std-modal md" role="dialog" aria-modal="true" aria-label="Add activity" style={{ maxHeight: "80vh" }}>
        <div className="std-modal-head"><h3 style={{ margin: 0 }}>{step === 1 ? "How do you want to start?" : "Name it"}</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="std-modal-body">
          {step === 1 ? (
            <div className="stack" style={{ gap: 12 }}>
              <div className="cell-sub">Step 1 of 2</div>
              <div className="pa-start-cards">
                {cards.map((c) => (
                  <button key={c.key} className={`pa-start-card${start === c.key ? " on" : ""}`} onClick={() => { setStart(c.key); setRef(null); setErr(null); }}>
                    {c.icon}<span className="pa-start-title">{c.title}</span><span className="cell-sub">{c.desc}</span>
                  </button>
                ))}
              </div>
              {start === "suggestion" && (
                <div className="pa-start-panel">
                  {!data ? <span className="cell-sub">Loading…</span> : data.suggestions.length === 0 ? <span className="cell-sub">No pending suggestions.</span> :
                    data.suggestions.map((s) => (
                      <label key={s.id} className={`pa-pick-row${ref === s.id ? " on" : ""}`}><input type="radio" name="sug" checked={ref === s.id} onChange={() => setRef(s.id)} /><span className="stack" style={{ gap: 1 }}><span>{s.name}</span><span className="cell-sub">{s.sub}</span></span></label>
                    ))}
                </div>
              )}
              {start === "template" && (
                <div className="pa-start-panel">
                  <input className="input sm" placeholder="Search templates" value={tplQ} onChange={(e) => setTplQ(e.target.value)} style={{ marginBottom: 6 }} />
                  {!data ? <span className="cell-sub">Loading…</span> : data.templates.filter((t) => t.name.toLowerCase().includes(tplQ.toLowerCase())).map((t) => (
                    <label key={t.id} className={`pa-pick-row${ref === t.id ? " on" : ""}`}><input type="radio" name="tpl" checked={ref === t.id} onChange={() => setRef(t.id)} /><span className="stack" style={{ gap: 1 }}><span>{t.name}</span><span className="cell-sub">{t.sub}</span></span></label>
                  ))}
                </div>
              )}
              {err && <div className="notice warn" style={{ margin: 0 }}>{err}</div>}
            </div>
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              <div className="cell-sub">Step 2 of 2</div>
              <div className="pa-start-summary">Starting from: <strong>{chosenLabel}</strong>. <button className="link-btn" onClick={() => { setStep(1); setErr(null); }}>Change</button></div>
              <label className="fld"><span>Name</span><input className="input" autoFocus value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setErr(null); }} placeholder="e.g. Retail Loan Origination" /></label>
              <label className="fld"><span>Owner</span><select className="input" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Choose an owner…</option>{["R. Iyer", "K. Menon", "P. Shah", "A. Rao", "S. Nair", "D. Verma"].map((u) => <option key={u} value={u}>{u}</option>)}</select></label>
              {data?.multiEntity && (
                <label className="fld"><span>Entity</span><select className="input" value={entityId} onChange={(e) => setEntityId(e.target.value)}><option value="">Choose an entity…</option>{data.entities.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}</select></label>
              )}
              {err && <div className="notice warn" style={{ margin: 0 }}>{err}</div>}
            </div>
          )}
        </div>
        <div className="std-modal-foot">
          {step === 1 ? <><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={next}>Next</button></>
            : <><button className="btn" onClick={() => setStep(1)}>Back</button><button className="btn primary" disabled={pending} onClick={create}>Create draft</button></>}
        </div>
      </div>
    </div>, document.body);
}
