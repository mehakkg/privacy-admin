"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { MaskEditor } from "@/components/maskingpolicy/MaskEditor";
import { defaultParamsForChoice, type Masking } from "@/lib/maskingpolicy";
import { checkFieldCodeAction, addFieldAction } from "@/app/actions/maskingpolicy";

interface Cat { id: string; name: string; definition: string }

/** B — Add a field. One modal, no stepper. Shared field editor with the decision card. */
export function AddFieldModal({ draftId, categories, onClose, onAdded }: { draftId: string; categories: Cat[]; onClose: () => void; onAdded: (code: string) => void }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [catId, setCatId] = useState("");
  const [mask, setMask] = useState<Masking>({ family: "full", params: defaultParamsForChoice("full") });
  const [sample, setSample] = useState("");
  const [codeErr, setCodeErr] = useState<{ msg: string; kind?: string } | null>(null);
  const [pending, start] = useTransition();
  const seq = useRef(0);
  const norm = code.trim().toUpperCase();
  const cat = categories.find((c) => c.id === catId);

  const checkCode = () => {
    setCodeErr(null);
    if (!norm) return;
    if (!/^[A-Z0-9_]+$/.test(norm)) { setCodeErr({ msg: "Use capital letters, digits and underscores only." }); return; }
    const mine = ++seq.current;
    checkFieldCodeAction(norm).then((r) => {
      if (mine !== seq.current) return;
      if (r.taken === "platform") setCodeErr({ msg: `${norm} is a platform field. You'll find it under ${r.categoryName}.`, kind: "platform" });
      else if (r.taken === "custom") setCodeErr({ msg: `${norm} is already in your policy.`, kind: "duplicate" });
    });
  };

  const add = () => start(async () => {
    const r = await addFieldAction(draftId, { code: norm, displayName: name, categoryId: catId, masking: mask, sampleValue: sample });
    if (r.ok && r.code) { onAdded(r.code); router.refresh(); }
    else setCodeErr({ msg: r.error ?? "Couldn't add the field.", kind: r.errorKind });
  });

  const canAdd = !!norm && /^[A-Z0-9_]+$/.test(norm) && !!catId && !codeErr && !pending;
  if (!mounted) return null;
  return createPortal(
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal std-modal md" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add a field">
        <div className="std-modal-head"><h3 style={{ margin: 0 }}>Add a field</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="std-modal-body">
          <div className="stack" style={{ gap: 12 }}>
            <label className="fld"><span>Field code</span>
              <input className="input mono" value={norm} onChange={(e) => { setCode(e.target.value); setCodeErr(null); }} onBlur={checkCode} placeholder="LOAN_ACCOUNT_NUMBER" />
              <span className="cell-sub">The identifier your applications use for this data. Developers use it to mark the field in their code.</span>
              {norm && !codeErr && <span className="cell-sub">Saved as <span className="mono">{norm}</span></span>}
              {codeErr && <span className="cell-sub" style={{ color: "var(--red)" }}>{codeErr.msg}</span>}
            </label>
            <label className="fld"><span>Display name <span className="cell-sub">(optional)</span></span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={norm ? norm.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Loan account number"} />
            </label>
            <label className="fld"><span>What kind of data is this?</span>
              <select className="input" value={catId} onChange={(e) => setCatId(e.target.value)}><option value="">Choose a category…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              {cat && <span className="cell-sub">{cat.definition}</span>}
            </label>
            <div className="fld"><span>How it should look</span>
              <MaskEditor value={mask} onChange={setMask} sample={sample || norm.toLowerCase()} />
              <span className="cell-sub">Until you choose, it stays fully hidden.</span>
            </div>
            <label className="fld"><span>Made-up sample value <span className="cell-sub">(optional)</span></span>
              <input className="input" value={sample} onChange={(e) => setSample(e.target.value)} placeholder="Use a made-up value, never real customer data." />
            </label>
          </div>
        </div>
        <div className="std-modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!canAdd} onClick={add}>{pending ? "Adding…" : "Add field"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
