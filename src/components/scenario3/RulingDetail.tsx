"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gavel, Lock, PlayCircle, CheckCircle2 } from "lucide-react";
import { Pill, Notice } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { recordRulingAction, executeRulingAction } from "@/app/actions/scenario3";
import { RULING_DECISIONS, RULING_DECISION_LABEL, executionLabel } from "@/lib/scenario3";
import type { ActionResult } from "@/app/actions/requests";

export interface RulingView {
  escalationId: string;
  customerName: string;
  scope: string;
  actionRequested: string;
  obligationInConflict: string;
  supportingEvidence: string[];
  compiledBy: string;
  submittedAt: string;
  conflictDetectedAt: string;
  role: string;
  ruling: { id: string; decision: string; reasoning: string; legalBasis: string; ruledBy: string; ruledAt: string } | null;
  execution: { executedBy: string; executedAt: string; threadRef: string } | null;
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>) => start(async () => { const r = await op(); setResult(r); if (r.ok) router.refresh(); });
  return { pending, result, run };
}

export function RulingDetail({ v }: { v: RulingView }) {
  const { pending, result, run } = useRun();
  const [decision, setDecision] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [legalBasis, setLegalBasis] = useState("");
  const canRule = v.role === "dpo";
  const complete = Boolean(decision && reasoning.trim() && legalBasis.trim());

  return (
    <div>
      <ActionError result={result} />

      {/* Read-only escalation context. */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">Escalation context (read-only)</div>
        <div className="card-body">
          <div className="kv"><span className="k">Customer</span><span>{v.customerName}</span></div>
          <div className="kv"><span className="k">Deletion scope</span><span>{v.scope}</span></div>
          <div className="kv"><span className="k">Action requested</span><span>{v.actionRequested}</span></div>
          <div className="kv"><span className="k">Obligation in conflict</span><span>{v.obligationInConflict}</span></div>
          <div className="kv"><span className="k">Compiled by</span><span>{v.compiledBy} · {v.submittedAt}</span></div>
          <div className="kv"><span className="k">Supporting evidence</span><span>{v.supportingEvidence.map((e, n) => <span key={n} className="cell-sub" style={{ display: "block" }}>• {e}</span>)}</span></div>
        </div>
      </div>

      {/* SCREEN 7 — Ruling form (no ruling yet). */}
      {!v.ruling && (
        <div className="card">
          <div className="card-head"><Gavel size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />DPO ruling</div>
          <div className="card-body">
            {!canRule && <Notice tone="warn" title="Only the DPO can rule">Switch the acting role to Data Protection Officer to issue this ruling.</Notice>}
            <label className="fld"><span>Decision</span>
              <select className="input" value={decision} onChange={(e) => setDecision(e.target.value)} disabled={!canRule}>
                <option value="">Select…</option>
                {RULING_DECISIONS.map((d) => <option key={d} value={d}>{RULING_DECISION_LABEL[d]}</option>)}
              </select>
            </label>
            <label className="fld"><span>Reasoning (required)</span>
              <textarea className="input" rows={3} value={reasoning} onChange={(e) => setReasoning(e.target.value)} disabled={!canRule} placeholder="Why this decision follows from the obligation and the request." />
            </label>
            <label className="fld"><span>Legal basis (required)</span>
              <input className="input" value={legalBasis} onChange={(e) => setLegalBasis(e.target.value)} disabled={!canRule} placeholder="e.g. DPDP Act 2023 s.8(7) proviso; PMLA 2002 s.12" />
            </label>
            <button className="btn primary" style={{ marginTop: 4 }} disabled={pending || !canRule || !complete} onClick={() => run(() => recordRulingAction(v.escalationId, decision, reasoning, legalBasis))}>
              Issue ruling
            </button>
            <p className="cell-sub" style={{ marginTop: 8 }}><Lock size={11} style={{ verticalAlign: "-1px" }} /> Once issued a ruling is immutable — a correction is a new ruling that supersedes it, never an edit.</p>
          </div>
        </div>
      )}

      {/* Ruling issued — immutable display. */}
      {v.ruling && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-head"><Lock size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />DPO ruling — immutable</div>
            <div className="card-body">
              <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 8 }}>
                <Pill tone={v.ruling.decision === "deny" ? "red" : v.ruling.decision === "modify" ? "yellow" : "green"} dot={false}>{RULING_DECISION_LABEL[v.ruling.decision] ?? v.ruling.decision}</Pill>
                <span className="cell-sub">by {v.ruling.ruledBy} · {v.ruling.ruledAt}</span>
              </div>
              <div className="kv"><span className="k">Reasoning</span><span>{v.ruling.reasoning}</span></div>
              <div className="kv"><span className="k">Legal basis</span><span className="mono">{v.ruling.legalBasis}</span></div>
            </div>
          </div>

          {/* SCREEN 8 — Execution, labelled from the ruling. */}
          {!v.execution ? (
            <div className="card"><div className="card-body">
              <p className="cell-sub" style={{ margin: "0 0 10px" }}>The execution action is constrained to this ruling — it carries the ruling&apos;s decision, and writes the escalation and its resolution as one linked audit thread.</p>
              <button className="btn primary" disabled={pending} onClick={() => run(() => executeRulingAction(v.ruling!.id, v.escalationId))}>
                <PlayCircle size={15} /> {executionLabel(v.ruling.decision, v.ruling.ruledAt)}
              </button>
            </div></div>
          ) : (
            <div className="card">
              <div className="card-head"><CheckCircle2 size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />Executed · linked audit thread <span className="mono cell-sub" style={{ marginLeft: 6 }}>{v.execution.threadRef}</span></div>
              <div className="card-body">
                <ol className="thread">
                  <li><span className="thread-dot" /> <span><strong>Conflict detected</strong><span className="cell-sub"> · {v.conflictDetectedAt}</span></span></li>
                  <li><span className="thread-dot" /> <span><strong>Escalated to DPO</strong><span className="cell-sub"> · {v.submittedAt} · {v.compiledBy}</span></span></li>
                  <li><span className="thread-dot" /> <span><strong>Ruling issued: {RULING_DECISION_LABEL[v.ruling.decision]}</strong><span className="cell-sub"> · {v.ruling.ruledAt} · {v.ruling.ruledBy}</span></span></li>
                  <li><span className="thread-dot done" /> <span><strong>Executed</strong><span className="cell-sub"> · {v.execution.executedAt} · {v.execution.executedBy}</span></span></li>
                </ol>
                <p className="cell-sub" style={{ marginTop: 8 }}>The escalation-raised and resolution-executed audit entries share reference <span className="mono">{v.execution.threadRef}</span> — one continuous record, not two independent lines.</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
