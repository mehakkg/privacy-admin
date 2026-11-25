"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Lock, Clock, X, CircleDot, ShieldCheck, AlertTriangle } from "lucide-react";
import { CASE, type ThreeState } from "@/lib/caseflow/data";

const stateTone: Record<ThreeState, string> = {
  "Pending": "gray",
  "Partially complete": "yellow",
  "Fully verified": "green",
};

export function CaseWorkspace() {
  // local system states so "Resolve" can flip the one pending processor
  const [systems, setSystems] = useState(CASE.systems);
  const [closed, setClosed] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  const allVerified = systems.every((s) => s.state === "Fully verified");
  const pending = systems.filter((s) => s.state !== "Fully verified");

  function resolve(name: string) {
    setSystems((prev) => prev.map((s) => (s.name === name ? { ...s, state: "Fully verified", detail: "Evidence received · just now" } : s)));
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Link href="/cases" className="row-link" style={{ display: "inline-flex", width: "fit-content" }}><ArrowLeft size={14} /> My Work</Link>

      {/* Case header */}
      <div className="cm-ed-head">
        <div className="stack" style={{ gap: 3 }}>
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <span className="cm-id">{CASE.id}</span>
            <h1 className="inv-title" style={{ margin: 0, fontSize: 22 }}>{CASE.subject} · Erasure</h1>
          </div>
          <p className="cell-sub" style={{ margin: 0 }}>{CASE.journey} · v{CASE.version} · {CASE.channel} · opened {CASE.opened}</p>
        </div>
        <div className="stack" style={{ gap: 6, alignItems: "flex-end" }}>
          <span className={`pill ${closed ? "green" : stateTone[CASE.status]}`}>{closed ? "Closed — fully verified" : CASE.status}</span>
          {!closed && <span className="cm-sla-chip danger"><Clock size={13} /> {CASE.slaRemaining} to legal deadline</span>}
        </div>
      </div>

      <div className="cm-ws">
        {/* LEFT — context */}
        <aside className="cm-ws-col inv-card stack" style={{ gap: 14 }}>
          <div className="stack" style={{ gap: 6 }}>
            <strong style={{ fontSize: 13 }}>Request context</strong>
            {CASE.context.map((c) => (
              <div key={c.k} className="cm-ctx"><span className="cm-ctx-k">{c.k}</span><span className="cm-ctx-v">{c.v}</span></div>
            ))}
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <strong style={{ fontSize: 13 }}>Data in scope</strong>
            <div className="cm-chips">{CASE.fields.map((f) => <span key={f} className="chip">{f}</span>)}</div>
          </div>
        </aside>

        {/* CENTER — current action + steps + systems */}
        <section className="cm-ws-col stack" style={{ gap: 14 }}>
          {!closed && (
            <div className="cm-action">
              <div className="stack" style={{ gap: 2 }}>
                <span className="cell-sub">Step {CASE.currentStep.no} · current</span>
                <strong style={{ fontSize: 15 }}>{CASE.currentStep.name}</strong>
              </div>
              {allVerified ? (
                <button className="btn primary" onClick={() => setCloseOpen(true)}><ShieldCheck size={15} /> Close with evidence</button>
              ) : (
                <span className="cm-action-wait"><AlertTriangle size={14} /> {pending.length} system{pending.length === 1 ? "" : "s"} not yet confirmed</span>
              )}
            </div>
          )}

          {/* per-system completion grid (C5) */}
          <div className="inv-card stack" style={{ gap: 10 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 13 }}>Per-system deletion ({systems.filter((s) => s.state === "Fully verified").length}/{systems.length} verified)</strong>
              {!allVerified && <span className="cell-sub">Close unlocks when all are verified</span>}
            </div>
            <table className="inv-table cm-sys">
              <thead><tr><th>System / processor</th><th>Type</th><th>Status</th><th>Evidence</th><th></th></tr></thead>
              <tbody>
                {systems.map((s) => (
                  <tr key={s.name}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td className="cell-sub">{s.type}</td>
                    <td><span className={`pill ${stateTone[s.state]}`}>{s.state}</span></td>
                    <td className="cell-sub">{s.detail}</td>
                    <td style={{ textAlign: "right" }}>{s.state !== "Fully verified" && !closed ? <button className="btn sec cm-mini" onClick={() => resolve(s.name)}>Mark verified</button> : <Check size={15} className="cm-ok" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* steps rail */}
          <div className="inv-card stack" style={{ gap: 8 }}>
            <strong style={{ fontSize: 13 }}>Journey steps</strong>
            <ol className="cm-stepline">
              {CASE.steps.map((st) => {
                const state = closed && st.state !== "done" ? "done" : st.state;
                return (
                  <li key={st.no} className={`cm-stepitem ${state}`}>
                    <span className="cm-stepdot">{state === "done" ? <Check size={12} /> : state === "current" ? <CircleDot size={12} /> : <Lock size={11} />}</span>
                    <span><span className="cell-sub">Step {st.no}</span> {st.name}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* RIGHT — timeline */}
        <aside className="cm-ws-col inv-card stack" style={{ gap: 10 }}>
          <strong style={{ fontSize: 13 }}>Audit timeline</strong>
          <ul className="cm-timeline">
            {CASE.timeline.map((t, i) => (
              <li key={i}><span className="cm-tl-dot" /><div className="stack" style={{ gap: 1 }}><span style={{ fontSize: 13 }}>{t.what}</span><span className="cell-sub">{t.t} · {t.who}</span></div></li>
            ))}
            {closed && (
              <li><span className="cm-tl-dot done" /><div className="stack" style={{ gap: 1 }}><span style={{ fontSize: 13, fontWeight: 600 }}>Case closed with cross-system evidence</span><span className="cell-sub">just now · You</span></div></li>
            )}
          </ul>
        </aside>
      </div>

      {closeOpen && !closed && (
        <CloseModal onClose={() => setCloseOpen(false)} onDone={() => { setClosed(true); setCloseOpen(false); }} verifiedCount={systems.length} />
      )}
    </div>
  );
}

function CloseModal({ onClose, onDone, verifiedCount }: { onClose: () => void; onDone: () => void; verifiedCount: number }) {
  const [ack, setAck] = useState(false);
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal std-modal" role="dialog" aria-modal="true" style={{ width: 560, maxWidth: "94vw" }}>
        <div className="std-modal-head"><h3 style={{ margin: 0 }}>Close {CASE.id} with evidence</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="std-modal-body stack" style={{ gap: 12 }}>
          <div className="cm-gate ok"><ShieldCheck size={16} /> All {verifiedCount} systems and processors report <strong>Fully verified</strong>. Closing is unlocked.</div>
          <div className="stack" style={{ gap: 6 }}>
            <strong style={{ fontSize: 13 }}>Completion evidence to seal</strong>
            <ul className="cm-change-list">
              <li>Per-system API confirmations ({verifiedCount})</li>
              <li>Processor deletion certificate — Kestrel Data Services</li>
              <li>Retention-exception review — no statutory hold</li>
            </ul>
          </div>
          <label className="row" style={{ gap: 8, alignItems: "flex-start", fontSize: 13 }}>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 3 }} />
            <span>I confirm deletion is complete across all systems and that this closure, with its evidence, is written to the immutable audit log and the data principal is notified.</span>
          </label>
        </div>
        <div className="std-modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!ack} onClick={onDone}><Lock size={14} /> Seal &amp; close</button></div>
      </div>
    </div>
  );
}
