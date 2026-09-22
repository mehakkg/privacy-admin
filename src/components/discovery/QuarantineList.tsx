"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Lock } from "lucide-react";
import { Pill, Notice } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { requestShareApprovalAction, decideShareApprovalAction } from "@/app/actions/scenario4";
import { SHARE_APPROVAL_TONE } from "@/lib/scenario4";
import type { ActionResult } from "@/app/actions/requests";

export interface QuarantineRow {
  id: string; fieldPath: string; sourceName: string; detectedType: string;
  request: { id: string; status: string; approverRole: string; requestedBy: string; decidedBy: string | null; decisionNote: string | null } | null;
}

export function QuarantineList({ rows, role }: { rows: QuarantineRow[]; role: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const run = (op: () => Promise<ActionResult>) => start(async () => { const r = await op(); setResult(r); if (r.ok) router.refresh(); });

  return (
    <div>
      <ActionError result={result} />
      {rows.map((r) => {
        const req = r.request;
        const canDecide = req?.status === "pending" && role === req.approverRole;
        return (
          <div key={r.id} className="card" style={{ marginBottom: 12 }}>
            <div className="card-body">
              <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Pill tone="red" dot={false}><ShieldAlert size={12} style={{ verticalAlign: "-2px" }} /> Quarantined</Pill>
                <span className="mono cell-primary">{r.fieldPath}</span>
                <span className="cell-sub">{r.sourceName} · {r.detectedType}</span>
                {req && <span style={{ marginLeft: "auto" }}><Pill tone={SHARE_APPROVAL_TONE[req.status] ?? "gray"} dot={false}>Share {req.status}</Pill></span>}
              </div>

              {!req && (
                <div style={{ marginTop: 10 }}>
                  <p className="cell-sub" style={{ margin: "0 0 8px" }}>Sharing or releasing a quarantined high-risk finding is gated — it goes through an approval request, never a direct share.</p>
                  <button className="btn sm primary" disabled={pending} onClick={() => run(() => requestShareApprovalAction(r.id))}>Request approval to share</button>
                </div>
              )}

              {req && req.status === "pending" && (
                <div style={{ marginTop: 10 }}>
                  <p className="cell-sub">Requested by {req.requestedBy} · routed to the <strong>{req.approverRole.toUpperCase()}</strong> for approval.</p>
                  {canDecide ? (
                    <div className="add-element-form" style={{ flexWrap: "wrap", marginTop: 6 }}>
                      <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="Decision note (optional)" value={note[req.id] ?? ""} onChange={(e) => setNote({ ...note, [req.id]: e.target.value })} />
                      <button className="btn sm" disabled={pending} onClick={() => run(() => decideShareApprovalAction(req.id, false, note[req.id] ?? ""))}>Deny</button>
                      <button className="btn sm primary" disabled={pending} onClick={() => run(() => decideShareApprovalAction(req.id, true, note[req.id] ?? ""))}>Approve share</button>
                    </div>
                  ) : (
                    <p className="cell-sub"><Lock size={11} style={{ verticalAlign: "-1px" }} /> Awaiting the {req.approverRole.toUpperCase()}&apos;s decision. Switch to that role to decide.</p>
                  )}
                </div>
              )}

              {req && req.status === "approved" && <Notice tone="ok" title="Share approved">Approved by {req.decidedBy}. The finding may now be shared/released.{req.decisionNote ? ` “${req.decisionNote}”` : ""}</Notice>}
              {req && req.status === "denied" && <Notice tone="danger" title="Share denied">Denied by {req.decidedBy}. The finding stays quarantined.{req.decisionNote ? ` “${req.decisionNote}”` : ""}</Notice>}
            </div>
          </div>
        );
      })}
      {rows.length === 0 && <div className="empty">No quarantined findings. High-risk findings are quarantined from the Scan results screen.</div>}
    </div>
  );
}
