"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Clock, ChevronRight, ChevronDown, GitCompareArrows, Moon, ClipboardCheck, CheckCircle2, Download } from "lucide-react";
import { Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { setDormancyThresholdAction, bulkInvestigateAction, decideInvestigationAction } from "@/app/actions/insights";
import type { ActionResult } from "@/app/actions/requests";

export interface DormantRow {
  accountId: string; name: string; system: string; username: string; accountType: string;
  lastActive: string | null; daysDormant: number | null; classification: string;
  decided: string | null; timeline: { system: string; label: string; at: string }[];
}
export interface MatrixRole {
  roleName: string; roleType: string;
  assignees: { name: string; status: "normal" | "drifted" | "dormant" | "pending" }[];
}

const CLASS_LABEL: Record<string, string> = { likely_service: "Likely a service account", likely_abandoned: "Likely abandoned", unclear: "Unclear" };
const STATUS_META: Record<string, { label: string; tone: "gray" | "red" | "yellow" | "blue"; Icon: React.ComponentType<{ size?: number }> }> = {
  normal: { label: "Normal", tone: "gray", Icon: CheckCircle2 },
  drifted: { label: "Drifted", tone: "red", Icon: GitCompareArrows },
  dormant: { label: "Dormant", tone: "yellow", Icon: Moon },
  pending: { label: "Pending certification", tone: "blue", Icon: ClipboardCheck },
};

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });
  return { pending, result, run };
}

export function InsightsClient({ thresholds, dormant, matrix, lastScan }: { thresholds: { human: number; service: number }; dormant: DormantRow[]; matrix: MatrixRole[]; lastScan: string }) {
  const [view, setView] = useState<"report" | "matrix">("report");
  return (
    <div>
      <div className="seg-toggle" role="tablist" aria-label="Insights view" style={{ marginBottom: 14 }}>
        <button className={`seg-btn${view === "report" ? " active" : ""}`} onClick={() => setView("report")}>Dormant / orphaned</button>
        <button className={`seg-btn${view === "matrix" ? " active" : ""}`} onClick={() => setView("matrix")}>Permission matrix</button>
      </div>
      {view === "report" ? <DormantReport thresholds={thresholds} dormant={dormant} lastScan={lastScan} /> : <PermissionMatrix matrix={matrix} />}
    </div>
  );
}

function DormantReport({ thresholds, dormant, lastScan }: { thresholds: { human: number; service: number }; dormant: DormantRow[]; lastScan: string }) {
  const { pending, result, run } = useRun();
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [open, setOpen] = useState<DormantRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const undecided = dormant.filter((d) => !d.decided);
  const rows = undecided.filter((d) => !typeFilter || d.accountType === typeFilter);
  const toggle = (id: string) => setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (undecided.length === 0) {
    return (
      <div className="drift-clear">
        <CheckCircle2 size={28} color="var(--green)" />
        <p style={{ margin: "10px 0 2px", fontWeight: 600 }}>No dormant accounts</p>
        <p className="cell-sub" style={{ margin: 0 }}>Every account has been active within its threshold, or already investigated. Last scan {lastScan}.</p>
        <ThresholdBar thresholds={thresholds} pending={pending} onSave={(t, d) => run(() => setDormancyThresholdAction(t, d))} />
      </div>
    );
  }

  return (
    <div>
      <div className="row" style={{ gap: 12, justifyContent: "space-between", flexWrap: "wrap", marginBottom: 10 }}>
        <span className="cell-sub">Showing accounts past their type&rsquo;s dormancy threshold. Last scan {lastScan}.</span>
        <div className="row" style={{ gap: 8 }}>
          <select className="input sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All account types</option>
            <option value="human">Human</option>
            <option value="service">Service</option>
          </select>
          {selected.size > 0 && <button className="btn primary sm" onClick={() => setBulkOpen(true)}>Investigate {selected.size} selected</button>}
        </div>
      </div>
      <ThresholdBar thresholds={thresholds} pending={pending} onSave={(t, d) => run(() => setDormancyThresholdAction(t, d))} />

      <div className="table-wrap" style={{ marginTop: 10 }}>
        <table className="dtable">
          <thead><tr><th style={{ width: 32 }} /><th>Account</th><th>System</th><th>Type</th><th>Last active</th><th>Dormant</th><th>System suggestion</th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.accountId} className="clickable" onClick={() => setOpen(d)}>
                <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(d.accountId)} onChange={() => toggle(d.accountId)} /></td>
                <td className="cell-primary">{d.name} <span className="cell-sub mono">· {d.username}</span></td>
                <td className="cell-sub">{d.system}</td>
                <td><Pill tone={d.accountType === "service" ? "purple" : "gray"} dot={false}>{d.accountType}</Pill></td>
                <td className="cell-sub">{d.lastActive ?? "Never"}</td>
                <td className="cell-sub">{d.daysDormant === null ? "—" : `${d.daysDormant}d`}</td>
                <td><span className="advisory-hint">{CLASS_LABEL[d.classification]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ActionError result={result} />

      {open && <InvestigationDrawer row={open} pending={pending} onClose={() => setOpen(null)} onDecide={(decision, justification) => run(() => decideInvestigationAction({ accountId: open.accountId, decision, justification, classification: open.classification }), () => setOpen(null))} />}
      {bulkOpen && <BulkInvestigate rows={rows.filter((r) => selected.has(r.accountId))} pending={pending} onClose={() => setBulkOpen(false)} onSubmit={(items) => run(() => bulkInvestigateAction(items), () => { setBulkOpen(false); setSelected(new Set()); })} />}
    </div>
  );
}

