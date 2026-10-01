"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { FolderPlus, X } from "lucide-react";
import { createCustomTemplateAction } from "@/app/actions/masking";

/**
 * "Create custom" — a tenant-owned template that appears in the Governed by
 * filter alongside BASELINE/DPDP/RBI. Opens a centered modal (not an inline
 * expansion of the templates card). Optionally starts as a copy of BASELINE.
 */
export function CustomTemplateCreator() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [copyBaseline, setCopyBaseline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const close = () => { setOpen(false); setName(""); setCopyBaseline(false); setError(null); };
  const create = () => start(async () => {
    const r = await createCustomTemplateAction(name, copyBaseline);
    if (r.ok) { close(); router.refresh(); }
    else setError(r.error ?? "Failed.");
  });

  return (
    <>
      <button className="btn sm tpl-create" onClick={() => setOpen(true)}><FolderPlus size={13} /> Create custom</button>
      {open && mounted && createPortal(
        <div className="modal-scrim" onClick={close}>
          <div className="modal std-modal sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="New custom template">
            <div className="std-modal-head">
              <h3 style={{ margin: 0 }}>New custom template</h3>
              <button className="icon-btn" onClick={close} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="std-modal-body">
              <div className="stack" style={{ gap: 12 }}>
                <p className="cell-sub" style={{ margin: 0 }}>A tenant-owned template you can tailor to a team. It appears in the Governed by filter.</p>
                {error && <div className="notice danger" style={{ margin: 0 }}><div>{error}</div></div>}
                <label className="fld"><span>Name</span>
                  <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Analytics identifiers"
                    onKeyDown={(e) => { if (e.key === "Enter" && name.trim() && !pending) create(); }} />
                </label>
                <label className="row cell-sub" style={{ gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={copyBaseline} onChange={(e) => setCopyBaseline(e.target.checked)} />
                  Start from a copy of the BASELINE fields
                </label>
              </div>
            </div>
            <div className="std-modal-foot">
              <button className="btn" onClick={close}>Cancel</button>
              <button className="btn primary" disabled={!name.trim() || pending} onClick={create}>{pending ? "Creating…" : "Create"}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
