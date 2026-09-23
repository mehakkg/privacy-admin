"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, RefreshCw } from "lucide-react";
import { Notice, Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { sendWebhookTestAction, retryWebhookDeliveryAction } from "@/app/actions/consentInfra";
import { WEBHOOK_DELIVERY_LABEL, WEBHOOK_DELIVERY_TONE } from "@/lib/consentInfra";
import type { ActionResult } from "@/app/actions/requests";

export interface WebhookRow { id: string; endpoint: string; event: string; status: string; lastTestResult: string | null }
export interface DeliveryRow { id: string; endpoint: string; event: string; status: string; responseCode: number | null; retryCount: number; detail: string | null; attemptAt: string }

const STATUS_TONE: Record<string, "green" | "red" | "yellow"> = { active: "green", failing: "red", paused: "yellow" };

export function WebhookTester({ webhooks, deliveries }: { webhooks: WebhookRow[]; deliveries: DeliveryRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>) => start(async () => { const r = await op(); setResult(r); if (r.ok) router.refresh(); });

  return (
    <div className="stack" style={{ gap: 16 }}>
      <ActionError result={result} />
      <Notice tone="info" title="Confirm delivery, don't assume it">Send a test consent-change event through each configured webhook and watch it deliver, fail, and retry. Failures stay in the log with a manual retry.</Notice>

      <div className="card">
        <div className="card-head">Configured webhooks</div>
        <div className="card-body">
          {webhooks.length === 0 && <p className="cell-sub">No webhooks configured. Add one in Consent collection → Setup.</p>}
          {webhooks.map((w) => (
            <div key={w.id} className="pick-row">
              <div className="cell-stack" style={{ flex: 1 }}>
                <span className="cell-primary mono">{w.endpoint}</span>
                <span className="cell-sub">on {w.event}{w.lastTestResult ? ` · last test ${w.lastTestResult}` : ""}</span>
              </div>
              <Pill tone={STATUS_TONE[w.status] ?? "gray"} dot={false}>{w.status}</Pill>
              <button className="btn xs primary" disabled={pending} onClick={() => run(() => sendWebhookTestAction(w.id, false))}><Send size={11} /> Send test</button>
              <button className="btn xs ghost" disabled={pending} onClick={() => run(() => sendWebhookTestAction(w.id, true))} title="Demo: force a failing delivery + auto-retry">Test (force fail)</button>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">Delivery log</div>
        <div className="card-body">
          <div className="table-wrap">
            <table className="dtable">
              <thead><tr><th>Endpoint</th><th>Event</th><th>Response</th><th>Status</th><th>Retry</th><th>When</th><th></th></tr></thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id}>
                    <td className="cell-sub mono">{d.endpoint}</td>
                    <td className="cell-sub">{d.event}</td>
                    <td className="mono">{d.responseCode ?? "—"}</td>
                    <td><Pill tone={WEBHOOK_DELIVERY_TONE[d.status] ?? "gray"} dot={false}>{WEBHOOK_DELIVERY_LABEL[d.status] ?? d.status}</Pill></td>
                    <td className="cell-sub">{d.retryCount > 0 ? `×${d.retryCount}` : "—"}</td>
                    <td className="cell-sub">{d.attemptAt}</td>
                    <td>{d.status === "failed" && <button className="btn xs" disabled={pending} onClick={() => run(() => retryWebhookDeliveryAction(d.id))}><RefreshCw size={11} /> Retry</button>}</td>
                  </tr>
                ))}
                {deliveries.length === 0 && <tr><td colSpan={7}><div className="empty">No deliveries yet. Send a test event.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
