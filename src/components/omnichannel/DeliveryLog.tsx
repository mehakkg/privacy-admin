"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Mail, MessageSquare, Phone, Building2 } from "lucide-react";
import { Pill, Notice } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { retryNotificationDeliveryAction } from "@/app/actions/omnichannel";
import { NOTIFICATION_CHANNEL_LABEL, DELIVERY_STATUS_LABEL, DELIVERY_STATUS_TONE } from "@/lib/omnichannel";
import type { ActionResult } from "@/app/actions/requests";

export interface DeliveryRow { id: string; title: string; channel: string; status: string; detail: string | null; retries: number; createdAt: string; reference: string | null }

const CHANNEL_ICON: Record<string, React.ReactNode> = {
  email: <Mail size={13} />, sms: <MessageSquare size={13} />, call: <Phone size={13} />, branch_handoff: <Building2 size={13} />, in_app: <Mail size={13} />,
};

export function DeliveryLog({ rows }: { rows: DeliveryRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const retry = (id: string) => start(async () => { const r = await retryNotificationDeliveryAction(id); setResult(r); if (r.ok) router.refresh(); });

  return (
    <div>
      <ActionError result={result} />
      <Notice tone="info" title="How multi-channel delivery works">
        On a request&rsquo;s acknowledgment, the ticket&rsquo;s preferred channel decides dispatch. SMS/email/call are delivered or logged automatically; <strong>branch hand-off is never auto-delivered</strong> — it is flagged for manual in-person delivery at the branch. Failed deliveries can be retried.
      </Notice>

      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="dtable">
          <thead><tr><th>Notification</th><th>Channel</th><th>Status</th><th>Detail</th><th>Sent</th><th></th></tr></thead>
          <tbody>
            {rows.map((n) => (
              <tr key={n.id}>
                <td><div className="cell-stack"><span className="cell-primary">{n.title}</span>{n.reference && <span className="cell-sub mono">{n.reference}</span>}</div></td>
                <td><span className="row" style={{ gap: 6 }}>{CHANNEL_ICON[n.channel]}<span>{NOTIFICATION_CHANNEL_LABEL[n.channel] ?? n.channel}</span></span></td>
                <td><Pill tone={DELIVERY_STATUS_TONE[n.status] ?? "gray"} dot={false}>{DELIVERY_STATUS_LABEL[n.status] ?? n.status}</Pill>{n.retries > 0 && <span className="cell-sub"> · retries {n.retries}</span>}</td>
                <td className="cell-sub">{n.detail}</td>
                <td className="cell-sub">{n.createdAt}</td>
                <td>{n.status === "failed" && <button className="btn xs" disabled={pending} onClick={() => retry(n.id)}><RefreshCw size={11} /> Retry</button>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6}><div className="empty">No multi-channel deliveries yet. Create an assisted request to dispatch an acknowledgment.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
