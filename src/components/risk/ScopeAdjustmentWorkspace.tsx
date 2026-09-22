"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, ShieldAlert, Lock, CheckCircle2 } from "lucide-react";
import { Pill, Notice } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { investigateExceptionAction, proposeScopeAdjustmentAction, decideScopeAdjustmentAction, acceptCounterProposalAction } from "@/app/actions/scenario7";
import { PROPOSAL_STATUS_TONE, PROPOSAL_STATUS_LABEL } from "@/lib/scenario7";
import type { ActionResult } from "@/app/actions/requests";

export interface Proposal { id: string; originalScope: string; proposedScope: string; status: string; cisoCounterScope: string | null; proposedBy: string; decidedBy: string | null }
export interface ExceptionView { id: string; ruleName: string; dataCategory: string; process: string; blockingClause: string | null; currentScope: string; investigatedAt: string | null; resolution: string; proposals: Proposal[] }

/** A stored scope is either a JSON array of connected-system IDs (the implemented
 *  scope) or a free-text narrower scope (a proposal). Render IDs as their system
 *  names; leave free text untouched. */
function readableScope(raw: string, names: Record<string, string>): string {
  const trimmed = (raw ?? "").trim();
  if (trimmed.startsWith("[")) {
    try {
      const ids = JSON.parse(trimmed);
      if (Array.isArray(ids)) {
        return ids.length ? ids.map((id) => names[id] ?? id).join(", ") : "No systems in scope";
      }
    } catch {
      /* not JSON — fall through to the raw string */
    }
  }
  return trimmed;
}

