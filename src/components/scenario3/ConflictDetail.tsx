"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldAlert, Plus, ArrowRight, Trash2 } from "lucide-react";
import { Pill, Notice } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { executeDeletionAction, escalateConflictAction } from "@/app/actions/scenario3";
import { DELETION_STATUS_LABEL, DELETION_STATUS_TONE } from "@/lib/scenario3";
import type { ActionResult } from "@/app/actions/requests";

export interface InstructionDetail {
  id: string;
  customerId: string;
  customerName: string;
  scope: string;
  source: string;
  deadline: string | null;
  status: string;
  conflict: { obligationDescription: string; obligationReference: string } | null;
  retention: { dataCategory: string; legalBasis: string; statuteRef: string; fieldPaths: string[]; expiryCondition: string } | null;
  escalation: { id: string; actionRequested: string; obligationInConflict: string; supportingEvidence: string[]; compiledBy: string; submittedAt: string; hasRuling: boolean } | null;
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>) => start(async () => { const r = await op(); setResult(r); if (r.ok) router.refresh(); });
  return { pending, result, run };
}

export function ConflictDetail({ inst }: { inst: InstructionDetail }) {
  const { pending, result, run } = useRun();
  const [actionRequested, setActionRequested] = useState("Proceed with the erasure notwithstanding the retention obligation, to the extent legally permissible.");
  const [extra, setExtra] = useState<string[]>([]);
  const [newEv, setNewEv] = useState("");

  const autoEvidence = inst.conflict
    ? [`Retention record: ${inst.conflict.obligationReference}`, `Deletion instruction: ${inst.id.slice(0, 10)}… (${inst.scope})`]
    : [];

  return (
    <div>
      <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <Pill tone={DELETION_STATUS_TONE[inst.status] ?? "gray"} dot={false}>{DELETION_STATUS_LABEL[inst.status] ?? inst.status}</Pill>
        <span className="cell-sub">Customer <strong>{inst.customerName}</strong> · scope: {inst.scope} · source {inst.source}{inst.deadline ? ` · deadline ${inst.deadline}` : ""}</span>
      </div>

      <ActionError result={result} />

      {/* Clean, no conflict → the happy-path execution action IS present. */}
      {inst.status === "queued" && !inst.conflict && (
        <div className="card"><div className="card-body">
          <Notice tone="ok" title="No retention conflict">This deletion has no conflicting retention obligation. It can be executed directly — its execution is logged automatically.</Notice>
          <button className="btn primary" style={{ marginTop: 12 }} disabled={pending} onClick={() => run(() => executeDeletionAction(inst.id))}>Execute deletion</button>
        </div></div>
      )}

      {/* Conflict → the Retention Conflict Block. The normal execution action is
          ABSENT (not disabled). Only "Escalate to DPO" is offered. */}
      {inst.status === "conflict_detected" && inst.conflict && (
        <>
          <div className="notice danger" style={{ marginBottom: 16 }}>
            <div className="notice-title"><ShieldAlert size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />Retention conflict — deletion blocked</div>
            <div>
              This deletion conflicts with a statutory retention obligation: <strong>{inst.conflict.obligationReference}</strong>. {inst.conflict.obligationDescription} The normal execution action is withheld — this can only be resolved by a DPO ruling.
            </div>
          </div>

          {inst.retention && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-head">Retention record (for context)</div>
              <div className="card-body">
                <div className="kv"><span className="k">Data category</span><span>{inst.retention.dataCategory}</span></div>
                <div className="kv"><span className="k">Legal basis</span><span>{inst.retention.legalBasis}</span></div>
                <div className="kv"><span className="k">Statute</span><span className="mono">{inst.retention.statuteRef}</span></div>
                <div className="kv"><span className="k">Protected fields</span><span>{inst.retention.fieldPaths.join(", ") || "—"}</span></div>
                <div className="kv"><span className="k">Expiry condition</span><span>{inst.retention.expiryCondition}</span></div>
              </div>
            </div>
          )}

          {/* SCREEN 6 — Escalation compiler. Structured, all fields required. */}
          <div className="card">
            <div className="card-head">Compile escalation to DPO</div>
            <div className="card-body">
              <label className="fld"><span>Action requested (required)</span>
                <textarea className="input" rows={2} value={actionRequested} onChange={(e) => setActionRequested(e.target.value)} />
              </label>
              <label className="fld"><span>Obligation in conflict (pre-filled)</span>
                <input className="input" value={`${inst.conflict.obligationDescription} (${inst.conflict.obligationReference})`} readOnly />
              </label>
              <div className="fld">
                <span>Supporting evidence (retention record + instruction auto-attached)</span>
                <ul className="ext-list" style={{ marginTop: 4 }}>
                  {autoEvidence.map((e, n) => <li key={`a${n}`}><span className="cell-sub">🔒 {e}</span></li>)}
                  {extra.map((e, n) => (
                    <li key={`e${n}`} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <span>{e}</span>
                      <button className="btn ghost xs" onClick={() => setExtra(extra.filter((_, i) => i !== n))}><Trash2 size={12} /></button>
                    </li>
                  ))}
                </ul>
                <div className="add-element-form" style={{ marginTop: 6 }}>
                  <input className="input" style={{ flex: 1 }} placeholder="Add more evidence (optional)" value={newEv} onChange={(e) => setNewEv(e.target.value)} />
                  <button className="btn sm" disabled={!newEv.trim()} onClick={() => { setExtra([...extra, newEv.trim()]); setNewEv(""); }}><Plus size={13} /> Add</button>
                </div>
              </div>
              <button className="btn primary" style={{ marginTop: 12 }} disabled={pending || !actionRequested.trim()} onClick={() => run(() => escalateConflictAction(inst.id, actionRequested, extra))}>
                Escalate to DPO <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Escalated → submitted, routed to the DPO ruling queue. */}
      {inst.status === "escalated" && inst.escalation && (
        <div className="card"><div className="card-body">
          <Notice tone="warn" title="Escalated to the DPO — awaiting ruling">
            Compiled by {inst.escalation.compiledBy} on {inst.escalation.submittedAt}. Action requested: “{inst.escalation.actionRequested}”.
          </Notice>
          <p style={{ marginTop: 10 }}><Link href={`/audit-trail/rulings/${inst.escalation.id}`} className="btn sm">Open in DPO ruling queue →</Link></p>
        </div></div>
      )}

      {inst.status === "executed" && (
        <div className="card"><div className="card-body">
          <Notice tone="ok" title="Executed">This instruction has been executed{inst.escalation ? " per the DPO ruling — see the linked audit thread on the ruling screen" : " (no conflict)"}.</Notice>
          {inst.escalation && <p style={{ marginTop: 10 }}><Link href={`/audit-trail/rulings/${inst.escalation.id}`} className="btn sm">View ruling &amp; linked thread →</Link></p>}
        </div></div>
      )}
    </div>
  );
}
