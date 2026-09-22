"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ShieldAlert, ShieldCheck, Plus, Trash2, PlayCircle, RotateCw, ArrowUpRight, FileCheck2, Lock } from "lucide-react";
import { Pill, Notice } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { ActionError } from "@/components/actions";
import { confirmScopeAction, executeFulfillmentAction, verifyManualSystemAction, retrySystemAction, escalateSystemAction, compileCompletionAction } from "@/app/actions/fulfillment";
import { SYS_STATUS_LABEL, SYS_STATUS_TONE } from "@/lib/scenario3";
import type { ActionResult } from "@/app/actions/requests";

export interface SystemRow {
  id: string; name: string; kind: string; status: string;
  confirmationRef: string | null; errorDetail: string | null; manualNote: string | null; verifiedBy: string | null;
  addedManually: boolean; addNote: string | null; attemptCount: number;
}
export interface FulfillmentView {
  id: string; customerId: string; customerName: string; scope: string; source: string;
  deadlineLabel: string | null; deadlineBand: string | null;
  status: string;
  retention: { conflicted: boolean; cleared: boolean; rulingDecision: string | null; deletionHref: string };
  scopeConfirmed: boolean;
  lookupPreview: { name: string; kind: string }[];
  systems: SystemRow[];
  executed: boolean;
  completedAt: string | null;
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>, after?: () => void) => start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });
  return { pending, result, run };
}

const KIND_LABEL: Record<string, string> = { automated: "Automated", manual: "Manual", processor: "Processor" };

