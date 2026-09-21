"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, ShieldAlert, Clock, Download, ArrowRight } from "lucide-react";
import { Pill, Notice } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { reassignAction, addSubtaskAction, setSubtaskStatusAction, requestExtensionAction } from "@/app/actions/dprr";
import { SUBTASK_TEAMS, SUBTASK_STATUS_LABEL } from "@/lib/engines/dprr";
import type { ActionResult } from "@/app/actions/requests";

export interface TicketDetail {
  requestId: string;
  reference: string;
  typeLabel: string;
  principal: string;
  statusLabel: string;
  sourceLabel: string;
  routingState: string;
  assignee: string | null;
  autoAssignedReason: string | null;
  originalDeadline: string;
  currentDeadline: string;
  currentDeadlineIso: string;
  slaLabel: string;
  slaBand: string;
  ceilingAt: string;
  boardEscalated: boolean;
  boardEscalatedAt: string | null;
  escalations: { id: string; reason: string; createdAt: string }[];
  extensions: { id: string; previousDeadline: string; newDeadline: string; justification: string; by: string | null; createdAt: string }[];
  subtasks: { id: string; title: string; team: string; assignedTo: string | null; status: string; dueDate: string | null }[];
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });
  return { pending, result, run };
}

const NEXT: Record<string, string> = { open: "in_progress", in_progress: "done", done: "open" };
const bandColor = (b: string) => (b === "breached" ? "var(--red)" : b === "due_soon" ? "var(--yellow)" : "var(--text-3)");

function exportReport(t: TicketDetail) {
  const w = window.open("", "_blank");
  if (!w) return;
  const rows = t.extensions.map((e) => `<tr><td>${e.previousDeadline}</td><td>${e.newDeadline}</td><td>${e.justification}</td><td>${e.by ?? "—"}</td><td>${e.createdAt}</td></tr>`).join("");
  const subs = t.subtasks.map((s) => `<tr><td>${s.title}</td><td>${s.team}</td><td>${s.assignedTo ?? "—"}</td><td>${SUBTASK_STATUS_LABEL[s.status] ?? s.status}</td></tr>`).join("");
  w.document.write(`<!doctype html><html><head><title>DPRR ticket ${t.reference}</title>
    <style>body{font:13px -apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;margin:32px;max-width:720px}h1{font-size:19px;margin:0 0 4px}h2{font-size:14px;margin:22px 0 6px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #e2e8f0;padding:5px 7px;text-align:left}.k{color:#64748b}.esc{color:#b91c1c;font-weight:600}</style></head><body>
    <h1>DPRR ticket — ${t.reference}</h1>
    <div class="k">${t.typeLabel} · ${t.principal} · ${t.sourceLabel}</div>
    <h2>Routing</h2>
    <div>Owner: <strong>${t.assignee ?? "Unassigned"}</strong> (${t.routingState})</div>
    <div class="k">${t.autoAssignedReason ?? ""}</div>
    <h2>Deadlines</h2>
    <div>Original commitment: <strong>${t.originalDeadline}</strong></div>
    <div>Current deadline: <strong>${t.currentDeadline}</strong> — ${t.slaLabel}</div>
    <div class="k">90-day statutory ceiling: ${t.ceilingAt}</div>
    ${t.boardEscalated ? `<div class="esc">Automatically escalated to the Data Protection Board on ${t.boardEscalatedAt}.</div>` : ""}
    <h2>Extension history (append-only)</h2>
    ${rows ? `<table><thead><tr><th>Previous</th><th>New</th><th>Justification</th><th>By</th><th>When</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="k">No extensions recorded.</div>`}
    <h2>Sub-tasks</h2>
    ${subs ? `<table><thead><tr><th>Task</th><th>Team</th><th>Assignee</th><th>Status</th></tr></thead><tbody>${subs}</tbody></table>` : `<div class="k">No sub-tasks.</div>`}
    <p class="k" style="margin-top:24px">Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · DPDP Privacy Console</p>
    <script>window.print()</script></body></html>`);
  w.document.close();
}

