"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, X } from "lucide-react";
import { createCustomTemplateAction } from "@/app/actions/masking";

/**
 * "Create custom template" — a tenant-owned template that appears in the Governed
 * by filter alongside BASELINE/DPDP/RBI. Optionally starts as a copy of the
 * BASELINE field set. No separate destination screen; it opens inline here.
 */
export function CustomTemplateCreator() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [copyBaseline, setCopyBaseline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = () => start(async () => {
    const r = await createCustomTemplateAction(name, copyBaseline);
    if (r.ok) { setOpen(false); setName(""); setCopyBaseline(false); setError(null); router.refresh(); }
    else setError(r.error ?? "Failed.");
  });

  if (!open) return <button className="btn ghost sm" onClick={() => setOpen(true)}><FolderPlus size={13} /> Create custom template</button>;

  return (
    <div className="stack" style={{ gap: 8, border: "1px solid var(--border-soft)", borderRadius: 8, padding: 10, minWidth: 280 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <strong className="cell-primary">New custom template</strong>
        <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close"><X size={14} /></button>
      </div>
      {error && <div className="notice danger" style={{ margin: 0 }}><div>{error}</div></div>}
      <label className="fld"><span>Name</span><input className="input sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Analytics identifiers" /></label>
      <label className="row cell-sub" style={{ gap: 6, alignItems: "center" }}>
        <input type="checkbox" checked={copyBaseline} onChange={(e) => setCopyBaseline(e.target.checked)} /> Start from a copy of the BASELINE fields
      </label>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn primary sm" disabled={!name.trim() || pending} onClick={create}>{pending ? "Creating…" : "Create"}</button>
      </div>
    </div>
  );
}
