"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { createPurposeAction, editPurposeAction, type PurposeInput } from "@/app/actions/purposes";

const TRIGGERS = ["after account closure", "after last interaction", "after contract end", "after loan closure", "after ticket closure", "after employment ends", "after the event", "after survey", "Other"];
const LU_TYPES = ["Voluntarily provided for a specified purpose", "Legal obligation", "Employment"];

export interface PurposeModalInitial { name: string; description: string; legalBasis: "consent" | "legitimate_use"; legitimateUseType: string | null; amount: number; unit: "months" | "years"; trigger: string; justification: string }

/** SCREEN 5b — Create / Edit purpose. */
export function PurposeModal({ mode, activityId, purposeId, initial, editApproved, inForceVersion, onClose, onDone }: {
  mode: "create" | "edit"; activityId?: string; purposeId?: string; initial?: PurposeModalInitial; editApproved?: boolean; inForceVersion?: number;
  onClose: () => void; onDone: (purposeId: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [legalBasis, setLegalBasis] = useState<"consent" | "legitimate_use">(initial?.legalBasis ?? "legitimate_use");
  const [luType, setLuType] = useState(initial?.legitimateUseType ?? LU_TYPES[0]);
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : "");
  const [unit, setUnit] = useState<"months" | "years">(initial?.unit ?? "years");
  const [trigger, setTrigger] = useState(initial?.trigger && TRIGGERS.includes(initial.trigger) ? initial.trigger : (initial?.trigger ? "Other" : ""));
  const [otherTrigger, setOtherTrigger] = useState(initial?.trigger && !TRIGGERS.includes(initial.trigger) ? initial.trigger : "");
  const [justification, setJustification] = useState(initial?.justification ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const build = (): PurposeInput => ({ name, description, legalBasis, legitimateUseType: legalBasis === "legitimate_use" ? luType : undefined, amount: Number(amount) || 0, unit, trigger: trigger === "Other" ? otherTrigger : trigger, justification });
  const run = (submit: boolean) => start(async () => {
    const input = build();
    const r = mode === "create" ? await createPurposeAction(activityId ?? null, input, submit) : await editPurposeAction(purposeId!, input, submit, activityId);
    if (r.ok && r.purposeId) onDone(r.purposeId); else setErr(r.error ?? "Couldn’t save.");
  });

  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal std-modal md" role="dialog" aria-modal="true" aria-label={mode === "create" ? "Create purpose" : "Edit purpose"} style={{ maxHeight: "85vh" }}>
        <div className="std-modal-head"><h3 style={{ margin: 0 }}>{mode === "create" ? "Create purpose" : "Edit purpose"}</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="std-modal-body stack" style={{ gap: 12 }}>
          {editApproved && <div className="notice info" style={{ margin: 0 }}>Editing creates version {(inForceVersion ?? 0) + 1}. Version {inForceVersion} stays in force until your DPO approves it.</div>}
          <label className="fld"><span>Name</span><input className="input" value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setErr(null); }} /></label>
          <label className="fld"><span>What it is used for</span><textarea className="input" rows={2} value={description} maxLength={400} onChange={(e) => setDescription(e.target.value)} placeholder="One or two sentences." /></label>
          <label className="fld"><span>Legal basis</span>
            <select className="input" value={legalBasis} onChange={(e) => setLegalBasis(e.target.value as "consent" | "legitimate_use")}>
              <option value="consent">Consent</option><option value="legitimate_use">Legitimate use (DPDP Section 7)</option>
            </select>
          </label>
          {legalBasis === "legitimate_use" && (
            <label className="fld"><span>Type</span><select className="input" value={luType} onChange={(e) => setLuType(e.target.value)}>{LU_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
          )}
          <div className="fld"><span>Retention</span>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <input className="input" style={{ width: 80 }} type="number" min={1} max={99} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="7" />
              <select className="input" style={{ width: 110 }} value={unit} onChange={(e) => setUnit(e.target.value as "months" | "years")}><option value="years">years</option><option value="months">months</option></select>
              <select className="input" style={{ flex: 1, minWidth: 180 }} value={trigger} onChange={(e) => setTrigger(e.target.value)}><option value="">Choose a trigger…</option>{TRIGGERS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            </div>
            {trigger === "Other" && <input className="input" style={{ marginTop: 6 }} maxLength={60} value={otherTrigger} onChange={(e) => setOtherTrigger(e.target.value)} placeholder="Describe the trigger" />}
          </div>
          <label className="fld"><span>Why it is needed</span><textarea className="input" rows={2} value={justification} maxLength={400} onChange={(e) => setJustification(e.target.value)} placeholder="A short note for your DPO." /></label>
          {err && <div className="notice warn" style={{ margin: 0 }}>{err}</div>}
        </div>
        <div className="std-modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" disabled={pending} onClick={() => run(false)}>Save as draft</button>
            <button className="btn primary" disabled={pending} onClick={() => run(true)}>Submit for DPO approval</button>
          </div>
        </div>
      </div>
    </div>, document.body);
}
