"use client";

import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Search, AlertTriangle, ArrowRight } from "lucide-react";
import { Pill, type PillTone } from "@/components/ui";
import type { Plan, PlanWF, PlanStep, Norm } from "@/lib/workflows/derive";

const TONE: Record<Norm, PillTone> = { Built: "green", Partial: "yellow", "Not Built": "red", Unknown: "gray" };
const readinessTone = (r: number) => (r >= 0.7 ? "green" : r >= 0.4 ? "amber" : "red");
const pct = (r: number) => `${Math.round(r * 100)}%`;

type RFilter = "all" | "ready" | "progress" | "risk";

export function WorkflowsView({ plan }: { plan: Plan }) {
  const [tab, setTab] = useState<"journeys" | "coverage">("journeys");
  const [q, setQ] = useState("");
  const [domain, setDomain] = useState("");
  const [rf, setRf] = useState<RFilter>("all");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return plan.workflows.filter((w) => {
      if (domain && w.domain !== domain) return false;
      if (rf === "ready" && w.readiness < 0.7) return false;
      if (rf === "progress" && (w.readiness < 0.4 || w.readiness >= 0.7)) return false;
      if (rf === "risk" && w.readiness >= 0.4) return false;
      if (ql) {
        const hay = (w.id + " " + w.name + " " + w.domain + " " + w.trigger + " " + w.steps.map((s) => s.task).join(" ")).toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [plan.workflows, q, domain, rf]);

  const byDomain = useMemo(() => {
    const m = new Map<string, PlanWF[]>();
    for (const w of filtered) { if (!m.has(w.domain)) m.set(w.domain, []); m.get(w.domain)!.push(w); }
    return [...m.entries()];
  }, [filtered]);

  return (
    <div className="stack" style={{ gap: 18 }}>
      {/* Summary */}
      <div className="wf-stats">
        <Stat n={plan.totals.workflows} label="Workflows" />
        <Stat n={plan.totals.steps} label="Steps" />
        <Stat n={plan.totals.gaps} label="Build gaps" tone="red" />
        <Stat n={plan.totals.standalone} label="Standalone tasks" />
        <span className="wf-overall">
          <span className="cell-sub">Overall readiness</span>
          <span className="wf-bar sm"><span className={`wf-bar-fill ${readinessTone(plan.totals.overall)}`} style={{ width: pct(plan.totals.overall) }} /></span>
          <strong className="tnum">{pct(plan.totals.overall)}</strong>
        </span>
      </div>

      {/* Tabs */}
      <div className="wf-tabs">
        <button className={tab === "journeys" ? "on" : ""} onClick={() => setTab("journeys")}>Journeys <span className="wf-count">{plan.totals.workflows}</span></button>
        <button className={tab === "coverage" ? "on" : ""} onClick={() => setTab("coverage")}>Coverage <span className="wf-count">{plan.totals.standalone}</span></button>
      </div>

      {tab === "journeys" ? (
        <>
          <div className="wf-filters">
            <span className="wf-search"><Search size={15} /><input placeholder="Search workflows, tasks…" value={q} onChange={(e) => setQ(e.target.value)} /></span>
            <select className="input sm" value={domain} onChange={(e) => setDomain(e.target.value)} aria-label="Domain">
              <option value="">All domains ({plan.domains.length})</option>
              {plan.domains.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <div className="wf-seg">
              {([["all", "All"], ["ready", "Ready"], ["progress", "In progress"], ["risk", "At risk"]] as [RFilter, string][]).map(([k, l]) => (
                <button key={k} className={rf === k ? "on" : ""} onClick={() => setRf(k)}>{l}</button>
              ))}
            </div>
          </div>

          {byDomain.length === 0 && <p className="cell-sub">No workflows match these filters.</p>}
          {byDomain.map(([dom, wfs]) => (
            <section key={dom} className="stack" style={{ gap: 10 }}>
              <h3 className="wf-domain">{dom} <span className="cell-sub">· {wfs.length}</span></h3>
              <div className="stack" style={{ gap: 10 }}>
                {wfs.map((w) => <WorkflowCard key={w.id} w={w} open={open.has(w.id)} onToggle={() => toggle(w.id)} />)}
              </div>
            </section>
          ))}
        </>
      ) : (
        <Coverage plan={plan} />
      )}
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return <div className="wf-stat"><span className={`wf-stat-num tnum${tone === "red" && n > 0 ? " sev-danger" : ""}`}>{n}</span><span className="wf-stat-label">{label}</span></div>;
}

function WorkflowCard({ w, open, onToggle }: { w: PlanWF; open: boolean; onToggle: () => void }) {
  return (
    <section className={`wf-card${open ? " open" : ""}`}>
      <button className="wf-card-head" onClick={onToggle} aria-expanded={open}>
        <span className="wf-chev">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
        <span className="wf-id">{w.id}</span>
        <span className="wf-card-main">
          <strong className="wf-name">{w.name}</strong>
          <span className="cell-sub wf-trigger">Trigger: {w.trigger}</span>
        </span>
        <span className="wf-roles">{w.roles.map((r) => <span key={r} className="wf-role">{r}</span>)}</span>
        {w.gap && <span className="wf-gap-badge"><AlertTriangle size={12} /> Gap</span>}
        <span className="wf-readi">
          <span className="wf-bar"><span className={`wf-bar-fill ${readinessTone(w.readiness)}`} style={{ width: pct(w.readiness) }} /></span>
          <strong className="tnum">{pct(w.readiness)}</strong>
        </span>
        <span className="cell-sub wf-steps-n">{w.Steps} steps</span>
      </button>

      {open && (
        <div className="wf-body">
          {w.gap && <div className="wf-blocking"><AlertTriangle size={13} /> <span><strong>Blocking gap:</strong> {w.gap}</span></div>}
          <div className="wf-rollup">
            <Roll label="Built" n={w.Built} tone="green" /><Roll label="Partial" n={w.Partial} tone="amber" />
            <Roll label="Not built" n={w.NotBuilt} tone="red" /><Roll label="Unknown" n={w.Unknown} tone="muted" />
          </div>
          <ol className="wf-steps">
            {w.steps.map((s, i) => <StepRow key={i} s={s} />)}
          </ol>
        </div>
      )}
    </section>
  );
}

function Roll({ label, n, tone }: { label: string; n: number; tone: string }) {
  return <span className="wf-roll"><i className={`wf-dot ${tone}`} />{n} {label}</span>;
}

function StepRow({ s }: { s: PlanStep }) {
  return (
    <li className={`wf-step${s.isGap ? " gap" : ""}`}>
      <span className="wf-step-no">{s.stepNo}</span>
      <span className="wf-step-main">
        <span className="wf-step-task">{s.task}{s.alt && <span className="wf-tag">branch</span>}</span>
        <span className="cell-sub wf-step-meta">
          {s.role}
          {s.srcMod !== "—" && <> · <span className="wf-mod">{s.srcMod}</span></>}
          <> · {s.stepType}</>
          {s.handoff && s.handoff !== "END" && <> · hands off to <strong>{s.handoff}</strong></>}
          {s.notes && <> · {s.notes}</>}
        </span>
      </span>
      <span className="wf-step-right">
        {s.isGap
          ? <Pill tone="gray">Missing</Pill>
          : <Pill tone={TONE[s.norm]}>{s.status.trim() || "—"}</Pill>}
        {!s.isGap && s.priority && s.priority !== "—" && <span className="wf-pri">{s.priority}</span>}
      </span>
    </li>
  );
}

function Coverage({ plan }: { plan: Plan }) {
  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="stack" style={{ gap: 10 }}>
        <div>
          <h3 className="wf-domain" style={{ margin: 0 }}>Standalone / configuration tasks</h3>
          <p className="cell-sub" style={{ margin: "2px 0 0" }}>{plan.unmapped.length} register tasks that aren’t part of any end-to-end journey.</p>
        </div>
        <div className="inv-card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="inv-table">
            <thead><tr><th>Module</th><th>Role</th><th>Task</th><th>Status</th><th>Priority</th></tr></thead>
            <tbody>
              {plan.unmapped.map((u, i) => (
                <tr key={i}>
                  <td className="cell-sub">{u.module}</td><td className="cell-sub">{u.role}</td>
                  <td>{u.task}</td>
                  <td><Pill tone={TONE[normTone(u.status)]}>{u.status.trim() || "—"}</Pill></td>
                  <td className="cell-sub">{u.priority || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack" style={{ gap: 10 }}>
        <h3 className="wf-domain" style={{ margin: 0 }}>Data issues found in source</h3>
        <ul className="wf-issues">
          {plan.dataIssues.map((d, i) => <li key={i}><AlertTriangle size={13} /> <span>{d}</span></li>)}
        </ul>
      </section>
    </div>
  );
}

function normTone(raw: string): Norm {
  const s = raw.toLowerCase();
  if (s.includes("not built")) return "Not Built";
  if (s.includes("partial")) return "Partial";
  if (s.includes("built")) return "Built";
  return "Unknown";
}
