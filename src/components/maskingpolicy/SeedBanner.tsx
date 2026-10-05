"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { markReadyAction } from "@/app/actions/maskingpolicy";

/** First-load seed summary for a new draft. Dismissible. */
export function SeedBanner({ vid, ready, need, readyCodes }: { vid: string; ready: number; need: number; readyCodes: string[] }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [pending, start] = useTransition();
  if (hidden) return null;
  return (
    <div className="mp-seed">
      <div>We prepared this from what your applications use: <strong>{ready} fields ready</strong>{need > 0 && <>, <strong>{need} need you</strong></>}.</div>
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <button className="btn sm" disabled={pending} onClick={() => start(async () => { await markReadyAction(vid, readyCodes); setHidden(true); router.refresh(); })}>Accept recommended</button>
        {need > 0 && <button className="btn ghost sm" onClick={() => document.getElementById("mp-decisions")?.scrollIntoView({ behavior: "smooth" })}>Review the {need}</button>}
        <button className="icon-btn" onClick={() => setHidden(true)} aria-label="Dismiss"><X size={15} /></button>
      </div>
    </div>
  );
}
