"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { createPurposeAction, type PurposeInput } from "@/app/actions/purposes";

const LEGIT_TYPES = [
  "Voluntarily provided for a specified purpose (7(a))",
  "Disclosure required by law (7(d))",
  "Compliance with a court order (7(e))",
  "Purposes of employment (7(i))",
];

/**
 * Create-purpose drawer (Master spec Part L) — the single component used from the
 * Purposes header, the Activity composer, and the Activity detail Purposes tab.
 * Name-first; a duplicate name is blocked inline with "Use it →". Save draft needs
 * only a name; Submit for approval validates and sends it to the DPO. In composer
 * mode the footer is a single "Add to activity" (saved as a Draft that travels
 * with the activity's submission). Retention + the DPO note are defaulted so the
 * minimal drawer still passes approval validation.
 */
export function PurposeDrawer({
  mode = "standalone", initialName = "", linkedActivity, existing, onClose, onSaved, onUse,
}: {
  mode?: "standalone" | "composer";
  initialName?: string;
  linkedActivity?: string;
  existing: { id: string; name: string }[];
  onClose: () => void;
  onSaved: (id: string, status: "draft" | "pending", name: string) => void;
  onUse: (id: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const [legalBasis, setLegalBasis] = useState<"consent" | "legitimate_use">("consent");
  const [legitimateUseType, setLegitType] = useState(LEGIT_TYPES[3]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  const dirty = name !== initialName || description !== "" || legalBasis !== "consent";
  const dup = existing.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase() && name.trim().length > 0);
  const descLen = description.trim().length;

  const close = () => { if (dirty && !window.confirm("Discard this purpose? Your entries will be lost.")) return; onClose(); };

  const build = (): PurposeInput => ({
    name, description,
    legalBasis, legitimateUseType: legalBasis === "legitimate_use" ? legitimateUseType : undefined,
    // Defaulted so the minimal drawer passes approval validation; refined later.
    amount: 1, unit: "years", trigger: "after the purpose is served",
    justification: descLen >= 20 ? description : "Created from the Purposes page for DPO review.",
  });

  const save = (submit: boolean) => {
    if (dup) { setErr(null); return; }
    if (name.trim().length < 3) { setErr("Give it a name of 3 to 80 characters."); nameRef.current?.focus(); return; }
    if (submit && (descLen < 20 || descLen > 300)) { setErr("Add a description of 20 to 300 characters before submitting."); return; }
    start(async () => {
      const r = await createPurposeAction(null, build(), submit);
      if (r.ok && r.purposeId) onSaved(r.purposeId, submit ? "pending" : "draft", name.trim());
      else setErr(r.error ?? "Couldn’t save. Your entries are still here.");
    });
  };
  const primary = () => (mode === "composer" ? save(false) : save(true));

  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
      onKeyDown={(e) => { if (e.key === "Escape") close(); if ((e.metaKey || e.ctrlKey) && e.key === "Enter") primary(); }}>
      <div className="mp-drawer" role="dialog" aria-modal="true" aria-label="Add purpose" style={{ width: 480 }}>
        <div className="mp-drawer-head"><strong>{mode === "composer" ? "New purpose for this activity" : "Add a purpose"}</strong><button className="icon-btn" onClick={close}><X size={16} /></button></div>
        <div className="mp-drawer-body stack" style={{ gap: 12, overflow: "auto", padding: 16 }}>
          <label className="fld"><span>Name</span>
            <input ref={nameRef} className="input" value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} placeholder="e.g. Credit assessment" />
            {dup && <div className="notice warn" style={{ margin: "6px 0 0" }}>A purpose named “{dup.name}” already exists. <button className="link-btn" onClick={() => onUse(dup.id)}>Use it →</button></div>}
          </label>
          <label className="fld"><span>Description</span>
            <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Say what you do and why, in plain words" />
            <span className="cell-sub" style={{ display: "flex", justifyContent: "space-between" }}><span>This is the text Data Principals see in the notice.</span><span className={descLen > 300 ? "sev-warning" : ""}>{descLen}/300</span></span>
          </label>
          <label className="fld"><span>Legal basis</span>
            <select className="input" value={legalBasis} onChange={(e) => setLegalBasis(e.target.value as "consent" | "legitimate_use")}>
              <option value="consent">Consent (Section 6)</option>
              <option value="legitimate_use">Legitimate use (Section 7)</option>
            </select>
          </label>
          {legalBasis === "legitimate_use" && (
            <label className="fld"><span>Legitimate-use type</span><select className="input" value={legitimateUseType} onChange={(e) => setLegitType(e.target.value)}>{LEGIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
          )}
          {mode === "composer" && linkedActivity && (
            <div className="fld"><span>Linked activity</span><div className="row" style={{ gap: 6, flexWrap: "wrap" }}><span className="chip" style={{ fontSize: 11.5 }}>{linkedActivity}</span></div></div>
          )}
          {err && <div className="notice warn" style={{ margin: 0 }}>{err}</div>}
        </div>
        <div className="mp-drawer-foot row" style={{ justifyContent: mode === "composer" ? "flex-end" : "space-between", gap: 8, padding: 12, borderTop: "1px solid var(--border)" }}>
          {mode === "composer"
            ? <button className="btn primary" disabled={pending || !!dup} onClick={() => save(false)}>Add to activity</button>
            : <>
                <button className="btn" disabled={pending || !!dup} onClick={() => save(false)}>Save draft</button>
                <button className="btn primary" disabled={pending || !!dup} onClick={() => save(true)}>Submit for approval</button>
              </>}
        </div>
      </div>
    </div>, document.body);
}
