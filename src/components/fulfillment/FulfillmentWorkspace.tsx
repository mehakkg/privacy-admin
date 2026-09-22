"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldAlert, ShieldCheck, Plus, Trash2, PlayCircle, FileCheck2 } from "lucide-react";
import { Pill, Notice } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { MultiSystemCompletionChecklist, type ChecklistSystem } from "@/components/shared/MultiSystemCompletionChecklist";
import { confirmScopeAction, executeFulfillmentAction, verifyManualSystemAction, retrySystemAction, escalateSystemAction, compileCompletionAction } from "@/app/actions/fulfillment";
import type { ActionResult } from "@/app/actions/requests";

export interface FulfillmentView {
  requestId: string; customerId: string; customerName: string; scope: string; source: string;
  deadlineLabel: string | null; deadlineBand: string | null; deadlineDays: number | null;
  status: string;
  retention: { conflicted: boolean; cleared: boolean; rulingDecision: string | null; deletionHref: string };
  scopeConfirmed: boolean;
  lookupPreview: { name: string; systemType: string }[];
  systems: ChecklistSystem[];
  executed: boolean;
  completed: boolean;
  completedAt: string | null;
}

const TYPE_LABEL: Record<string, string> = { automated: "Automated", manual: "Manual", processor: "Processor" };

