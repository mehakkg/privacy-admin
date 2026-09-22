"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Activity, CheckCircle2, AlertTriangle, Search } from "lucide-react";
import { Notice, Pill, Stat } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { runUnificationCheckAction } from "@/app/actions/omnichannel";
import { CAPTURE_CHANNEL_LABEL, CHANNEL_ORIGIN_LABEL } from "@/lib/omnichannel";
import type { ActionResult } from "@/app/actions/requests";

export interface CheckView {
  id: string; runAt: string; discrepancyFound: boolean; discrepancyDetail: string | null;
  summary: { tickets?: Record<string, number>; consent?: Record<string, number>; offlineQueue?: { queued: number; failed: number; total: number }; injected?: boolean };
  runBy: string | null;
}

export function UnificationMonitor({ latest, history }: { latest: CheckView | null; history: CheckView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [open, setOpen] = useState(false);
  const run = (inject: boolean) => start(async () => { const r = await runUnificationCheckAction(inject); setResult(r); if (r.ok) { setOpen(true); router.refresh(); } });

  const clean = latest ? !latest.discrepancyFound : true;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <ActionError result={result} />

      {/* Positive-confirmation health tile — same pattern as the Consent Artifact
          Integrity Dashboard (Stat with a conditional green/red tone). */}
      <div className="stat-row">
        <Stat label="Unification discrepancies" value={latest ? (latest.discrepancyFound ? 1 : 0) : 0} tone={clean ? "green" : "red"} />
        <Stat label="Last run" value={latest ? latest.runAt : "never"} />
      </div>

      {clean ? (
        <Notice tone="ok" title="All channels unified — 0 discrepancies">
          <CheckCircle2 size={13} style={{ verticalAlign: "-2px" }} /> The last active comparison of tickets and consent across every channel found no discrepancy. This is a real check result, not an assumption.
        </Notice>
      ) : (
        <Notice tone="danger" title="Discrepancy found">
          <AlertTriangle size={13} style={{ verticalAlign: "-2px" }} /> {latest?.discrepancyDetail}
        </Notice>
      )}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary sm" disabled={pending} onClick={() => run(false)}><Activity size={13} /> Run unification check</button>
        <button className="btn ghost sm" disabled={pending} onClick={() => run(true)} title="Demo: force a specific discrepancy">Run check (inject a discrepancy)</button>
        {latest && <button className="btn ghost sm" onClick={() => setOpen((o) => !o)}><Search size={13} /> {open ? "Hide" : "Drill into"} last run</button>}
      </div>

      {open && latest && (
        <div className="card">
          <div className="card-head">Last run — {latest.runAt} <span className="cell-sub">by {latest.runBy ?? "system"}</span></div>
          <div className="card-body">
            <div className="dprr-grid">
              <div>
                <div className="section-label">Tickets by channel_origin</div>
                {Object.entries(latest.summary.tickets ?? {}).map(([k, v]) => <div key={k} className="pick-row"><span className="cell-primary" style={{ flex: 1 }}>{CHANNEL_ORIGIN_LABEL[k] ?? k}</span><Pill tone="gray" dot={false}>{v}</Pill></div>)}
                {Object.keys(latest.summary.tickets ?? {}).length === 0 && <p className="cell-sub">No tickets.</p>}
              </div>
              <div>
                <div className="section-label">Consent by capture channel</div>
                {Object.entries(latest.summary.consent ?? {}).map(([k, v]) => <div key={k} className="pick-row"><span className="cell-primary" style={{ flex: 1 }}>{CAPTURE_CHANNEL_LABEL[k] ?? k}</span><Pill tone="gray" dot={false}>{v}</Pill></div>)}
                {Object.keys(latest.summary.consent ?? {}).length === 0 && <p className="cell-sub">No consent records.</p>}
              </div>
            </div>
            <div className="section-label" style={{ marginTop: 10 }}>Offline queue</div>
            <p className="cell-sub">Queued {latest.summary.offlineQueue?.queued ?? 0} · Failed {latest.summary.offlineQueue?.failed ?? 0} · Total {latest.summary.offlineQueue?.total ?? 0}</p>
            {latest.discrepancyFound && <Notice tone="danger" title="Affected records">{latest.discrepancyDetail}</Notice>}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="card">
          <div className="card-head">Recent runs</div>
          <div className="card-body">
            {history.map((h) => (
              <div key={h.id} className="pick-row">
                <span className="cell-sub" style={{ flex: 1 }}>{h.runAt}</span>
                {h.discrepancyFound ? <Pill tone="red" dot={false}>1 discrepancy</Pill> : <Pill tone="green" dot={false}>Unified</Pill>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
