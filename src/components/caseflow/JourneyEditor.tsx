"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, ArrowRight, ArrowLeft, Check, X, ChevronDown, CircleDot } from "lucide-react";
import { JOURNEY, EDITOR_STEPS, VALIDATION, PEOPLE, type EditorStep } from "@/lib/caseflow/data";

const nameOf = (id: string | null) => (id ? PEOPLE[id]?.name ?? id : null);

export function JourneyEditor() {
  const router = useRouter();
  const [tab, setTab] = useState<"steps" | "deadlines">("steps");
  const [swimlane, setSwimlane] = useState(false);
  const [validateOpen, setValidateOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [ran, setRan] = useState(false);

  const blockers = VALIDATION.filter((v) => v.kind === "blocker").length;
  const warnings = VALIDATION.filter((v) => v.kind === "warning").length;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Link href="/workflows" className="row-link" style={{ display: "inline-flex", width: "fit-content" }}><ArrowLeft size={14} /> Workflow Library</Link>

      {/* Version header */}
      <div className="cm-ed-head">
        <div className="stack" style={{ gap: 3 }}>
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <span className="cm-id">{JOURNEY.id}</span>
            <h1 className="inv-title" style={{ margin: 0, fontSize: 22 }}>{JOURNEY.name}</h1>
          </div>
          <p className="cell-sub" style={{ margin: 0 }}>Draft v{JOURNEY.draftVersion} — based on Live v{JOURNEY.liveVersion} · {JOURNEY.entity} · <span className="cm-autosave"><Check size={12} /> Autosaved</span></p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sec" onClick={() => setSwimlane((s) => !s)}>{swimlane ? "Hide" : "Show"} swimlane</button>
          <button className="btn primary" onClick={() => { setRan(true); setValidateOpen(true); }}>Validate</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="wf-tabs">
        <button className={tab === "steps" ? "on" : ""} onClick={() => setTab("steps")}>Steps &amp; Owners</button>
        <button className={tab === "deadlines" ? "on" : ""} onClick={() => setTab("deadlines")}>Deadlines &amp; Escalation {ran && <span className="wf-count">{blockers + warnings}</span>}</button>
      </div>

      {swimlane && <Swimlane />}

      {tab === "steps" ? <StepsTable /> : <DeadlinesTable />}

      {validateOpen && <ValidationDrawer blockers={blockers} warnings={warnings} onClose={() => setValidateOpen(false)} onSubmit={() => { setValidateOpen(false); setSubmitOpen(true); }} />}
      {submitOpen && <SubmitModal onClose={() => setSubmitOpen(false)} onDone={() => { setSubmitOpen(false); router.push("/workflows"); }} />}
    </div>
  );
}