export function ScopeAdjustmentWorkspace({ exceptions, role, systemNames = {} }: { exceptions: ExceptionView[]; role: string; systemNames?: Record<string, string> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [proposeFor, setProposeFor] = useState<string | null>(null);
  const [proposed, setProposed] = useState("");
  const [counterFor, setCounterFor] = useState<string | null>(null);
  const [counter, setCounter] = useState("");
  const canCiso = role === "ciso" || role === "admin";
  const run = (op: () => Promise<ActionResult>, after?: () => void) => start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });

  if (exceptions.length === 0) return <div className="empty">No rule exceptions under investigation. Exceptions raised from Protection rules appear here.</div>;

  return (
    <div>
      <ActionError result={result} />
      {exceptions.map((e) => {
        const active = e.proposals.find((p) => p.status === "pending_ciso" || p.status === "counter_proposed");
        return (
          <div key={e.id} className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">{e.ruleName} <span className="cell-sub">exception</span>
              <span style={{ marginLeft: "auto" }}><Pill tone={e.resolution === "scope_adjusted" ? "green" : e.resolution === "denied" ? "red" : "yellow"} dot={false}>{e.resolution === "scope_adjusted" ? "Scope adjusted" : e.resolution === "denied" ? "Denied" : "Open"}</Pill></span>
            </div>
            <div className="card-body">
              {/* Screen 2 — the specific blocked process + clause. */}
              <div className="notice warn" style={{ marginBottom: 12 }}>
                <div className="notice-title"><ShieldAlert size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />Blocked: {e.process}</div>
                <div>Blocked by the <strong>{e.ruleName}</strong> rule ({e.dataCategory}). Blocking clause: {e.blockingClause ?? "the rule's current implemented scope"}.</div>
              </div>
              <div className="kv"><span className="k">Current implemented scope</span><span className="mono">{readableScope(e.currentScope, systemNames)}</span></div>

              {/* Investigate → propose (Screen 3). */}
              {!e.investigatedAt && e.resolution === "pending" && (
                <button className="btn sm" style={{ marginTop: 10 }} disabled={pending} onClick={() => run(() => investigateExceptionAction(e.id))}><Search size={13} /> Investigate</button>
              )}

              {e.investigatedAt && e.resolution === "pending" && !active && (
                proposeFor === e.id ? (
                  <div style={{ marginTop: 10 }}>
                    <label className="fld"><span>Proposed narrower scope</span><input className="input" value={proposed} onChange={(ev) => setProposed(ev.target.value)} placeholder="e.g. Core Banking only (exclude Marketing)" /></label>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn xs" onClick={() => setProposeFor(null)}>Cancel</button>
                      <button className="btn xs primary" disabled={pending || !proposed.trim()} onClick={() => run(() => proposeScopeAdjustmentAction(e.id, proposed), () => { setProposeFor(null); setProposed(""); })}>Submit for CISO approval</button>
                    </div>
                  </div>
                ) : (
                  <button className="btn sm primary" style={{ marginTop: 10 }} onClick={() => { setProposeFor(e.id); setProposed(""); }}>Propose scope adjustment <ArrowRight size={13} /></button>
                )
              )}

              {/* Diff + CISO decision (Screen 3). */}
              {active && (
                <div style={{ marginTop: 12 }}>
                  <div className="section-label">Original vs proposed scope</div>
                  <div className="dprr-grid" style={{ marginTop: 4 }}>
                    <div className="card"><div className="card-body"><span className="cell-sub">Original (preserved)</span><div className="mono">{readableScope(active.originalScope, systemNames)}</div></div></div>
                    <div className="card"><div className="card-body"><span className="cell-sub">Proposed</span><div className="mono">{readableScope((active.status === "counter_proposed" ? active.cisoCounterScope : active.proposedScope) ?? "", systemNames)}</div></div></div>
                  </div>
                  <p className="cell-sub" style={{ margin: "8px 0" }}>Status: <Pill tone={PROPOSAL_STATUS_TONE[active.status]} dot={false}>{PROPOSAL_STATUS_LABEL[active.status]}</Pill> · proposed by {active.proposedBy}</p>

                  {active.status === "pending_ciso" && (canCiso ? (
                    counterFor === active.id ? (
                      <div className="add-element-form" style={{ flexWrap: "wrap" }}>
                        <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="Counter scope" value={counter} onChange={(ev) => setCounter(ev.target.value)} />
                        <button className="btn sm" onClick={() => setCounterFor(null)}>Cancel</button>
                        <button className="btn sm primary" disabled={pending || !counter.trim()} onClick={() => run(() => decideScopeAdjustmentAction(active.id, "counter", counter), () => { setCounterFor(null); setCounter(""); })}>Send counter</button>
                      </div>
                    ) : (
                      <div className="row" style={{ gap: 8 }}>
                        <button className="btn sm" disabled={pending} onClick={() => run(() => decideScopeAdjustmentAction(active.id, "deny", ""))}>Deny</button>
                        <button className="btn sm" disabled={pending} onClick={() => { setCounterFor(active.id); setCounter(active.proposedScope); }}>Counter-propose</button>
                        <button className="btn sm primary" disabled={pending} onClick={() => run(() => decideScopeAdjustmentAction(active.id, "approve", ""))}>Approve</button>
                      </div>
                    )
                  ) : <p className="cell-sub"><Lock size={11} style={{ verticalAlign: "-1px" }} /> Awaiting the CISO&apos;s decision. Switch to CISO to decide.</p>)}

                  {active.status === "counter_proposed" && (
                    <Notice tone="info" title="CISO counter-proposed a different scope">
                      The CISO returned <span className="mono">{readableScope(active.cisoCounterScope ?? "", systemNames)}</span>. <button className="btn xs primary" disabled={pending} onClick={() => run(() => acceptCounterProposalAction(active.id))}>Accept counter-proposal</button>
                    </Notice>
                  )}
                </div>
              )}

              {e.resolution === "scope_adjusted" && <Notice tone="ok" title="Resolved by CISO-approved scope adjustment"><CheckCircle2 size={13} style={{ verticalAlign: "-2px" }} /> The rule&apos;s implemented scope was narrowed; the original scope is preserved in the proposal history. The rule was never disabled.</Notice>}
              {e.resolution === "denied" && <Notice tone="danger" title="Denied — rule scope unchanged">The exception remains unresolved and the rule&apos;s scope is unchanged.</Notice>}
            </div>
          </div>
        );
      })}
      <Notice tone="policy" title="No disable path">The only resolutions to a rule exception are a CISO-approved scope adjustment or denial. There is no action anywhere in this flow to disable the rule.</Notice>
    </div>
  );
}
