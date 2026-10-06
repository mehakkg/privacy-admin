"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { addAudienceAction } from "@/app/actions/maskingpolicy";

/** Add audience — a modal (replaces the earlier inline form). */
export function AddAudienceModal({ draftId, onClose, onAdded }: { draftId: string; onClose: () => void; onAdded: (id: string) => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [label, setLabel] = useState(""); const [ident, setIdent] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const add = () => start(async () => {
    const r = await addAudienceAction(draftId, label, ident);
    if (r.ok && r.id) onAdded(r.id); else setErr(r.error ?? "Couldn't add.");
  });
  if (!mounted) return null;
  return createPortal(
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal std-modal sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add audience">
        <div className="std-modal-head"><h3 style={{ margin: 0 }}>Add audience</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="std-modal-body">
          <div className="stack" style={{ gap: 12 }}>
            {err && <div className="notice danger" style={{ margin: 0 }}><div>{err}</div></div>}
            <label className="fld"><span>Name</span><input className="input" autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Teller" /></label>
            <label className="fld"><span>How your app names this role</span>
              <input className="input mono" value={ident} onChange={(e) => setIdent(e.target.value)} placeholder="teller" />
              <span className="cell-sub">The role name your application sends, for example teller. Ask your developers if you&rsquo;re unsure.</span>
            </label>
          </div>
        </div>
        <div className="std-modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!label.trim() || !ident.trim() || pending} onClick={add}>{pending ? "Adding…" : "Add audience"}</button></div>
      </div>
    </div>,
    document.body,
  );
}