function ThresholdBar({ thresholds, pending, onSave }: { thresholds: { human: number; service: number }; pending: boolean; onSave: (t: string, d: number) => void }) {
  const [edit, setEdit] = useState(false);
  const [h, setH] = useState(String(thresholds.human));
  const [s, setS] = useState(String(thresholds.service));
  if (!edit) return (
    <div className="threshold-bar">
      <span className="cell-sub">Thresholds — Human: <strong>{thresholds.human}d</strong> · Service: <strong>{thresholds.service}d</strong></span>
      <button className="btn ghost xs" onClick={() => setEdit(true)}>Edit thresholds</button>
    </div>
  );
  return (
    <div className="threshold-bar">
      <span className="row" style={{ gap: 6 }}><span className="cell-sub">Human</span><input className="input xs" style={{ width: 64 }} value={h} onChange={(e) => setH(e.target.value)} /><span className="cell-sub">days</span></span>
      <span className="row" style={{ gap: 6 }}><span className="cell-sub">Service</span><input className="input xs" style={{ width: 64 }} value={s} onChange={(e) => setS(e.target.value)} /><span className="cell-sub">days</span></span>
      <button className="btn primary xs" disabled={pending} onClick={() => { onSave("human", Number(h)); onSave("service", Number(s)); setEdit(false); }}>Save</button>
      <button className="btn ghost xs" onClick={() => setEdit(false)}>Cancel</button>
    </div>
  );
}