export function FulfillmentWorkspace({ v }: { v: FulfillmentView }) {
  const { pending, result, run } = useRun();
  const [adds, setAdds] = useState<{ name: string; note: string }[]>([]);
  const [addName, setAddName] = useState(""); const [addNote, setAddNote] = useState("");
  const [investigate, setInvestigate] = useState<SystemRow | null>(null);
  const [manualFor, setManualFor] = useState<SystemRow | null>(null);
  const [manualNote, setManualNote] = useState("");

  const allConfirmed = v.systems.length > 0 && v.systems.every((s) => s.status === "confirmed");
  const openCount = v.systems.filter((s) => s.status !== "confirmed").length;
  const canExecute = v.scopeConfirmed && v.retention.cleared && !v.executed && v.systems.length > 0;

  const stage = v.completedAt ? "done" : allConfirmed && v.executed ? "evidence" : v.executed ? "completion" : v.scopeConfirmed ? "execute" : "scope";

  const Step = ({ id, label, done }: { id: string; label: string; done: boolean }) => (
    <span className={`step${stage === id ? " active" : ""}${done ? " done" : ""}`}><span className="step-label">{label}</span></span>
  );

  return (
    <div>
      <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <span className="cell-sub">Customer <strong>{v.customerName}</strong> · scope: {v.scope} · source {v.source}</span>
        {v.deadlineLabel && <span style={{ marginLeft: "auto", color: v.deadlineBand === "breached" ? "var(--red)" : v.deadlineBand === "due_soon" ? "var(--yellow)" : "var(--text-3)", fontWeight: 600 }}>{v.deadlineLabel}</span>}
      </div>

      <nav className="stepper" style={{ margin: "8px 0 16px" }}>
        <Step id="scope" label="Scope" done={v.scopeConfirmed} />
        <Step id="retention" label="Retention" done={v.retention.cleared} />
        <Step id="execute" label="Execute" done={v.executed} />
        <Step id="completion" label="Completion" done={allConfirmed} />
        <Step id="evidence" label="Evidence & notify" done={Boolean(v.completedAt)} />
      </nav>

      <ActionError result={result} />

      {/* Retention gate (Scenario 3) — reached via a real path, not reimplemented. */}
      {v.retention.conflicted && !v.retention.cleared && (
        <div className="notice danger" style={{ marginBottom: 16 }}>
          <div className="notice-title"><ShieldAlert size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />Retention check not cleared</div>
          <div>This deletion hit a retention conflict. It must pass the retention gate — a DPO ruling — before execution. <Link href={v.retention.deletionHref}>Open the retention conflict block →</Link></div>
        </div>
      )}
      {v.retention.cleared && (
        <p className="cell-sub" style={{ margin: "0 0 14px" }}><ShieldCheck size={13} style={{ verticalAlign: "-2px", color: "var(--green)" }} /> Retention check cleared{v.retention.rulingDecision ? ` — DPO ruling: ${v.retention.rulingDecision}` : " — no conflict"}.</p>
      )}

      {/* SCREEN 2 — Scope confirmation. */}
      {!v.scopeConfirmed && (
        <div className="card"><div className="card-head">Confirm scope</div><div className="card-body">
          <p className="cell-sub" style={{ margin: "0 0 8px" }}>The data-location lookup found {v.lookupPreview.length} system{v.lookupPreview.length === 1 ? "" : "s"}/processor{v.lookupPreview.length === 1 ? "" : "s"} holding this customer&apos;s data. Add any the lookup missed, then confirm.</p>
          <ul className="ext-list" style={{ marginBottom: 10 }}>
            {v.lookupPreview.map((p, n) => <li key={n} className="row" style={{ justifyContent: "space-between" }}><span>{p.name}</span><Pill tone="gray" dot={false}>{KIND_LABEL[p.kind] ?? p.kind}</Pill></li>)}
            {adds.map((a, n) => <li key={`a${n}`} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}><span>{a.name} <span className="cell-sub">— {a.note}</span></span><button className="btn ghost xs" onClick={() => setAdds(adds.filter((_, i) => i !== n))}><Trash2 size={12} /></button></li>)}
            {v.lookupPreview.length === 0 && adds.length === 0 && <li className="cell-sub">Lookup returned no systems — add manually if you know of any.</li>}
          </ul>
          <div className="add-element-form" style={{ flexWrap: "wrap" }}>
            <input className="input" placeholder="System the lookup missed" value={addName} onChange={(e) => setAddName(e.target.value)} />
            <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder="Why it was missed (required)" value={addNote} onChange={(e) => setAddNote(e.target.value)} />
            <button className="btn sm" disabled={!addName.trim() || !addNote.trim()} onClick={() => { setAdds([...adds, { name: addName.trim(), note: addNote.trim() }]); setAddName(""); setAddNote(""); }}><Plus size={13} /> Add</button>
          </div>
          <button className="btn primary" style={{ marginTop: 12 }} disabled={pending} onClick={() => run(() => confirmScopeAction(v.id, adds), () => setAdds([]))}>Confirm scope &amp; proceed</button>
        </div></div>
      )}

      {/* SCREEN 4 — Execution trigger. */}
      {v.scopeConfirmed && !v.executed && (
        <div className="card"><div className="card-head">Execute deletion</div><div className="card-body">
          <p className="cell-sub" style={{ margin: "0 0 10px" }}>One action fires the deletion across all {v.systems.length} confirmed systems and processors simultaneously.</p>
          {!canExecute && <Notice tone="warn" title="Not ready">{!v.retention.cleared ? "The retention check must clear first." : "Confirm the scope first."}</Notice>}
          <button className="btn primary" style={{ marginTop: 10 }} disabled={pending || !canExecute} onClick={() => run(() => executeFulfillmentAction(v.id))}><PlayCircle size={15} /> Execute deletion across all systems</button>
        </div></div>
      )}

      {/* SCREEN 5 — Cross-system completion checklist. */}
      {v.executed && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">Cross-system completion <span className="cell-sub">{v.systems.filter((s) => s.status === "confirmed").length}/{v.systems.length} confirmed</span></div>
          <div className="card-body" style={{ padding: 0 }}>
            {v.systems.map((s) => (
              <div key={s.id} className="chk-row">
                <div className="chk-main">
                  <span className="cell-primary">{s.name} {s.addedManually && <span className="cell-sub">(added manually)</span>}</span>
                  <span className="cell-sub">{KIND_LABEL[s.kind] ?? s.kind}{s.confirmationRef ? ` · ${s.confirmationRef}` : ""}{s.verifiedBy ? ` · verified by ${s.verifiedBy}` : ""}</span>
                </div>
                <div className="chk-actions">
                  <Pill tone={SYS_STATUS_TONE[s.status] ?? "gray"} dot={false}>{SYS_STATUS_LABEL[s.status] ?? s.status}</Pill>
                  {s.status === "manual_required" && <button className="btn xs primary" disabled={pending} onClick={() => { setManualFor(s); setManualNote(""); }}><Check size={12} /> Verify</button>}
                  {s.status === "pending" && s.kind === "processor" && <button className="btn xs" disabled={pending} onClick={() => { setManualFor(s); setManualNote(""); }}>Confirm processor</button>}
                  {s.status === "failed" && <button className="btn xs" disabled={pending} onClick={() => setInvestigate(s)}><ArrowUpRight size={12} /> Investigate</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SCREEN 7 — Completion evidence + notification (hard gate). */}
      {v.executed && (
        <div className="card"><div className="card-head"><FileCheck2 size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />Completion evidence</div><div className="card-body">
          {v.completedAt ? (
            <Notice tone="ok" title="Finalized — completion record written, notifications sent">
              An immutable completion entry was written to the shared audit log and the Grievance Officer and DPO were notified on {v.completedAt}. The statutory deadline for this request is closed.
            </Notice>
          ) : allConfirmed ? (
            <>
              <p className="cell-sub" style={{ margin: "0 0 4px" }}>Every system has confirmed. Review the assembled record, then finalize — this writes the immutable completion entry and notifies the Grievance Officer and DPO in one action.</p>
              <p className="cell-sub" style={{ margin: "0 0 10px" }}>This closes the statutory deadline for this deletion request.</p>
              <div className="table-wrap" style={{ marginBottom: 12 }}>
                <table className="dtable"><thead><tr><th>System</th><th>Type</th><th>Confirmation</th></tr></thead>
                  <tbody>{v.systems.map((s) => <tr key={s.id}><td>{s.name}</td><td className="cell-sub">{KIND_LABEL[s.kind] ?? s.kind}</td><td className="mono cell-sub">{s.confirmationRef ?? "—"}{s.manualNote ? ` · “${s.manualNote}”` : ""}</td></tr>)}</tbody>
                </table>
              </div>
              <button className="btn primary" disabled={pending} onClick={() => run(() => compileCompletionAction(v.id))}>Mark complete &amp; notify</button>
            </>
          ) : (
            <Notice tone="warn" title={`Locked — ${openCount} system(s) not yet confirmed`}>
              Completion evidence can&apos;t be compiled until every system is confirmed or manually verified. Resolve the pending and failed rows in the checklist above.
            </Notice>
          )}
        </div></div>
      )}

      {/* Manual verification form — never a bare checkbox. */}
      {manualFor && (
        <Modal title={`Verify deletion on ${manualFor.name}`} subtitle="Manual verification is explicit and requires a note — never inferred." onClose={() => setManualFor(null)}
          footer={<><button className="btn" onClick={() => setManualFor(null)}>Cancel</button><button className="btn primary" disabled={pending || !manualNote.trim()} onClick={() => run(() => verifyManualSystemAction(manualFor.id, manualNote, v.id), () => setManualFor(null))}>Confirm verified</button></>}>
          <label className="fld"><span>How was this verified? (required)</span><textarea className="input" rows={3} value={manualNote} onChange={(e) => setManualNote(e.target.value)} placeholder="e.g. Confirmed with the vendor's data team via ticket #4821; deletion evidence attached." /></label>
        </Modal>
      )}

      {/* SCREEN 6 — Failed-deletion investigation drawer. */}
      {investigate && (
        <Modal title={`Investigate — ${investigate.name}`} subtitle="The actual system-reported error, now visible to Admin." onClose={() => setInvestigate(null)}
          footer={<>
            <button className="btn" disabled={pending} onClick={() => run(() => escalateSystemAction(investigate.id, v.id), () => setInvestigate(null))}><ArrowUpRight size={13} /> Escalate to investigation</button>
            <button className="btn primary" disabled={pending} onClick={() => run(() => retrySystemAction(investigate.id, v.id), () => setInvestigate(null))}><RotateCw size={13} /> Retry deletion</button>
          </>}>
          <div className="err-panel">{investigate.errorDetail ?? "The system reported a failure."}</div>
          <p className="cell-sub" style={{ marginTop: 10 }}>Attempts so far: {investigate.attemptCount}. {investigate.attemptCount >= 1 ? "This has already failed once — escalation may be the better path than another retry." : "Retry re-triggers deletion on this one system; escalate routes it to IT/vendor investigation."}</p>
        </Modal>
      )}
    </div>
  );
}
