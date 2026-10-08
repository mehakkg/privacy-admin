"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Notice } from "@/components/ui";
import { addEntityAction } from "@/app/actions/entities";

export interface EntityRow { id: string; name: string; legalName: string | null; usedBy: number }

/** SCREEN 11 — Entities (Settings › Organization › Entities). */
export function EntitiesManager({ rows, multiEntity, moved }: { rows: EntityRow[]; multiEntity: boolean; moved?: boolean }) {
  const router = useRouter();
  const [add, setAdd] = useState(false);
  return (
    <div className="stack" style={{ gap: 14, maxWidth: 820 }}>
      {moved && <Notice tone="info" title="Fiduciaries have moved to Settings › Organization › Entities.">This is their new home.</Notice>}
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="inv-title">Entities</h1>
        <button className="btn primary" onClick={() => setAdd(true)}>Add entity</button>
      </div>
      {!multiEntity && <p className="cell-sub" style={{ margin: 0 }}>You have one entity. It&rsquo;s assigned to every activity automatically.</p>}

      <table className="inv-table">
        <thead><tr><th>Name</th><th>Legal name</th><th>Used by</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="inv-row">
              <td className="cell-primary">{r.name}</td>
              <td className="cell-sub">{r.legalName ?? "—"}</td>
              <td><span className="tnum">{r.usedBy}</span> {r.usedBy === 1 ? "activity" : "activities"}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={3} className="cell-sub" style={{ padding: 16 }}>No entities yet.</td></tr>}
        </tbody>
      </table>

      {add && <AddEntity onClose={() => setAdd(false)} onDone={() => { setAdd(false); router.refresh(); }} />}
    </div>
  );
}

function AddEntity({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [address, setAddress] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () => start(async () => { const r = await addEntityAction(name, legalName); if (r.ok) onDone(); else setErr(r.error ?? "Couldn’t add."); });
  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal std-modal sm" role="dialog" aria-modal="true" aria-label="Add entity">
        <div className="std-modal-head"><h3 style={{ margin: 0 }}>Add entity</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="std-modal-body stack" style={{ gap: 10 }}>
          <label className="fld"><span>Name</span><input className="input" autoFocus value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} /></label>
          <label className="fld"><span>Legal name</span><input className="input" value={legalName} onChange={(e) => setLegalName(e.target.value)} /></label>
          <label className="fld"><span>Address</span><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional" /></label>
          <p className="cell-sub" style={{ margin: 0 }}>DPO and grievance officer are set in the entity&rsquo;s detail (coming next).</p>
          {err && <div className="notice warn" style={{ margin: 0 }}>{err}</div>}
        </div>
        <div className="std-modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={pending} onClick={submit}>Add entity</button></div>
      </div>
    </div>, document.body);
}
