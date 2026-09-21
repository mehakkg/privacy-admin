"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, ExternalLink, CheckCircle2, Clock, ShieldAlert, Lock } from "lucide-react";
import { Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import {
  triageIncidentAction, addImpactAction, removeImpactAction, identifyCohortAction,
  sendProcessorOutreachAction, recordProcessorResponseAction, confirmFiduciaryAction,
  sendImmediateDescriptionAction, saveBoardPackageAction, submitBoardPackageAction,
  addRemediationTaskAction, setTaskStatusAction, closeIncidentAction,
} from "@/app/actions/breach";
import { SEVERITY_TONE, BREACH_STATUS_LABEL, clock, RULE_8_6_FIELDS } from "@/lib/breach";
import type { ActionResult } from "@/app/actions/requests";

export interface IncidentDetail {
  id: string; reference: string; category: string | null; severity: string; status: string;
  reportedVia: string; detectedAt: string; entityId: string | null; entityName: string | null;
  owner: string | null; reporterNote: string; isProcessorCaused: boolean;
  impacts: { id: string; elementName: string; purposeId: string | null; processorId: string | null }[];
  cohort: { count: number; takenAt: string } | null;
  threads: { id: string; processorId: string; processorName: string; outreachSentAt: string | null; response: string | null; responseAt: string | null; confirmed: boolean; confirmedBy: string | null }[];
  pkg: Record<string, string | boolean | null> | null;
  tasks: { id: string; title: string; team: string; assignedTo: string | null; status: string; dueDate: string | null }[];
}
type Opt = { id: string; name: string; jurisdiction?: string | null };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });
  return { pending, result, run };
}

export function BreachWorkspace({ incident: inc, purposes, processors, role, combined }: { incident: IncidentDetail; purposes: Opt[]; processors: Opt[]; role: string; combined: boolean }) {
  const { pending, result, run } = useRun();
  const tabs = ["triage", "impact", ...(inc.isProcessorCaused ? ["processor"] : []), "board", "remediation"] as const;
  const [tab, setTab] = useState<string>("triage");
  const c = clock(inc.detectedAt);
  const notified = ["board_notified", "remediation", "closed"].includes(inc.status);

  return (
    <div>
      <div className="breach-header">
        <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Pill tone={SEVERITY_TONE[inc.severity]}>{inc.severity}</Pill>
          <Pill tone={inc.status === "closed" ? "gray" : "blue"} dot={false}>{BREACH_STATUS_LABEL[inc.status]}</Pill>
          <span className="cell-sub">{inc.entityName ?? "Entity not set"} · {inc.reportedVia === "public_self_service" ? "Public report" : "Internal"} · owner {inc.owner ?? "unassigned"}</span>
        </div>
        {!notified && <div className={`breach-clock ${c.band}`}><Clock size={15} /> {c.hoursRemaining <= 0 ? `${-c.hoursRemaining}h OVERDUE` : `${c.hoursRemaining}h left`} <span className="breach-clock-sub">of the 72-hour Board-notification window</span></div>}
        {notified && <div className="breach-clock ok"><CheckCircle2 size={15} /> Board notified</div>}
      </div>

      <nav className="stepper" style={{ margin: "14px 0" }}>
        {tabs.map((t) => <button key={t} className={`step${tab === t ? " active" : ""}`} onClick={() => setTab(t)} style={{ background: "none", border: 0, cursor: "pointer", font: "inherit" }}><span className="step-label">{t === "board" ? "Board notification" : t[0].toUpperCase() + t.slice(1)}</span></button>)}
      </nav>

      {tab === "triage" && <Triage inc={inc} pending={pending} run={run} />}
      {tab === "impact" && <Impact inc={inc} purposes={purposes} processors={processors} pending={pending} run={run} />}
      {tab === "processor" && <ProcessorThreads inc={inc} processors={processors} pending={pending} run={run} />}
      {tab === "board" && <BoardPackage inc={inc} role={role} combined={combined} pending={pending} run={run} />}
      {tab === "remediation" && <Remediation inc={inc} pending={pending} run={run} />}
      <ActionError result={result} />
    </div>
  );
}

type Run = (op: () => Promise<ActionResult>, after?: () => void) => void;

function Triage({ inc, pending, run }: { inc: IncidentDetail; pending: boolean; run: Run }) {
  const [category, setCategory] = useState(inc.category ?? "");
  const [owner, setOwner] = useState(inc.owner ?? "");
  return (
    <div className="stack" style={{ gap: 12, maxWidth: 620 }}>
      <div className="notice info"><div className="notice-title">Reporter&rsquo;s account</div><div>{inc.reporterNote}</div></div>
      <div><div className="section-label">Incident category</div><input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Unauthorized access" /></div>
      <div><div className="section-label">Owner (CISO) <span className="cell-sub">— defaults to you, reassignable</span></div><input className="input" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Owner name" /></div>
      <div><button className="btn primary" disabled={pending} onClick={() => run(() => triageIncidentAction(inc.id, category, owner))}>Save triage</button></div>
    </div>
  );
}

