"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { startDraftAction, discardDraftAction, restoreAsDraftAction } from "@/app/actions/maskingpolicy";

const BASE = "/data-flow/masking-policy";

/** ⋯ overflow holding the rare/destructive Discard draft, away from the primary. */
export function DiscardMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setConfirm(false); } }; document.addEventListener("mousedown", c); return () => document.removeEventListener("mousedown", c); }, [open]);
  return (
    <div className="row-menu" ref={ref} style={{ position: "relative" }}>
      <button className="icon-btn" aria-label="More" onClick={() => setOpen((o) => !o)}><MoreHorizontal size={16} /></button>
      {open && (
        <div className="row-menu-pop" style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, minWidth: 200 }}>
          {confirm ? (
            <div className="row-menu-confirm">Discard the draft?
              <div className="row" style={{ gap: 6, marginTop: 6 }}>
                <button className="btn danger sm" disabled={pending} onClick={() => start(async () => { await discardDraftAction(); setOpen(false); router.refresh(); })}>Discard</button>
                <button className="btn ghost sm" onClick={() => setConfirm(false)}>Keep</button>
              </div>
            </div>
          ) : <button className="row-menu-item danger" onClick={() => setConfirm(true)}>Discard draft</button>}
        </div>
      )}
    </div>
  );
}

export function StartDraftButton({ label = "Start a draft", primary = true }: { label?: string; primary?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <button className={`btn ${primary ? "primary" : ""}`} disabled={pending} onClick={() => start(async () => { const r = await startDraftAction(); if (r.ok) router.push(`${BASE}?view=workspace`); })}>{pending ? "Starting…" : label}</button>;
}

export function ContinueDraftButton() {
  const router = useRouter();
  return <button className="btn primary" onClick={() => router.push(`${BASE}?view=workspace`)}>Continue editing</button>;
}

export function DiscardDraftButton() {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  if (!confirm) return <button className="btn" onClick={() => setConfirm(true)}>Discard draft</button>;
  return (
    <span className="row" style={{ gap: 6 }}>
      <span className="cell-sub">Discard the draft?</span>
      <button className="btn danger sm" disabled={pending} onClick={() => start(async () => { await discardDraftAction(); setConfirm(false); router.refresh(); })}>Discard</button>
      <button className="btn ghost sm" onClick={() => setConfirm(false)}>Keep</button>
    </span>
  );
}

export function UndoButton({ number, active }: { number: number; active: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (done) return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="cell-sub">Draft was created from version {number}. Version {active} keeps protecting your applications until you activate it.</span>
      <button className="btn" onClick={() => router.push(`${BASE}?view=workspace`)}>Open draft</button>
    </div>
  );
  return (
    <span className="stack" style={{ gap: 4 }}>
      <button className="btn" disabled={pending} onClick={() => start(async () => { const r = await restoreAsDraftAction(number); if (r.ok) { setDraftId(r.id ?? null); setDone("ok"); } else setErr(r.error ?? "Failed."); })}>{pending ? "Undoing…" : "Undo this change"}</button>
      {err && <span className="cell-sub" style={{ color: "var(--red)" }}>{err}</span>}
      {draftId && null}
    </span>
  );
}

export function RestoreButton({ number }: { number: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="row" style={{ gap: 6, alignItems: "center" }}>
      <button className="btn ghost sm" disabled={pending} onClick={() => start(async () => { const r = await restoreAsDraftAction(number); if (r.ok) router.push(`${BASE}?view=workspace`); else setErr(r.error ?? "Failed."); })}>{pending ? "Restoring…" : "Restore as draft"}</button>
      {err && <span className="cell-sub" style={{ color: "var(--red)" }}>{err}</span>}
    </span>
  );
}