export function DprrWorkspace({ ticket: t, assignableActors }: { ticket: TicketDetail; assignableActors: { id: string; name: string; role: string }[] }) {
  const { pending, result, run } = useRun();
  const [reassignee, setReassignee] = useState("");
  const [ext, setExt] = useState({ newDeadline: "", justification: "" });
  const [sub, setSub] = useState({ title: "", team: "fulfilment", assignedTo: "", dueDate: "" });

  const cols = ["open", "in_progress", "done"] as const;

  return (
    <div>
      {/* Board escalation is permanent — a banner, never a toggle. There is no
          control here (or anywhere) to reverse it. */}
      {t.boardEscalated && (
        <div className="notice danger" style={{ marginBottom: 16 }}>
          <div className="notice-title"><ShieldAlert size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />Escalated to the Data Protection Board</div>
          <div>
            {t.escalations[0]?.reason ?? "This request was automatically escalated to the Board."}
            {t.boardEscalatedAt && <> Recorded <strong>{t.boardEscalatedAt}</strong>.</>}
            {" "}This was set by the system and is permanent — escalation to the Board cannot be cancelled, delayed or reversed.
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
        <Pill tone="gray" dot={false}>{t.statusLabel}</Pill>
        <Pill tone={t.routingState === "reassigned" ? "purple" : t.routingState === "assigned" ? "blue" : "yellow"} dot={false}>
          {t.routingState === "unassigned" ? "Unassigned" : t.routingState === "reassigned" ? "Reassigned" : "Auto-assigned"}
        </Pill>
        {t.boardEscalated && <Pill tone="red">Board-escalated</Pill>}
        <span className="cell-sub" style={{ color: bandColor(t.slaBand) }}><Clock size={13} style={{ verticalAlign: "-2px" }} /> {t.slaLabel}</span>
        <span style={{ marginLeft: "auto" }}>
          <button className="btn sm" onClick={() => exportReport(t)}><Download size={13} /> Export ticket report</button>
        </span>
      </div>

      <ActionError result={result} />

      <div className="dprr-grid">
        {/* Routing */}
        <section className="card">
          <div className="card-head">Routing</div>
          <div className="card-body">
            <div className="kv"><span className="k">Owner</span><span>{t.assignee ?? <em className="cell-sub">Unassigned</em>}</span></div>
            {t.autoAssignedReason && <p className="cell-sub" style={{ margin: "4px 0 10px" }}>{t.autoAssignedReason}</p>}
            <div className="add-element-form" style={{ marginTop: 8 }}>
              <select value={reassignee} onChange={(e) => setReassignee(e.target.value)} className="input">
                <option value="">Reassign to…</option>
                {assignableActors.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
              </select>
              <button className="btn sm" disabled={pending || !reassignee} onClick={() => run(() => reassignAction(t.requestId, reassignee), () => setReassignee(""))}>Reassign</button>
            </div>
          </div>
        </section>

        {/* Deadlines & extensions — append-only */}
        <section className="card">
          <div className="card-head">Deadline &amp; extensions</div>
          <div className="card-body">
            <div className="kv"><span className="k">Original commitment</span><span className="mono">{t.originalDeadline}</span></div>
            <div className="kv"><span className="k">Current deadline</span><span className="mono" style={{ color: bandColor(t.slaBand) }}>{t.currentDeadline}</span></div>
            <div className="kv"><span className="k">90-day ceiling</span><span className="mono cell-sub">{t.ceilingAt}</span></div>
            <p className="cell-sub" style={{ margin: "6px 0 10px" }}>Extensions are append-only and never overwrite the original commitment. Extending past the statutory ceiling escalates to the Board automatically.</p>

            {t.extensions.length > 0 && (
              <ul className="ext-list">
                {t.extensions.map((e) => (
                  <li key={e.id}>
                    <span className="mono">{e.previousDeadline} <ArrowRight size={11} style={{ verticalAlign: "-1px" }} /> {e.newDeadline}</span>
                    <div className="cell-sub">“{e.justification}” — {e.by ?? "unknown"} · {e.createdAt}</div>
                  </li>
                ))}
              </ul>
            )}

            <div className="add-element-form" style={{ flexWrap: "wrap", marginTop: 8 }}>
              <input type="date" className="input" value={ext.newDeadline} min={t.currentDeadlineIso} onChange={(e) => setExt({ ...ext, newDeadline: e.target.value })} />
              <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder="Justification (required)" value={ext.justification} onChange={(e) => setExt({ ...ext, justification: e.target.value })} />
              <button className="btn sm" disabled={pending || !ext.newDeadline || !ext.justification.trim()} onClick={() => run(() => requestExtensionAction(t.requestId, ext), () => setExt({ newDeadline: "", justification: "" }))}>Log extension</button>
            </div>
          </div>
        </section>
      </div>

      {/* Sub-tasks — the Breach remediation board, reused */}
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head">Sub-tasks</div>
        <div className="card-body">
          <div className="add-element-form" style={{ flexWrap: "wrap" }}>
            <input className="input" style={{ flex: 1, minWidth: 160 }} placeholder="Sub-task title" value={sub.title} onChange={(e) => setSub({ ...sub, title: e.target.value })} />
            <select className="input" value={sub.team} onChange={(e) => setSub({ ...sub, team: e.target.value })}>
              {SUBTASK_TEAMS.map((tm) => <option key={tm} value={tm}>{tm}</option>)}
            </select>
            <input className="input" style={{ width: 130 }} placeholder="Assignee" value={sub.assignedTo} onChange={(e) => setSub({ ...sub, assignedTo: e.target.value })} />
            <input type="date" className="input" value={sub.dueDate} onChange={(e) => setSub({ ...sub, dueDate: e.target.value })} />
            <button className="btn sm" disabled={pending || !sub.title.trim()} onClick={() => run(() => addSubtaskAction(t.requestId, sub), () => setSub({ title: "", team: "fulfilment", assignedTo: "", dueDate: "" }))}><Plus size={13} /> Add</button>
          </div>

          <div className="kanban" style={{ marginTop: 12 }}>
            {cols.map((col) => {
              const items = t.subtasks.filter((s) => s.status === col);
              return (
                <div key={col} className="kanban-col">
                  <div className="kanban-col-head">{SUBTASK_STATUS_LABEL[col]} <span className="cell-sub">{items.length}</span></div>
                  {items.map((s) => (
                    <div key={s.id} className="kanban-card">
                      <span className="cell-primary">{s.title}</span>
                      <span className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <Pill tone="gray" dot={false}>{s.team}</Pill>
                        {s.assignedTo && <span className="cell-sub">{s.assignedTo}</span>}
                        {s.dueDate && <span className="cell-sub">due {s.dueDate}</span>}
                      </span>
                      <button className="btn ghost xs" disabled={pending} onClick={() => run(() => setSubtaskStatusAction(s.id, NEXT[col], t.requestId))}>
                        Move to {SUBTASK_STATUS_LABEL[NEXT[col]]}
                      </button>
                    </div>
                  ))}
                  {items.length === 0 && <div className="cell-sub" style={{ padding: "8px 2px" }}>—</div>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {!t.boardEscalated && (
        <Notice tone="info" title="Automatic Board escalation is armed">
          If this request&apos;s deadline reaches the 90-day statutory ceiling ({t.ceilingAt}), the system escalates it to the Data Protection Board on its own — no one has to (or can) trigger it, and once escalated it cannot be reversed.
        </Notice>
      )}
    </div>
  );
}
