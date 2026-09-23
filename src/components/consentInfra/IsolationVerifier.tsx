"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldAlert, Play } from "lucide-react";
import { Notice, Pill, Stat } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { runIsolationCheckAction } from "@/app/actions/consentInfra";
import type { ActionResult } from "@/app/actions/requests";

export interface EntityOpt { id: string; name: string; consentCount: number }
export interface CheckRow { id: string; runAt: string; entityAName: string; entityBName: string; passed: boolean; leakedCount: number; detail: string | null }

export function IsolationVerifier({ entities, latest, history }: { entities: EntityOpt[]; latest: CheckRow | null; history: CheckRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [a, setA] = useState(entities[0]?.id ?? "");
  const [b, setB] = useState(entities[1]?.id ?? "");

  const run = (inject: boolean) => start(async () => { const r = await runIsolationCheckAction(a, b, inject); setResult(r); if (r.ok) router.refresh(); });
  const clean = latest ? latest.passed : true;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <ActionError result={result} />

      <div className="stat-row">
        <Stat label="Isolation status" value={latest ? (latest.passed ? "Verified" : "FAILED") : "not run"} tone={latest ? (latest.passed ? "green" : "red") : undefined} />
        <Stat label="Last run" value={latest ? latest.runAt : "never"} />
      </div>

      {latest && (clean ? (
        <Notice tone="ok" title={`Isolation verified — ${latest.entityAName} cannot access ${latest.entityBName} consent data`}>
          <ShieldCheck size={13} style={{ verticalAlign: "-2px" }} /> {latest.detail} This is an active scoped query, not a schema assumption.
        </Notice>
      ) : (
        <Notice tone="danger" title={`Isolation FAILURE — ${latest.entityAName} ↔ ${latest.entityBName}`}>
          <ShieldAlert size={13} style={{ verticalAlign: "-2px" }} /> {latest.detail}
        </Notice>
      ))}

      <div className="card">
        <div className="card-head">Run isolation check</div>
        <div className="card-body">
          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label className="fld" style={{ margin: 0 }}><span>Entity A (querying)</span>
              <select className="input" value={a} onChange={(e) => setA(e.target.value)}>{entities.map((en) => <option key={en.id} value={en.id}>{en.name} ({en.consentCount} records)</option>)}</select>
            </label>
            <label className="fld" style={{ margin: 0 }}><span>Entity B (must be isolated)</span>
              <select className="input" value={b} onChange={(e) => setB(e.target.value)}>{entities.map((en) => <option key={en.id} value={en.id}>{en.name} ({en.consentCount} records)</option>)}</select>
            </label>
            <button className="btn primary sm" disabled={pending || !a || !b || a === b} onClick={() => run(false)}><Play size={13} /> Run isolation check</button>
            <button className="btn ghost sm" disabled={pending || !a || !b || a === b} onClick={() => run(true)} title="Demo: simulate a mis-scoped query">Run (simulate a scope leak)</button>
          </div>
          {a === b && <p className="cell-sub" style={{ marginTop: 6, color: "var(--yellow)" }}>Pick two different entities.</p>}
        </div>
      </div>

      {history.length > 0 && (
        <div className="card">
          <div className="card-head">Recent checks</div>
          <div className="card-body">
            {history.map((h) => (
              <div key={h.id} className="pick-row">
                <span className="cell-primary" style={{ flex: 1 }}>{h.entityAName} → {h.entityBName}</span>
                <span className="cell-sub">{h.runAt}</span>
                {h.passed ? <Pill tone="green" dot={false}>Isolated</Pill> : <Pill tone="red" dot={false}>{h.leakedCount} leaked</Pill>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
