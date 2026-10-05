"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startDraftAction, discardDraftAction, restoreAsDraftAction } from "@/app/actions/maskingpolicy";

const BASE = "/data-flow/masking-policy";

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