function StepsTable() {
  return (
    <div className="inv-card" style={{ padding: 0, overflow: "hidden" }}>
      <table className="inv-table cm-steps">
        <thead><tr><th>#</th><th>Step</th><th>Role</th><th>Owner</th><th>Backup</th><th>Assignment rule</th><th></th></tr></thead>
        <tbody>
          {EDITOR_STEPS.map((s) => (
            <RowAndHandoff key={s.no} s={s} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowAndHandoff({ s }: { s: EditorStep }) {
  const principal = s.role === "Data Principal";
  return (
    <>
      <tr className={s.locked ? "cm-locked" : ""}>
        <td className="cell-sub tnum">{s.no}</td>
        <td><span className="row" style={{ gap: 7, alignItems: "center" }}>{s.locked && <Lock size={13} className="cm-lock" />}<span>{s.name}</span></span>{s.locked && <div className="cm-setby"><Lock size={10} /> Set by DPO — changes need DPO approval</div>}</td>
        <td className="cell-sub">{s.role}</td>
        <td>{principal ? <span className="cell-sub">Self-service</span> : nameOf(s.owner) ? <span className="cm-person">{nameOf(s.owner)}</span> : <span className="cm-empty">Set owner</span>}</td>
        <td>{principal ? <span className="cell-sub">—</span> : nameOf(s.backup) ? <span className="cm-person">{nameOf(s.backup)}</span> : <span className="cm-empty amber">Add backup</span>}</td>
        <td>{principal ? <span className="cell-sub">—</span> : <span className="cm-rule">{s.rule} <ChevronDown size={12} /></span>}</td>
        <td />
      </tr>
      {s.handoffTo && (
        <tr className="cm-handoff-row"><td colSpan={7}><span className="cm-handoff">{s.role} <ArrowRight size={13} /> {s.handoffTo}{s.handoffTo === "Data Processor" ? " (Kestrel Data Services)" : ""}</span></td></tr>
      )}
    </>
  );
}

function DeadlinesTable() {
  const steps = EDITOR_STEPS.filter((s) => s.role !== "Data Principal");
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="cm-clock">
        <div className="row" style={{ gap: 10, alignItems: "center" }}><Lock size={14} className="cm-lock" /><strong>Journey legal ceiling: {JOURNEY.legalDeadlineDays} days</strong></div>
        <p className="cell-sub" style={{ margin: "4px 0 0" }}>{JOURNEY.legalBasis} · locked. Internal targets must stay under this.</p>
      </div>
      <div className="inv-card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="inv-table cm-steps">
          <thead><tr><th>#</th><th>Step</th><th>Internal deadline</th><th>Legal ceiling</th><th>Buffer</th><th>Escalation</th></tr></thead>
          <tbody>
            {steps.map((s) => {
              const legal = s.legalDays ?? JOURNEY.legalDeadlineDays;
              const internal = s.internalDays ?? null;
              const buffer = internal != null ? legal - internal : null;
              return (
                <tr key={s.no} className={s.locked ? "cm-locked" : ""}>
                  <td className="cell-sub tnum">{s.no}</td>
                  <td>{s.name}</td>
                  <td>{internal != null ? <span className="cm-dur">{internal} days</span> : <span className="cell-sub">—</span>}</td>
                  <td><span className="cm-ceiling"><Lock size={11} /> {legal} days{s.legalBasis ? ` · ${s.legalBasis}` : ""}</span></td>
                  <td>{buffer != null ? <span className={buffer <= 3 ? "sev-warning" : "cell-sub"}>{buffer} days buffer</span> : <span className="cell-sub">—</span>}</td>
                  <td className="cell-sub">Owner → Backup → DPO</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Swimlane() {
  const lanes = JOURNEY.roles;
  return (
    <div className="cm-swim">
      {lanes.map((lane) => (
        <div key={lane} className="cm-lane">
          <div className="cm-lane-head">{lane}</div>
          <div className="cm-lane-body">
            {EDITOR_STEPS.filter((s) => s.role === lane || (lane === "Data Processor" && s.handoffTo === "Data Processor")).map((s) => (
              <span key={s.no} className={`cm-node${s.locked ? " locked" : ""}`}>{s.no}. {s.name.length > 28 ? s.name.slice(0, 28) + "…" : s.name}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ValidationDrawer({ blockers, warnings, onClose, onSubmit }: { blockers: number; warnings: number; onClose: () => void; onSubmit: () => void }) {
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="mp-drawer" role="dialog" aria-label="Validation results" style={{ width: 440 }}>
        <div className="mp-drawer-head"><strong>Validation results</strong><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="mp-drawer-body stack" style={{ gap: 12, padding: 18, overflow: "auto" }}>
          <div className={`cm-val-summary ${blockers ? "bad" : "ok"}`}>{blockers ? `${blockers} blocker${blockers === 1 ? "" : "s"} · ${warnings} warning${warnings === 1 ? "" : "s"}` : "Ready to submit"}</div>
          {VALIDATION.map((v, i) => (
            <div key={i} className={`cm-issue ${v.kind}`}>
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <span className={`cm-sev ${v.kind}`}>{v.kind === "blocker" ? "Blocker" : "Warning"}</span>
                <strong style={{ fontSize: 13 }}>{v.rule}</strong>
              </div>
              <p className="cell-sub" style={{ margin: "6px 0 0" }}>{v.step}</p>
              <p style={{ margin: "4px 0 0", fontSize: 13 }}>{v.reason}</p>
              {v.citation && <p className="cell-sub" style={{ margin: "4px 0 0" }}>Rule: {v.citation}</p>}
              <button className="row-link" style={{ marginTop: 6 }} onClick={onClose}>Fix →</button>
            </div>
          ))}
        </div>
        <div className="mp-drawer-foot" style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
          <button className="btn primary" style={{ width: "100%" }} disabled={blockers > 0} title={blockers ? `Resolve ${blockers} blocker${blockers === 1 ? "" : "s"}` : undefined} onClick={onSubmit}>Submit for DPO approval</button>
        </div>
      </aside>
    </div>
  );
}

function SubmitModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal std-modal" role="dialog" aria-modal="true" style={{ width: 600, maxWidth: "94vw" }}>
        <div className="std-modal-head"><h3 style={{ margin: 0 }}>Submit v{JOURNEY.draftVersion} for DPO approval</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="std-modal-body stack" style={{ gap: 12 }}>
          <div className="cm-change">
            <strong>What changed vs Live v{JOURNEY.liveVersion}</strong>
            <ul className="cm-change-list">
              <li>Backup owner added on 3 steps (8, 21, 24)</li>
              <li>Step 13 internal deadline tightened 5 → 3 days</li>
              <li><span className="cm-nolock">No locked-step changes</span></li>
            </ul>
          </div>
          <label className="stack" style={{ gap: 6 }}><span style={{ fontSize: 13, fontWeight: 600 }}>Note to DPO (optional)</span><textarea className="input" rows={3} maxLength={500} placeholder="Context for the approval…" /></label>
          <p className="cm-impact"><CircleDot size={13} /> {JOURNEY.openCasesLive} open cases stay on v{JOURNEY.liveVersion}; new cases use v{JOURNEY.draftVersion} after approval.</p>
        </div>
        <div className="std-modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={onDone}>Submit to DPO</button></div>
      </div>
    </div>
  );
}
