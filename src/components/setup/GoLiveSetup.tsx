"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Check, Info, ChevronDown, ChevronRight, X, ExternalLink, ArrowRight } from "lucide-react";
import {
  STEPS, STAGES, SEED_DONE, PEOPLE, roleToOwner, stepState, stageDisplay, stageProgress, stageSteps,
  progress, blockingStep, waitingOn, nextStepFor, initials,
  type Step, type Role, type Field,
} from "@/lib/setup/golive";

export function GoLiveSetup({ sessionRole, days }: { sessionRole: string; days: number }) {
  const router = useRouter();
  const viewer = roleToOwner(sessionRole);
  const [doneArr, setDoneArr] = useState<string[]>(SEED_DONE);
  const done = useMemo(() => new Set(doneArr), [doneArr]);
  const [drawer, setDrawer] = useState<Step | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [reminded, setReminded] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const p = progress(done);
  const next = nextStepFor(viewer, done);
  const rail = waitingOn(done).filter((w) => w.person.id !== viewer);

  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4000); };
  const act = (s: Step) => {
    if (s.open.type === "drawer") setDrawer(s);
    else router.push(s.open.href);
  };
  const saveDrawer = (s: Step) => { setDoneArr((d) => (d.includes(s.id) ? d : [...d, s.id])); setDrawer(null); notify(`${s.title} saved.`); };
  const toggleExpand = (id: string) => setExpanded((e) => { const n = new Set(e); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const remind = (pid: string, name: string) => { setReminded((r) => new Set(r).add(pid)); notify(`Reminder sent to ${name}.`); };

  const deadlineTone = days <= 0 ? "var(--red-text)" : days <= 60 ? "var(--yellow-text)" : "var(--text-3)";

  return (
    <div className="gl">
      {/* Header */}
      <div className="gl-head">
        <div className="stack" style={{ gap: 4 }}>
          <p className="dh-kicker">Getting started</p>
          <h1 className="inv-title">Prepare Meridian Financial Services for go-live</h1>
          <p className="cell-sub" style={{ margin: 0 }}>Each step is owned by the person accountable for it.</p>
        </div>
        <span className="chip gl-deadline" title="Rules 3, 5–16, 22 and 23 commence 18 months after notification on 13 Nov 2025." style={{ color: deadlineTone, borderColor: deadlineTone }}>
          DPDP Rules take effect 13 May 2027 · {days} days <Info size={12} />
        </span>
      </div>

      {/* Progress line — one line, one bar */}
      <div className="gl-progress">
        <div className="gl-progress-row">
          <strong>{p.doneCount} of {p.total} required steps done</strong>
          <span className="cell-sub">Go-live: {p.live} of {p.liveTotal} live</span>
        </div>
        <span className="gl-bar"><span className="gl-bar-fill" style={{ width: `${p.pct}%` }} /></span>
      </div>

      <div className="gl-grid">
        {/* Main column */}
        <div className="stack" style={{ gap: 14 }}>
          <NextCard next={next} onAct={act} />
          {STAGES.map((st) => (
            <StageBlock key={st.n} n={st.n} title={st.title} viewer={viewer} done={done}
              expandedRows={expanded} onToggleRow={toggleExpand} onAct={act} onEdit={act} reminded={reminded} />
          ))}
        </div>

        {/* Right rail */}
        <aside className="stack" style={{ gap: 14 }}>
          <div className="inv-card gl-rail">
            <strong className="gl-rail-title">Waiting on</strong>
            {rail.length === 0 && <p className="cell-sub" style={{ margin: "8px 0 0" }}>Nobody is blocking setup right now.</p>}
            {rail.map(({ person, step }) => (
              <div key={person.id} className="gl-rail-row">
                <Avatar person={person} />
                <span className="stack" style={{ gap: 1, flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 13 }}>{person.name} · <span className="cell-sub" style={{ fontWeight: 400 }}>{person.role}</span></strong>
                  <span className="cell-sub gl-trunc">{step.title} · 2 days</span>
                </span>
                {reminded.has(person.id)
                  ? <span className="cell-sub" style={{ whiteSpace: "nowrap" }}>Reminded · just now</span>
                  : <button className="btn ghost sm" onClick={() => remind(person.id, person.name)}>Remind</button>}
              </div>
            ))}
            <div className="gl-rail-sep" />
            <span className="cell-sub" style={{ fontWeight: 600 }}>Not invited yet</span>
            <div className="gl-rail-row">
              <Avatar person={PEOPLE.legal} />
              <span className="stack" style={{ gap: 1, flex: 1 }}><strong style={{ fontSize: 13 }}>Legal</strong></span>
              <Link href="/settings/organization?tab=users" className="btn ghost sm">Invite</Link>
            </div>
            <div className="gl-rail-sep" />
            <Link href="/audit?category=setup" className="row-link">View setup history <ArrowRight size={13} /></Link>
          </div>
        </aside>
      </div>

      {drawer && <ConfigDrawer step={drawer} onClose={() => setDrawer(null)} onSave={() => saveDrawer(drawer)} />}
      {toast && <div className="gl-toast" role="status">{toast}</div>}
    </div>
  );
}

function Avatar({ person }: { person: { name: string; color: string } }) {
  return <span className="gl-avatar" style={{ background: person.color }} title={person.name}>{initials(person.name)}</span>;
}

/* ---- Next step card ---- */
function NextCard({ next, onAct }: { next: ReturnType<typeof nextStepFor>; onAct: (s: Step) => void }) {
  if (next.state === "do" && next.step) {
    const s = next.step;
    return (
      <div className="inv-card gl-next">
        <span className="gl-next-eyebrow">Next for you</span>
        <div className="gl-next-body">
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <strong style={{ fontSize: 15 }}>{s.title}</strong>
            <span className="cell-sub">{s.estimate}</span>
          </div>
          <button className="btn primary" onClick={() => onAct(s)}>{s.open.type === "drawer" ? "Start" : "Start"}</button>
        </div>
      </div>
    );
  }
  if (next.state === "progress" && next.step) {
    const s = next.step;
    return (
      <div className="inv-card gl-next">
        <span className="gl-next-eyebrow">Continue where you left off</span>
        <div className="gl-next-body">
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <strong style={{ fontSize: 15 }}>{s.title}</strong>
            <span className="cell-sub">{s.inProgress}</span>
          </div>
          <button className="btn primary" onClick={() => onAct(s)}>Continue</button>
        </div>
      </div>
    );
  }
  if (next.state === "blocked" && next.step) {
    return (
      <div className="inv-card gl-next">
        <span className="gl-next-eyebrow">Nothing needs you right now</span>
        <p style={{ margin: "6px 0 0", fontSize: 14 }}>
          Your next step, <a href={`#step-${next.step.id}`} className="row-link" style={{ display: "inline" }}>{next.step.title}</a>, unlocks after {next.unlockAfter ? `${PEOPLE[next.unlockAfter.owner].name} ${verbPhrase(next.unlockAfter)}` : "an earlier step"}.
        </p>
      </div>
    );
  }
  // done
  const waiting = next.waiting ?? [];
  return (
    <div className="inv-card gl-next">
      <span className="gl-next-eyebrow">You’ve finished your steps</span>
      <p style={{ margin: "6px 0 0", fontSize: 14 }}>
        {waiting.length ? <>The org is waiting on {waiting.map((w) => w.name).join(" and ")}.</> : "Everything is done. Meridian is ready to go live."}
      </p>
    </div>
  );
}

function verbPhrase(s: Step): string {
  if (s.id === "activities") return "submits processing activities";
  if (s.id === "connect") return "connects business systems";
  if (s.id === "notices") return "publishes notices";
  return `completes “${s.title}”`;
}

/* ---- Stage ---- */
function StageBlock({ n, title, viewer, done, expandedRows, onToggleRow, onAct, onEdit, reminded }: {
  n: number; title: string; viewer: Role; done: Set<string>;
  expandedRows: Set<string>; onToggleRow: (id: string) => void; onAct: (s: Step) => void; onEdit: (s: Step) => void; reminded: Set<string>;
}) {
  const disp = stageDisplay(n, done);
  const sp = stageProgress(n, done);
  const [open, setOpen] = useState(disp === "current");
  const [optOpen, setOptOpen] = useState(false);

  const req = stageSteps(n).filter((s) => s.required);
  const opt = stageSteps(n).filter((s) => !s.required);
  const stateLabel = disp === "done" ? "Done" : disp === "locked" ? "Locked" : "In progress";
  const prevStage = STAGES[n - 2];

  return (
    <section className="gl-stage">
      <button className="gl-stage-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={`gl-stage-badge ${disp}`}>{disp === "done" ? <Check size={13} strokeWidth={3} /> : disp === "locked" ? <Lock size={12} /> : n}</span>
        <strong>{title}</strong>
        <span className="cell-sub">{disp === "locked" ? (prevStage ? `Unlocks after ${prevStage.title}` : "Locked") : `${sp.doneCount} of ${sp.total} · ${stateLabel}`}</span>
        <span className="gl-stage-chev">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
      </button>
      {open && (
        <div className="gl-rows">
          {req.map((s) => <Row key={s.id} s={s} viewer={viewer} done={done} expanded={expandedRows.has(s.id)} onToggle={() => onToggleRow(s.id)} onAct={onAct} onEdit={onEdit} />)}
          {opt.length > 0 && (
            <div className="gl-opt">
              <button className="gl-opt-head" onClick={() => setOptOpen((o) => !o)}>{optOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Optional ({opt.length})</button>
              {optOpen && opt.map((s) => <Row key={s.id} s={s} viewer={viewer} done={done} optional expanded={expandedRows.has(s.id)} onToggle={() => onToggleRow(s.id)} onAct={onAct} onEdit={onEdit} />)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ---- Task row ---- */
function Row({ s, viewer, done, optional, expanded, onToggle, onAct, onEdit }: {
  s: Step; viewer: Role; done: Set<string>; optional?: boolean; expanded: boolean; onToggle: () => void; onAct: (s: Step) => void; onEdit: (s: Step) => void;
}) {
  const st = stepState(s, done);
  const owner = PEOPLE[s.owner];
  const isMine = s.owner === viewer;
  const block = st === "locked" ? blockingStep(s, done) : undefined;

  const icon = st === "done" ? <span className="gl-ic done"><Check size={13} strokeWidth={3} /></span>
    : st === "locked" ? <span className="gl-ic locked"><Lock size={12} /></span>
    : st === "progress" ? <span className="gl-ic half" />
    : <span className="gl-ic ring" />;

  // Meta line
  const meta = st === "locked"
    ? <>Unlocks after: <a href={`#step-${block?.id}`} className="row-link" style={{ display: "inline" }}>{block?.title}</a></>
    : st === "done" ? <>{owner.name} · {s.lastChanged?.split(" · ")[1] ?? "done"}</>
    : st === "progress" ? <>{owner.name} · {s.inProgress}</>
    : <>{owner.name} · {s.estimate}</>;

  // Right slot
  let right: React.ReactNode = null;
  if (st === "done") right = <button className="gl-view" onClick={onToggle}>{expanded ? "Hide" : "View"} {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>;
  else if (st === "locked") right = null;
  else if (isMine) right = <button className="btn sec sm" onClick={(e) => { e.stopPropagation(); onAct(s); }}>{st === "progress" ? "Continue" : "Start"}</button>;
  else if (st === "progress") right = <span className="cell-sub" style={{ whiteSpace: "nowrap" }}>In progress · {owner.name}</span>;
  else right = <span className="cell-sub" style={{ whiteSpace: "nowrap" }}>Waiting · 2 days</span>;

  const clickable = st !== "locked";
  const onRowClick = () => { if (st === "done") onToggle(); else if (clickable && (isMine)) onAct(s); };

  return (
    <div id={`step-${s.id}`} className={`gl-row${clickable ? " click" : ""}`} onClick={clickable ? onRowClick : undefined} title={st === "locked" && block ? `Finish “${block.title}” first` : undefined}>
      <div className="gl-row-main">
        {icon}
        <span className="stack" style={{ gap: 1, minWidth: 0 }}>
          <span className="gl-row-title">{s.title}{optional && <span className="chip gl-opt-chip">Optional</span>}</span>
          <span className="cell-sub gl-trunc">{meta}</span>
        </span>
      </div>
      <div className="gl-row-right" onClick={(e) => e.stopPropagation()}>{right}</div>

      {st === "done" && expanded && (
        <div className="gl-done-detail">
          <p className="gl-done-summary">{s.summary}</p>
          <div className="gl-done-foot">
            {isMine
              ? <button className="row-link" onClick={() => onEdit(s)}>Edit</button>
              : <span className="gl-policy"><Lock size={12} /> Set by {owner.role} · Only {owner.name} can change this</span>}
            <span className="cell-sub">Last changed by {s.lastChanged}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Config drawer (≤4 fields) ---- */
function ConfigDrawer({ step, onClose, onSave }: { step: Step; onClose: () => void; onSave: () => void }) {
  const d = step.open.type === "drawer" ? step.open.drawer : null;
  const [vals, setVals] = useState<Record<number, string>>(() => Object.fromEntries((d?.fields ?? []).map((f, i) => [i, f.value ?? ""])));
  const [err, setErr] = useState<Record<number, string>>({});
  if (!d) return null;

  const validate = () => {
    const e: Record<number, string> = {};
    d.fields.forEach((f, i) => {
      if (f.kind === "number") {
        const n = Number(vals[i]);
        if (!vals[i] || Number.isNaN(n) || n < (f.min ?? 1) || n > (f.max ?? 9999)) e[i] = `Enter a number of days between ${f.min ?? 1} and ${f.max ?? 9999}.`;
      }
    });
    setErr(e); return Object.keys(e).length === 0;
  };

  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mp-drawer" role="dialog" aria-modal="true" aria-label={d.title} style={{ width: 560 }}>
        <div className="mp-drawer-head"><strong>{d.title}</strong><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="mp-drawer-body stack" style={{ gap: 14, padding: 18, overflow: "auto" }}>
          {d.intro && <p className="cell-sub" style={{ margin: 0 }}>{d.intro}</p>}
          {d.fields.map((f, i) => <FieldInput key={i} f={f} value={vals[i]} err={err[i]} onChange={(v) => setVals((s) => ({ ...s, [i]: v }))} />)}
        </div>
        <div className="mp-drawer-foot row" style={{ justifyContent: "flex-end", gap: 8, padding: 12, borderTop: "1px solid var(--border)" }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => { if (validate()) onSave(); }}>Save</button>
        </div>
      </div>
    </div>
  );
}

function FieldInput({ f, value, err, onChange }: { f: Field; value: string; err?: string; onChange: (v: string) => void }) {
  return (
    <label className="stack" style={{ gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{f.label}</span>
      {f.kind === "select"
        ? <select className="input sm" value={value} onChange={(e) => onChange(e.target.value)}>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>
        : <input className="input sm" type={f.kind === "number" ? "number" : "text"} placeholder={f.kind !== "select" ? f.placeholder : undefined} value={value} onChange={(e) => onChange(e.target.value)} min={f.kind === "number" ? f.min : undefined} max={f.kind === "number" ? f.max : undefined} />}
      {f.kind === "number" && f.helper && !err && <span className="cell-sub">{f.helper}</span>}
      {err && <span className="cell-sub sev-danger">{err}</span>}
    </label>
  );
}
