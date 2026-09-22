"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Play, Lock, CheckCircle2 } from "lucide-react";
import { Notice } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { runIdentityResolutionAction } from "@/app/actions/scenario4";
import type { ActionResult } from "@/app/actions/requests";

export function IdentityResolutionRunner({ threshold, lastRun }: { threshold: number; lastRun: { at: string; flagged: number } | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<(ActionResult & { flagged?: number }) | null>(null);

  const run = () => start(async () => { const r = await runIdentityResolutionAction(); setResult(r); if (r.ok) router.refresh(); });

  return (
    <div>
      <ActionError result={result} />
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-head">Identity resolution</div>
        <div className="card-body">
          <div className="kv"><span className="k">Matching confidence</span><span><strong>{threshold}%</strong> <span className="cell-sub"><Lock size={11} style={{ verticalAlign: "-1px" }} /> DPO-approved · not editable</span></span></div>
          <p className="cell-sub" style={{ margin: "8px 0 12px" }}>Runs record matching at the governance-approved threshold and generates the flagged near-duplicate batch for review. Admin cannot change the threshold — it is a governance-set parameter.</p>
          {result?.ok && result.flagged != null && (
            <Notice tone="ok" title={`Run complete — ${result.flagged} pair(s) flagged`}>
              <Link href="/discovery/duplicates">Review the flagged pairs →</Link>
            </Notice>
          )}
          {!result?.ok && lastRun && (
            <p className="cell-sub" style={{ marginBottom: 10 }}><CheckCircle2 size={13} style={{ verticalAlign: "-2px", color: "var(--green)" }} /> Last run {lastRun.at} · {lastRun.flagged} pair(s) flagged · <Link href="/discovery/duplicates">review</Link></p>
          )}
          <button className="btn primary" disabled={pending} onClick={run}><Play size={14} /> {pending ? "Running…" : "Run identity resolution"}</button>
        </div>
      </div>
    </div>
  );
}