export function FulfillmentWorkspace({ v }: { v: FulfillmentView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [adds, setAdds] = useState<{ name: string; note: string }[]>([]);
  const [addName, setAddName] = useState(""); const [addNote, setAddNote] = useState("");
  const run = (op: () => Promise<ActionResult>, after?: () => void) => start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });

  const allConfirmed = v.systems.length > 0 && v.systems.every((s) => s.status === "confirmed");
  const canExecute = v.scopeConfirmed && v.retention.cleared && !v.executed && v.systems.length > 0;
  const stage = v.completed ? "done" : v.executed ? "completion" : v.scopeConfirmed ? "execute" : "scope";
  const Step = ({ id, label, done }: { id: string; label: string; done: boolean }) => (
    <span className={`step${stage === id ? " active" : ""}${done ? " done" : ""}`}><span className="step-label">{label}</span></span>
  );

  const evidencePreview = (
    <div style={{ marginBottom: 12 }}>
      <p className="cell-sub" style={{ margin: "0 0 4px" }}>Every system has confirmed. Review the assembled record, then finalize — this writes the immutable completion entry to the shared audit log and notifies the Grievance Officer and DPO in one action.</p>
      {v.deadlineDays != null && <p className="cell-sub" style={{ margin: "0 0 10px" }}>This closes the {v.deadlineDays}-day statutory deadline for this request.</p>}
      <div className="table-wrap" style={{ marginBottom: 4 }}>
        <table className="dtable"><thead><tr><th>System</th><th>Type</th><th>Confirmation</th></tr></thead>
          <tbody>{v.systems.map((s) => <tr key={s.id}><td>{s.name}</td><td className="cell-sub">{TYPE_LABEL[s.systemType] ?? s.systemType}</td><td className="mono cell-sub">{s.confirmationReference ?? "—"}{s.verificationNote ? ` · “${s.verificationNote}”` : ""}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
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
        <Step id="evidence" label="Evidence & notify" done={v.completed} />
      </nav>

      <ActionError result={result} />

      {v.retention.conflicted && !v.retention.cleared && (
        <div className="notice danger" style={{ marginBottom: 16 }}>
          <div className="notice-title"><ShieldAlert size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />Retention check not cleared</div>
          <div>This deletion hit a retention conflict. It must pass the retention gate — a DPO ruling — before execution. It has entered Scenario 3&apos;s escalation path unchanged. <Link href={v.retention.deletionHref}>Open the retention conflict block →</Link></div>
        </div>
      )}
      {v.retention.cleared && (
        <p className="cell-sub" style={{ margin: "0 0 14px" }}><ShieldCheck size={13} style={{ verticalAlign: "-2px", color: "var(--green)" }} /> Retention check cleared{v.retention.rulingDecision ? ` — DPO ruling: ${v.retention.rulingDecision}` : " — no conflict"}.</p>
      )}

      {/* SCREEN 2 — Scope confirmation. */}
      {!v.scopeConfirmed && (
        <div className="card"><div className="card-head">Confirm scope</div><div className="card-body">
          <p className="cell-sub" style={{ margin: "0 0 8px" }}>The data-location lookup found {v.lookupPreview.length} system{v.lookupPreview.length === 1 ? "" : "s"}/processor{v.lookupPreview.length === 1 ? "" : "s"} holding this customer&apos;s data. Add any the lookup missed (with a reason), then confirm.</p>
          <ul className="ext-list" style={{ marginBottom: 10 }}>
            {v.lookupPreview.map((p, n) => <li key={n} className="row" style={{ justifyContent: "space-between" }}><span>{p.name}</span><Pill tone="gray" dot={false}>{TYPE_LABEL[p.systemType] ?? p.systemType}</Pill></li>)}
            {adds.map((a, n) => <li key={`a${n}`} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}><span>{a.name} <span className="cell-sub">— {a.note}</span></span><button className="btn ghost xs" onClick={() => setAdds(adds.filter((_, i) => i !== n))}><Trash2 size={12} /></button></li>)}
            {v.lookupPreview.length === 0 && adds.length === 0 && <li className="cell-sub">Lookup returned no systems — add manually if you know of any.</li>}
          </ul>
          <div className="add-element-form" style={{ flexWrap: "wrap" }}>
            <input className="input" placeholder="System the lookup missed" value={addName} onChange={(e) => setAddName(e.target.value)} />
            <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder="Why it was missed (required)" value={addNote} onChange={(e) => setAddNote(e.target.value)} />
            <button className="btn sm" disabled={!addName.trim() || !addNote.trim()} onClick={() => { setAdds([...adds, { name: addName.trim(), note: addNote.trim() }]); setAddName(""); setAddNote(""); }}><Plus size={13} /> Add</button>
          </div>
          <button className="btn primary" style={{ marginTop: 12 }} disabled={pending} onClick={() => run(() => confirmScopeAction(v.requestId, adds), () => setAdds([]))}>Confirm scope &amp; proceed</button>
        </div></div>
      )}

      {/* SCREEN 4 — Execution trigger. */}
      {v.scopeConfirmed && !v.executed && (
        <div className="card"><div className="card-head">Execute deletion</div><div className="card-body">
          <p className="cell-sub" style={{ margin: "0 0 10px" }}>One action fires the deletion across all {v.systems.length} confirmed systems and processors simultaneously.</p>
          {!canExecute && <Notice tone="warn" title="Not ready">{!v.retention.cleared ? "The retention check must clear first." : "Confirm the scope first."}</Notice>}
          <button className="btn primary" style={{ marginTop: 10 }} disabled={pending || !canExecute} onClick={() => run(() => executeFulfillmentAction(v.requestId))}><PlayCircle size={15} /> Execute deletion across all systems</button>
        </div></div>
      )}

      {/* SCREENS 5 + 7 — the shared checklist gates the completion evidence. */}
      {v.executed && (
        <MultiSystemCompletionChecklist
          systems={v.systems}
          handlers={{
            onManualVerify: (id, note) => verifyManualSystemAction(id, note, v.requestId),
            onRetry: (id) => retrySystemAction(id, v.requestId),
            onEscalate: (id) => escalateSystemAction(id, v.requestId),
          }}
          parentActionLabel="Mark complete & notify"
          onParentAction={() => compileCompletionAction(v.requestId)}
          gateOpenContent={evidencePreview}
          parentDone={v.completed}
          parentDoneNode={
            <div className="card"><div className="card-head"><FileCheck2 size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />Completion evidence</div><div className="card-body">
              <Notice tone="ok" title="Finalized — completion record written, notifications sent">
                An immutable completion entry was written to the shared audit log (source_module rights_fulfillment) and the Grievance Officer and DPO were notified{v.completedAt ? ` on ${v.completedAt}` : ""}. The statutory deadline for this request is closed.
              </Notice>
            </div></div>
          }
        />
      )}
    </div>
  );
}
