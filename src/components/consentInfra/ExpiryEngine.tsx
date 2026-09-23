"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Timer, Play } from "lucide-react";
import { Notice, Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { setExpiryBehaviorAction, runExpirySweepAction } from "@/app/actions/consentInfra";
import { EXPIRY_BEHAVIOR_LABEL, EXPIRY_ACTION_LABEL } from "@/lib/consentInfra";
import type { ActionResult } from "@/app/actions/requests";

export interface PurposeRow { id: string; name: string; retention: string | null; behavior: string }
export interface LogRow { id: string; purposeName: string | null; action: string; processedAt: string; detail: string | null }

export function ExpiryEngine({ purposes, log }: { purposes: PurposeRow[]; log: LogRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<(ActionResult & { processed?: number; withdrawn?: number; reconsent?: number }) | null>(null);
  const run = (op: () => Promise<ActionResult>) => start(async () => { const r = await op(); setResult(r); if (r.ok) router.refresh(); });

  return (
    <div className="stack" style={{ gap: 16 }}>
      <ActionError result={result} />
      {result?.ok && result.processed !== undefined && (
        <Notice tone={result.processed ? "ok" : "info"} title={result.processed ? `Processed ${result.processed} expiry(ies)` : "Nothing to expire"}>
          {result.processed ? `${result.withdrawn} auto-withdrawn, ${result.reconsent} re-consent triggered. No record was deleted — each is preserved as history.` : "No granted consent has passed its retention period."}
        </Notice>
      )}

      <div className="card">
        <div className="card-head">
          <span className="row" style={{ gap: 6 }}><Timer size={14} /> Expiry behaviour per purpose</span>
          <button className="btn sm primary" style={{ marginLeft: "auto" }} disabled={pending} onClick={() => run(() => runExpirySweepAction())}><Play size={13} /> Run expiry sweep</button>
        </div>
        <div className="card-body">
          <div className="table-wrap">
            <table className="dtable">
              <thead><tr><th>Purpose</th><th>Retention (DPO-set)</th><th>On expiry</th></tr></thead>
              <tbody>
                {purposes.map((p) => (
                  <tr key={p.id}>
                    <td className="cell-primary">{p.name}</td>
                    <td className="cell-sub">{p.retention ?? <em>until deletion (no auto-expiry)</em>}</td>
                    <td>
                      <select className="input sm" value={p.behavior} disabled={pending} onChange={(e) => run(() => setExpiryBehaviorAction(p.id, e.target.value as "auto_withdraw" | "trigger_reconsent"))}>
                        <option value="auto_withdraw">{EXPIRY_BEHAVIOR_LABEL.auto_withdraw}</option>
                        <option value="trigger_reconsent">{EXPIRY_BEHAVIOR_LABEL.trigger_reconsent}</option>
                      </select>
                    </td>
                  </tr>
                ))}
                {purposes.length === 0 && <tr><td colSpan={3}><div className="empty">No approved purposes.</div></td></tr>}
              </tbody>
            </table>
          </div>
          <p className="cell-sub" style={{ marginTop: 8 }}>Retention is DPO-set on the purpose and read-only here. Admin configures only what happens at expiry. Expiry is always a logged status change — never a silent deletion.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">Expiry activity log</div>
        <div className="card-body">
          {log.length === 0 && <p className="cell-sub">No expiries processed yet.</p>}
          {log.map((l) => (
            <div key={l.id} className="pick-row">
              <div className="cell-stack" style={{ flex: 1 }}>
                <span className="cell-primary">{l.purposeName ?? "—"}</span>
                <span className="cell-sub">{l.detail}</span>
              </div>
              <Pill tone={l.action === "auto_withdraw" ? "blue" : "purple"} dot={false}>{EXPIRY_ACTION_LABEL[l.action] ?? l.action}</Pill>
              <span className="cell-sub">{l.processedAt}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
