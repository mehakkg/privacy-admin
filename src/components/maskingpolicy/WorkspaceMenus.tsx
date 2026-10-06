"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { createPortal } from "react-dom";
import { X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { AddAudienceModal } from "@/components/maskingpolicy/AddAudienceModal";
import { discardDraftAction } from "@/app/actions/maskingpolicy";
import type { PolicyCheck } from "@/lib/maskingpolicy";

const MP = "/data-flow/masking-policy";

/** Opens the Add-audience modal; a plain button styled by `className`. */
export function AddAudienceTrigger({ draftId, className, children }: { draftId: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>{children}</button>
      {open && <AddAudienceModal draftId={draftId} onClose={() => setOpen(false)} onAdded={(id) => { setOpen(false); router.push(`${MP}?view=workspace&focus=audience:${id}`); }} />}
    </>
  );
}

/** Workspace overflow: Checks + Discard draft. (Manage channels now lives as a
 *  quiet link in the audience pane and the see-more popover.) */
export function WorkspaceMenu({ draftId, checks }: { draftId: string; checks: PolicyCheck[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showChecks, setShowChecks] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setConfirm(false); } }; document.addEventListener("mousedown", c); return () => document.removeEventListener("mousedown", c); }, [open]);
  return (
    <div className="row-menu" ref={ref} style={{ position: "relative" }}>
      <button className="icon-btn" aria-label="More" onClick={() => setOpen((o) => !o)}><MoreHorizontal size={16} /></button>
      {open && (
        <div className="row-menu-pop" style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, minWidth: 200 }}>
          {confirm ? (
            <div className="row-menu-confirm">Discard the draft?<div className="row" style={{ gap: 6, marginTop: 6 }}><button className="btn danger sm" onClick={() => start(async () => { await discardDraftAction(); router.push(MP); })}>Discard</button><button className="btn ghost sm" onClick={() => setConfirm(false)}>Keep</button></div></div>
          ) : <>
            <button className="row-menu-item" onClick={() => { setShowChecks(true); setOpen(false); }}>Checks</button>
            <button className="row-menu-item danger" onClick={() => setConfirm(true)}>Discard draft</button>
          </>}
        </div>
      )}
      {showChecks && createPortal(
        <div className="modal-scrim" onClick={() => setShowChecks(false)}>
          <div className="modal std-modal md" onClick={(e) => e.stopPropagation()}>
            <div className="std-modal-head"><h3 style={{ margin: 0 }}>Checks</h3><button className="icon-btn" onClick={() => setShowChecks(false)}><X size={16} /></button></div>
            <div className="std-modal-body"><div className="stack" style={{ gap: 8 }}>
              {checks.map((c, i) => (
                <div key={i} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                  {c.level === "blocking" && !c.ok ? <AlertTriangle size={15} style={{ color: "var(--red)", flexShrink: 0 }} /> : c.level === "warning" ? <AlertTriangle size={15} style={{ color: "var(--yellow-700, #b45309)", flexShrink: 0 }} /> : <CheckCircle2 size={15} style={{ color: "var(--green)", flexShrink: 0 }} />}
                  <span>{c.message}</span>
                </div>
              ))}
            </div></div>
          </div>
        </div>, document.body)}
    </div>
  );
}