function InvestigationDrawer({ row, pending, onClose, onDecide }: { row: DormantRow; pending: boolean; onClose: () => void; onDecide: (decision: "retained" | "revoked", justification: string) => void }) {
  const [decision, setDecision] = useState<"retained" | "revoked" | null>(null);
  const [justification, setJustification] = useState("");
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer-panel" style={{ background: "var(--bg)", width: "min(520px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head drawer-sticky"><span className="row" style={{ gap: 8 }}><strong>{row.name}</strong><span className="cell-sub mono">{row.username}</span></span><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <div className="drawer-body">
          <dl className="kv">
            <div style={{ display: "contents" }}><dt>System</dt><dd>{row.system}</dd></div>
            <div style={{ display: "contents" }}><dt>Type</dt><dd style={{ textTransform: "capitalize" }}>{row.accountType}</dd></div>
            <div style={{ display: "contents" }}><dt>Last active</dt><dd>{row.lastActive ?? "Never"}{row.daysDormant !== null && ` · ${row.daysDormant}d dormant`}</dd></div>
          </dl>

          <div className="advisory-box"><strong>System suggestion:</strong> {CLASS_LABEL[row.classification]} <span className="cell-sub">— advisory only. It does not decide for you or pre-select an option.</span></div>

          <h3 className="drawer-section">Usage timeline</h3>
          {row.timeline.length ? (
            <ol className="timeline">
              {row.timeline.map((t, i) => <li key={i} className="timeline-item"><span className="timeline-dot" style={{ background: "var(--text-3)" }} /><div className="stack" style={{ gap: 1 }}><span className="cell-primary">{t.label}</span><span className="cell-sub"><Clock size={11} style={{ verticalAlign: "-1px" }} /> {t.at} · {t.system}</span></div></li>)}
            </ol>
          ) : <p className="cell-sub">No usage events on record — a sparse timeline still requires a justified decision.</p>}

          <h3 className="drawer-section">Decision</h3>
          <div className="drift-actions">
            <button className={`btn drift-choice${decision === "retained" ? " chosen" : ""}`} onClick={() => setDecision("retained")}>Retain</button>
            <button className={`btn drift-choice${decision === "revoked" ? " chosen" : ""}`} onClick={() => setDecision("revoked")}>Revoke</button>
          </div>
          <p className="cell-sub" style={{ marginTop: 6 }}>Both outcomes require a justification. A Revoke routes through the standard cross-system revocation checklist.</p>
          <textarea className="input" rows={2} style={{ marginTop: 8 }} placeholder="Justification (required for either decision)" value={justification} onChange={(e) => setJustification(e.target.value)} />
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn primary" disabled={pending || !decision || !justification.trim()} onClick={() => decision && onDecide(decision, justification)}>{pending ? "Recording…" : "Record decision"}</button>
            <button className="btn ghost" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function BulkInvestigate({ rows, pending, onClose, onSubmit }: { rows: DormantRow[]; pending: boolean; onClose: () => void; onSubmit: (items: { accountId: string; decision: "retained" | "revoked"; justification: string; classification: string }[]) => void }) {
  const [decision, setDecision] = useState<"retained" | "revoked">("retained");
  const [justification, setJustification] = useState("");
  const [overrides, setOverrides] = useState<Record<string, "retained" | "revoked">>({});
  const items = rows.map((r) => ({ accountId: r.accountId, decision: overrides[r.accountId] ?? decision, justification, classification: r.classification }));
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <h3 style={{ marginTop: 0 }}>Investigate {rows.length} accounts</h3>
        <p className="cell-sub" style={{ marginTop: 0 }}>Apply one decision and justification to the batch. You can override any individual row before confirming.</p>
        <div className="row" style={{ gap: 6, marginBottom: 8 }}>
          <button className={`btn sm${decision === "retained" ? " primary" : " ghost"}`} onClick={() => setDecision("retained")}>Retain all</button>
          <button className={`btn sm${decision === "revoked" ? " primary" : " ghost"}`} onClick={() => setDecision("revoked")}>Revoke all</button>
        </div>
        <div className="stack" style={{ gap: 4, maxHeight: 220, overflowY: "auto" }}>
          {rows.map((r) => { const eff = overrides[r.accountId] ?? decision; return (
            <div key={r.accountId} className="draft-row">
              <span className="cell-primary">{r.name}</span><span className="cell-sub mono">{r.username}</span>
              <span className="row" style={{ gap: 4, marginLeft: "auto" }}>
                <button className={`btn xs${eff === "retained" ? " primary" : " ghost"}`} onClick={() => setOverrides({ ...overrides, [r.accountId]: "retained" })}>Retain</button>
                <button className={`btn xs${eff === "revoked" ? " primary" : " ghost"}`} onClick={() => setOverrides({ ...overrides, [r.accountId]: "revoked" })}>Revoke</button>
              </span>
            </div>
          ); })}
        </div>
        <textarea className="input" rows={2} style={{ marginTop: 8 }} placeholder="Justification for the batch (required)" value={justification} onChange={(e) => setJustification(e.target.value)} />
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <button className="btn primary" disabled={pending || !justification.trim()} onClick={() => onSubmit(items)}>{pending ? "Applying…" : "Confirm decisions"}</button>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function PermissionMatrix({ matrix }: { matrix: MatrixRole[] }) {
  const [openRole, setOpenRole] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const rows = matrix.filter((r) => !q || r.roleName.toLowerCase().includes(q.toLowerCase()));

  const exportCsv = () => {
    const lines = ["Role,Assignee,Status"];
    for (const r of matrix) for (const a of r.assignees) lines.push(`"${r.roleName}","${a.name}","${STATUS_META[a.status].label}"`);
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "permission-matrix.csv"; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
        <input className="input sm" placeholder="Filter roles…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
        <button className="btn sm" onClick={exportCsv}><Download size={13} /> Export (audit evidence)</button>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        {rows.map((r) => {
          const isOpen = openRole.has(r.roleName);
          const counts = r.assignees.reduce((m, a) => { m[a.status] = (m[a.status] ?? 0) + 1; return m; }, {} as Record<string, number>);
          return (
            <div key={r.roleName} className="matrix-role">
              <button className="matrix-role-head" onClick={() => setOpenRole((p) => { const n = new Set(p); if (n.has(r.roleName)) n.delete(r.roleName); else n.add(r.roleName); return n; })}>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="cell-primary">{r.roleName}</span>
                <span className="cell-sub">{r.assignees.length} assignee{r.assignees.length === 1 ? "" : "s"}</span>
                <span className="row" style={{ gap: 4, marginLeft: "auto" }}>
                  {(["drifted", "dormant", "pending"] as const).filter((s) => counts[s]).map((s) => <Pill key={s} tone={STATUS_META[s].tone}>{counts[s]} {STATUS_META[s].label.toLowerCase()}</Pill>)}
                </span>
              </button>
              {isOpen && (
                <div className="matrix-assignees">
                  {r.assignees.map((a, i) => { const m = STATUS_META[a.status]; const Icon = m.Icon; return (
                    <div key={i} className="matrix-assignee"><Icon size={14} /><span className="cell-primary">{a.name}</span><Pill tone={m.tone} dot={false}>{m.label}</Pill></div>
                  ); })}
                  {r.assignees.length === 0 && <span className="cell-sub" style={{ padding: "4px 8px" }}>No assignees.</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
