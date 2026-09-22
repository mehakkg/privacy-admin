"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, ShieldAlert, CheckCircle2, Ban } from "lucide-react";
import { Pill, Notice } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { runScriptComplianceScanAction, categorizeScriptAction } from "@/app/actions/scenario6";
import type { ActionResult } from "@/app/actions/requests";

export interface FlaggedScript { id: string; scriptName: string; vendor: string | null; page: string; disclosed: boolean; firedBeforeConsent: boolean; status: string; technicalDetail: string | null }
export interface CatOpt { id: string; name: string }

export function ScriptScanViewer({ flagged, categories, lastScan }: { flagged: FlaggedScript[]; categories: CatOpt[]; lastScan: string | null }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [result, setResult] = useState<(ActionResult & { flagged?: number }) | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const run = (op: () => Promise<ActionResult & { flagged?: number }>) => start(async () => { const r = await op(); setResult(r); if (r.ok) router.refresh(); });
  const open = flagged.filter((f) => f.status === "blocked" || f.status === "open");

  return (
    <div>
      <ActionError result={result} />
      <div className="row" style={{ gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <button className="btn primary sm" disabled={busy} onClick={() => run(() => runScriptComplianceScanAction())}><Play size={13} /> Run scan</button>
        {lastScan && <span className="cell-sub">Last scan {lastScan}</span>}
        <span className="cell-sub">Showing flagged scripts only — a clean scan shows the all-clear.</span>
      </div>

      {open.length === 0 ? (
        <div className="drift-clear" style={{ display: "flex", alignItems: "center", gap: 10, padding: 20, border: "1px solid var(--green-border)", borderRadius: 10, background: "color-mix(in srgb, var(--green) 8%, var(--bg))" }}>
          <CheckCircle2 size={22} style={{ color: "var(--green)" }} />
          <div><strong>No non-compliant scripts</strong><div className="cell-sub">Every live script is declared in the cookie policy and fires only after consent.{lastScan ? ` Last scan ${lastScan}.` : ""}</div></div>
        </div>
      ) : (
        open.map((f) => (
          <div key={f.id} className="card" style={{ marginBottom: 12 }}>
            <div className="card-body">
              <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className="cell-primary">{f.scriptName}</span>
                {f.vendor && <span className="cell-sub">{f.vendor}</span>}
                <span className="cell-sub mono">{f.page}</span>
                <Pill tone="red" dot={false}>{!f.disclosed ? "Undisclosed" : "Pre-consent firing"}</Pill>
                {f.status === "blocked" && <Pill tone="gray" dot={false}><Ban size={11} style={{ verticalAlign: "-1px" }} /> Auto-blocked</Pill>}
              </div>
              <p className="cell-sub" style={{ margin: "8px 0" }}><ShieldAlert size={12} style={{ verticalAlign: "-2px", color: "var(--red)" }} /> {f.technicalDetail}</p>
              <div className="add-element-form" style={{ flexWrap: "wrap" }}>
                <select className="input" value={pick[f.id] ?? ""} onChange={(e) => setPick({ ...pick, [f.id]: e.target.value })}>
                  <option value="">Categorise into…</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button className="btn sm primary" disabled={busy || !pick[f.id]} onClick={() => run(() => categorizeScriptAction(f.id, pick[f.id]))}>Categorise &amp; unblock</button>
              </div>
            </div>
          </div>
        ))
      )}

      <Notice tone="info" title="One engine, many triggers">This on-demand scan uses the same detection engine a scheduled monitor will run — the manual and scheduled triggers can never disagree about what&apos;s compliant.</Notice>
    </div>
  );
}
