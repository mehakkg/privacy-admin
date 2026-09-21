"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, AlertTriangle, Check, X } from "lucide-react";
import { Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { generateCampaignAction, decideCertificationItemAction, bulkCertifyAction, markCampaignCompleteAction } from "@/app/actions/certification";
import type { ActionResult } from "@/app/actions/requests";

export interface CampaignItem {
  id: string; user: string; role: string; reviewer: string;
  approvedBy: string; grantedAt: string; justification: string;
  decision: string | null;
}
export interface CampaignView {
  id: string; name: string; dueDate: string; status: "in_progress" | "complete" | "overdue";
  reviewed: number; total: number; items: CampaignItem[];
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });
  return { pending, result, run };
}

export function Assessments({ campaigns, reviewers }: { campaigns: CampaignView[]; reviewers: string[] }) {
  const { pending, result, run } = useRun();
  const [reviewer, setReviewer] = useState<string>("");

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="cell-sub" style={{ alignSelf: "center" }}>Reviewing as:</span>
          <select className="input sm" value={reviewer} onChange={(e) => setReviewer(e.target.value)} style={{ width: 210 }}>
            <option value="">All reviewers (oversight)</option>
            {reviewers.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <button className="btn primary sm" disabled={pending} onClick={() => run(() => generateCampaignAction())}><Plus size={14} /> Start certification campaign</button>
      </div>
      <ActionError result={result} />

      <div className="stack" style={{ gap: 14 }}>
        {campaigns.map((c) => <CampaignCard key={c.id} c={c} reviewer={reviewer} pending={pending} run={run} />)}
        {campaigns.length === 0 && <div className="empty" style={{ padding: 32 }}>No campaigns yet. Start one to snapshot active assignments for review.</div>}
      </div>
    </div>
  );
}

function CampaignCard({ c, reviewer, pending, run }: { c: CampaignView; reviewer: string; pending: boolean; run: (op: () => Promise<ActionResult>, after?: () => void) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [revoking, setRevoking] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const scoped = reviewer ? c.items.filter((i) => i.reviewer === reviewer) : c.items;
  const pct = c.total ? Math.round((c.reviewed / c.total) * 100) : 0;
  const toggle = (id: string) => setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const undecidedSelected = [...selected].filter((id) => scoped.find((i) => i.id === id && !i.decision));

  return (
    <div className={`campaign-card${c.status === "overdue" ? " overdue" : ""}`}>
      <div className="campaign-head">
        <div className="stack" style={{ gap: 4 }}>
          <span className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <strong>{c.name}</strong>
            {c.status === "overdue" && <span className="overdue-chip"><AlertTriangle size={12} /> Overdue</span>}
            {c.status === "complete" && <Pill tone="green" dot={false}>Complete</Pill>}
          </span>
          <span className="cell-sub">Due {c.dueDate}{reviewer && ` · your scope: ${scoped.length} item${scoped.length === 1 ? "" : "s"}`}</span>
        </div>
        <div className="stack" style={{ gap: 4, alignItems: "flex-end", minWidth: 180 }}>
          <span className="cell-sub">{c.reviewed} of {c.total} reviewed</span>
          <div className={`progress${c.status === "overdue" ? " overdue" : ""}`}><span style={{ width: `${pct}%` }} /></div>
        </div>
      </div>

      {c.status !== "complete" && (
        <div className="row" style={{ gap: 8, margin: "10px 0", flexWrap: "wrap" }}>
          {undecidedSelected.length > 0 && (
            <button className="btn sm" disabled={pending} onClick={() => run(() => bulkCertifyAction(undecidedSelected.map((id) => ({ itemId: id, decision: "certified" as const, justification: "" }))), () => setSelected(new Set()))}>
              Bulk-certify {undecidedSelected.length} selected
            </button>
          )}
          <span title={c.reviewed < c.total ? "Every item must have a decision first" : undefined}>
            <button className="btn primary sm" disabled={pending || c.reviewed < c.total} onClick={() => run(() => markCampaignCompleteAction(c.id))}>Mark campaign complete</button>
          </span>
        </div>
      )}

      <div className="table-wrap">
        <table className="dtable">
          <thead><tr><th style={{ width: 30 }} /><th>Person · role</th><th>Original grant context</th><th style={{ width: 210 }}>Decision</th></tr></thead>
          <tbody>
            {scoped.map((i) => (
              <tr key={i.id}>
                <td onClick={(e) => e.stopPropagation()}>{!i.decision && c.status !== "complete" && <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} />}</td>
                <td><div className="cell-stack"><span className="cell-primary">{i.user}</span><span className="cell-sub">{i.role}</span></div></td>
                <td className="cell-sub">Approved by <strong>{i.approvedBy}</strong> · {i.grantedAt}<br />“{i.justification}”</td>
                <td>
                  {i.decision ? (
                    <Pill tone={i.decision === "revoked" ? "red" : "green"} dot={false}>{i.decision === "revoked" ? "Revoked" : "Certified"}</Pill>
                  ) : revoking === i.id ? (
                    <span className="stack" style={{ gap: 4 }}>
                      <input className="input xs" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
                      <span className="row" style={{ gap: 4 }}>
                        <button className="btn danger xs" disabled={pending || !reason.trim()} onClick={() => run(() => decideCertificationItemAction(i.id, "revoked", reason), () => { setRevoking(null); setReason(""); })}>Confirm revoke</button>
                        <button className="btn ghost xs" onClick={() => setRevoking(null)}>Cancel</button>
                      </span>
                    </span>
                  ) : (
                    <span className="row" style={{ gap: 4 }}>
                      <button className="btn xs" disabled={pending} onClick={() => run(() => decideCertificationItemAction(i.id, "certified", ""))}><Check size={12} /> Certify</button>
                      <button className="btn btn-outline-danger xs" onClick={() => setRevoking(i.id)}><X size={12} /> Revoke</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {scoped.length === 0 && <tr><td colSpan={4}><div className="empty"><p style={{ margin: 0 }}>Nothing in your scope for this campaign.</p></div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