function Impact({ inc, purposes, processors, pending, run }: { inc: IncidentDetail; purposes: Opt[]; processors: Opt[]; pending: boolean; run: Run }) {
  const [el, setEl] = useState("");
  const [purposeId, setPurposeId] = useState("");
  const [processorId, setProcessorId] = useState("");
  const pName = (id: string | null) => processors.find((p) => p.id === id)?.name;
  const purName = (id: string | null) => purposes.find((p) => p.id === id)?.name;
  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="cell-sub" style={{ margin: 0 }}>Link the affected data into existing Processing Activities records — element, purpose, processor. A linked external processor flags the incident processor-caused and unlocks the Processor tab.</p>
      <div className="table-wrap">
        <table className="dtable"><thead><tr><th>Element</th><th>Purpose</th><th>Processor</th><th /></tr></thead>
          <tbody>
            {inc.impacts.map((m) => (
              <tr key={m.id}><td className="cell-primary">{m.elementName}</td><td className="cell-sub">{purName(m.purposeId) ?? "—"}</td><td className="cell-sub">{pName(m.processorId) ?? "Internal"}</td>
                <td><button className="icon-btn xs" disabled={pending} onClick={() => run(() => removeImpactAction(m.id, inc.id))} aria-label="Remove"><Trash2 size={13} /></button></td></tr>
            ))}
            {inc.impacts.length === 0 && <tr><td colSpan={4}><div className="empty" style={{ padding: 12 }}>No impact mapped yet.</div></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="add-element-form">
        <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div><div className="section-label">Element</div><input className="input sm" placeholder="e.g. PAN Number" value={el} onChange={(e) => setEl(e.target.value)} /></div>
          <div><div className="section-label">Purpose</div><select className="input sm" value={purposeId} onChange={(e) => setPurposeId(e.target.value)}><option value="">—</option>{purposes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><div className="section-label">Processor</div><select className="input sm" value={processorId} onChange={(e) => setProcessorId(e.target.value)}><option value="">Internal</option>{processors.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <button className="btn sm" disabled={pending || !el.trim()} onClick={() => run(() => addImpactAction(inc.id, el, purposeId || null, processorId || null), () => { setEl(""); setPurposeId(""); setProcessorId(""); })}><Plus size={13} /> Link</button>
        </div>
      </div>
      <div className="cohort-box">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div className="section-label">Affected principal cohort</div>
            {inc.cohort ? <span className="cell-primary">{inc.cohort.count} principals · snapshot taken {inc.cohort.takenAt} <Pill tone="gray" dot={false}><Lock size={10} /> immutable</Pill></span> : <span className="cell-sub">Not yet identified.</span>}
          </div>
          <button className="btn sm" disabled={pending} onClick={() => run(() => identifyCohortAction(inc.id))}>{inc.cohort ? "Re-snapshot" : "Identify affected cohort"}</button>
        </div>
        {inc.cohort && <p className="cell-sub" style={{ margin: "6px 0 0" }}>This snapshot is frozen at the moment it was taken — it never updates even if the underlying principal records change, for evidentiary integrity.</p>}
      </div>
    </div>
  );
}

function ProcessorThreads({ inc, processors, pending, run }: { inc: IncidentDetail; processors: Opt[]; pending: boolean; run: Run }) {
  const [processorId, setProcessorId] = useState("");
  const [resp, setResp] = useState<Record<string, string>>({});
  const linked = [...new Set(inc.impacts.map((m) => m.processorId).filter(Boolean) as string[])];
  const options = processors.filter((p) => linked.includes(p.id));
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div><div className="section-label">Implicated processor</div><select className="input sm" value={processorId} onChange={(e) => setProcessorId(e.target.value)}><option value="">—</option>{options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <button className="btn sm" disabled={pending || !processorId} onClick={() => { const p = options.find((x) => x.id === processorId); if (p) run(() => sendProcessorOutreachAction(inc.id, p.id, p.name), () => setProcessorId("")); }}>Send outreach</button>
      </div>
      {inc.threads.map((t) => (
        <div key={t.id} className="pp-card">
          <div className="pp-head"><span className="row" style={{ gap: 8 }}><strong>{t.processorName}</strong><Link href="/vendor-risk/register" className="row-link">TPRM record <ExternalLink size={11} /></Link></span>
            {t.confirmed ? <Pill tone="green" dot={false}><CheckCircle2 size={11} /> Fiduciary-confirmed</Pill> : t.response ? <Pill tone="yellow">Response received — not yet confirmed</Pill> : <Pill tone="blue">Awaiting response</Pill>}</div>
          <p className="cell-sub" style={{ margin: "6px 0" }}>Outreach sent {t.outreachSentAt ?? "—"}{t.responseAt && ` · responded ${t.responseAt}`}</p>
          {t.response ? <p style={{ margin: "0 0 8px" }}>“{t.response}”</p> : (
            <div className="row" style={{ gap: 6 }}><input className="input sm" placeholder="Record processor's remediation response" value={resp[t.id] ?? ""} onChange={(e) => setResp({ ...resp, [t.id]: e.target.value })} style={{ flex: 1 }} /><button className="btn sm" disabled={pending || !(resp[t.id] ?? "").trim()} onClick={() => run(() => recordProcessorResponseAction(t.id, resp[t.id], inc.id))}>Record response</button></div>
          )}
          {t.response && !t.confirmed && (
            <div className="notice warn" style={{ marginTop: 6 }}>
              <div className="notice-title">Confirmation required</div>
              <div>Receiving a response is not the same as confirming remediation. Confirm explicitly once the fiduciary has verified the processor actually remediated.</div>
              <button className="btn primary sm" style={{ marginTop: 8 }} disabled={pending} onClick={() => run(() => confirmFiduciaryAction(t.id, inc.id))}>Confirm remediation as fiduciary</button>
            </div>
          )}
          {t.confirmed && <p className="cell-sub" style={{ margin: 0 }}>Confirmed by {t.confirmedBy}.</p>}
        </div>
      ))}
      {inc.threads.length === 0 && <div className="empty" style={{ padding: 16 }}>No processor threads yet. Send outreach to an implicated processor above.</div>}
    </div>
  );
}

function BoardPackage({ inc, role, combined, pending, run }: { inc: IncidentDetail; role: string; combined: boolean; pending: boolean; run: Run }) {
  const p = inc.pkg ?? {};
  const submitted = Boolean(p.submittedAt);
  const [immediate, setImmediate] = useState((p.immediateDescription as string) ?? "");
  const [fields, setFields] = useState<Record<string, string>>(() => Object.fromEntries(RULE_8_6_FIELDS.map((f) => [f.key, (p[f.key] as string) ?? ""])));
  const [viewed, setViewed] = useState<Set<string>>(new Set());
  const c = clock(inc.detectedAt);

  const canApprove = role === "dpo" || role === "ciso" || (combined && role === "admin");
  const allFilled = RULE_8_6_FIELDS.every((f) => fields[f.key]?.trim());
  const allViewed = RULE_8_6_FIELDS.every((f) => viewed.has(f.key));
  const canSubmit = canApprove && allFilled && allViewed && !submitted;

  return (
    <div className="stack" style={{ gap: 14 }}>
      {!submitted && <div className={`breach-clock big ${c.band}`}><Clock size={18} /> {c.hoursRemaining <= 0 ? `${-c.hoursRemaining}h OVERDUE` : `${c.hoursRemaining}h remaining`} <span className="breach-clock-sub">72-hour Board-notification window (from detection)</span></div>}
      {submitted && <div className="notice ok"><div className="notice-title"><CheckCircle2 size={13} /> Submitted — immutable</div><div>Approved by {String(p.approvedBy)} on {String(p.submittedAt)}. {p.selfApproved ? "Recorded as self-approved (combined Admin+DPO governance)." : ""}</div></div>}

      <div className="pp-card">
        <div className="pp-head"><strong>Stage 1 — Immediate description</strong>{p.immediateSentAt ? <Pill tone="green" dot={false}>Sent {String(p.immediateSentAt)}</Pill> : <Pill tone="yellow">Not sent</Pill>}</div>
        <p className="cell-sub" style={{ margin: "4px 0 8px" }}>Nature, extent, timing, location and likely impact — sent to the Board without delay, as soon as available. Separate from the 72-hour package.</p>
        <textarea className="input" rows={2} value={immediate} disabled={submitted} onChange={(e) => setImmediate(e.target.value)} />
        {!submitted && <button className="btn sm" style={{ marginTop: 8 }} disabled={pending || !immediate.trim()} onClick={() => run(() => sendImmediateDescriptionAction(inc.id, immediate))}>Send immediate description</button>}
      </div>

      <div className="pp-card">
        <div className="pp-head"><strong>Stage 2 — Detailed 72-hour report</strong><span className="cell-sub">Six fields, one per Rule 8(6)(b) sub-clause</span></div>
        <div className="stack" style={{ gap: 10, marginTop: 8 }}>
          {RULE_8_6_FIELDS.map((f) => (
            <div key={f.key} onFocus={() => setViewed((s) => new Set(s).add(f.key))}>
              <div className="section-label">{f.label} <span className="cell-sub">· {f.clause}</span> {viewed.has(f.key) && <CheckCircle2 size={11} color="var(--green)" style={{ verticalAlign: "-1px" }} />}</div>
              <textarea className="input" rows={2} value={fields[f.key]} disabled={submitted} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />
            </div>
          ))}
        </div>
        {!submitted && (
          <div className="stack" style={{ gap: 8, marginTop: 12 }}>
            <button className="btn" disabled={pending} onClick={() => run(() => saveBoardPackageAction(inc.id, fields))}>Save draft (CISO)</button>
            {combined && canApprove && <div className="review-as-dpo"><ShieldAlert size={14} /> Reviewing as DPO — submission will be recorded as self-approved.</div>}
            <div className={`review-gate${allViewed ? " done" : ""}`}>{allViewed ? <><CheckCircle2 size={14} /> All six fields reviewed</> : `Open each field to review it (${viewed.size}/6) before you can submit`}</div>
            <button className="btn primary" disabled={pending || !canSubmit} title={!canApprove ? "Only the DPO/CISO can submit" : !allFilled ? "All six fields are required" : !allViewed ? "Review all six fields first" : undefined} onClick={() => run(() => submitBoardPackageAction(inc.id))}>{pending ? "Submitting…" : "Submit to Board (DPO)"}</button>
            {!canApprove && <p className="cell-sub">You&rsquo;re acting as {role.toUpperCase()}. The DPO submits — switch role to submit.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function Remediation({ inc, pending, run }: { inc: IncidentDetail; pending: boolean; run: Run }) {
  const [title, setTitle] = useState("");
  const [team, setTeam] = useState("compliance");
  const [assignedTo, setAssignedTo] = useState("");
  const [due, setDue] = useState("");
  const openCount = inc.tasks.filter((t) => t.status !== "done").length;
  const cols = ["open", "in_progress", "done"] as const;
  const COL_LABEL: Record<string, string> = { open: "Open", in_progress: "In progress", done: "Done" };
  const next: Record<string, string> = { open: "in_progress", in_progress: "done", done: "open" };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="add-element-form">
        <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "2 1 200px" }}><div className="section-label">Task</div><input className="input sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Rotate exposed API keys" /></div>
          <div><div className="section-label">Team</div><select className="input sm" value={team} onChange={(e) => setTeam(e.target.value)}><option value="compliance">Compliance</option><option value="legal">Legal</option><option value="it">IT</option></select></div>
          <div><div className="section-label">Assignee</div><input className="input sm" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="Name" /></div>
          <div><div className="section-label">Due</div><input className="input sm" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          <button className="btn sm" disabled={pending || !title.trim()} onClick={() => run(() => addRemediationTaskAction(inc.id, title, team, assignedTo, due), () => { setTitle(""); setAssignedTo(""); setDue(""); })}><Plus size={13} /> Add task</button>
        </div>
      </div>
      <div className="kanban">
        {cols.map((col) => (
          <div key={col} className="kanban-col">
            <div className="kanban-col-head">{COL_LABEL[col]} <span className="cell-sub">{inc.tasks.filter((t) => t.status === col).length}</span></div>
            {inc.tasks.filter((t) => t.status === col).map((t) => (
              <div key={t.id} className="kanban-card">
                <span className="cell-primary">{t.title}</span>
                <span className="row" style={{ gap: 6, flexWrap: "wrap" }}><Pill tone="gray" dot={false}>{t.team}</Pill>{t.assignedTo && <span className="cell-sub">{t.assignedTo}</span>}{t.dueDate && <span className="cell-sub">· due {t.dueDate}</span>}</span>
                <button className="btn ghost xs" disabled={pending} onClick={() => run(() => setTaskStatusAction(t.id, next[col], inc.id))}>Move to {COL_LABEL[next[col]]}</button>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="row" style={{ gap: 10, alignItems: "center" }}>
        <span title={openCount ? "Close is blocked while tasks are open" : undefined}>
          <button className="btn primary" disabled={pending || openCount > 0 || inc.status === "closed"} onClick={() => run(() => closeIncidentAction(inc.id))}>{inc.status === "closed" ? "Incident closed" : "Close incident"}</button>
        </span>
        {openCount > 0 && <span className="cell-sub" style={{ color: "var(--yellow)" }}>{openCount} task{openCount === 1 ? "" : "s"} still open — incident can&rsquo;t close.</span>}
      </div>
    </div>
  );
}
