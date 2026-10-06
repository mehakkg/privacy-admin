"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { AddAudienceModal } from "@/components/maskingpolicy/AddAudienceModal";
import { ManageChannelsModal } from "@/components/maskingpolicy/ManageChannelsModal";
import { discardDraftAction } from "@/app/actions/maskingpolicy";

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

/** Workspace overflow: Manage channels + Discard draft. */
export function WorkspaceMenu({ draftId }: { draftId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState(false);
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
            <button className="row-menu-item" onClick={() => { setChannels(true); setOpen(false); }}>Manage channels</button>
            <button className="row-menu-item danger" onClick={() => setConfirm(true)}>Discard draft</button>
          </>}
        </div>
      )}
      {channels && <ManageChannelsModal draftId={draftId} onClose={() => setChannels(false)} />}
    </div>
  );
}
