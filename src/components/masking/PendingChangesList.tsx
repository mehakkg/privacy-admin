"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Clock, Check, Ban } from "lucide-react";
import { Pill } from "@/components/ui";
import { decideChangeAction, withdrawProposalAction, type MaskingActionResult } from "@/app/actions/masking";

export interface PendingItem {
  id: string; fieldCode: string; kind: string; proposedBy: string; proposedAt: string; ageDays: number;
  before: string; after: string; reason: string;
}

/**
 * Protection rules › Pending changes. Masking proposals awaiting the DPO. Approve
 * / reject reuse the governed decision path (reject needs a note); Admin can
 * withdraw its own. "Pending" is advisory until AuthorizationGate enforces.
 */
export function PendingChangesList({ items, role }: { items: PendingItem[]; role: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<MaskingActionResult | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const isDpo = role === "dpo";

  const run = (op: () => Promise<MaskingActionResult>, after?: () => void) =>
    start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });

  if (items.length === 0) return <div className="empty">No masking changes are awaiting approval.</div>;

  return (
    <div className="stack" style={{ gap: 8 }}>
      {result && !result.ok && <div className="notice danger"><div className="notice-title">Refused — {result.errorKind}</div><div>{result.error}</div></div>}
      {items.map((it) => (
        <div key={it.id} className="card">
          <div className="card-body">
            <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Clock size={14} style={{ color: "var(--yellow)" }} />
              <Link href={`/data-flow/protection-rules?field=${it.fieldCode}`} className="cell-primary mono">{it.fieldCode}</Link>
              <Pill tone="gray" dot={false}>{it.kind === "exception_add" ? "unmask exception" : "rule change"}</Pill>
              <span className="cell-sub" style={{ marginLeft: "auto" }}>{it.proposedBy} · {it.ageDays}d old</span>
            </div>
            <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
              <span className="cell-sub" style={{ textDecoration: "line-through" }}>{it.before}</span>
              <span className="muted">→</span>
              <strong>{it.after}</strong>
            </div>
            <p className="cell-sub" style={{ margin: "6px 0 0" }}>{it.reason}</p>

            {isDpo ? (
              rejecting === it.id ? (
                <div className="row" style={{ gap: 6, marginTop: 10 }}>
                  <input className="input sm" placeholder="Reason for rejection (required)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <button className="btn danger sm" disabled={pending || !note.trim()} onClick={() => run(() => decideChangeAction(it.id, false, note), () => { setRejecting(null); setNote(""); })}>Confirm reject</button>
                  <button className="btn ghost sm" onClick={() => setRejecting(null)}>Cancel</button>
                </div>
              ) : (
                <div className="row" style={{ gap: 6, marginTop: 10 }}>
                  <button className="btn primary sm" disabled={pending} onClick={() => run(() => decideChangeAction(it.id, true, ""))}><Check size={12} /> Approve</button>
                  <button className="btn ghost sm" onClick={() => setRejecting(it.id)}><Ban size={12} /> Reject</button>
                </div>
              )
            ) : (
              <div className="row" style={{ gap: 6, marginTop: 10, alignItems: "center" }}>
                <Pill tone="yellow" dot={false}>Awaiting Kavita Menon (DPO)</Pill>
                <button className="btn ghost sm" disabled={pending} onClick={() => run(() => withdrawProposalAction(it.id))}>Withdraw</button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
