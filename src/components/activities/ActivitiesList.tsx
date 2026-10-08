"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, X, Check, SlidersHorizontal, ChevronDown, AlertTriangle } from "lucide-react";
import type { ActivityListView, ActivityListParams, ActivityListRow } from "@/lib/engines/activities";
import { createDraftActivityAction } from "@/app/actions/activities";

const LIST = "/data-map/processing-activities";
const LIFECYCLE_LABEL: Record<string, string> = { draft: "Draft", pending_dpo_review: "Waiting for DPO review", active: "Active", under_review: "Under review", retired: "Retired" };

export function ActivitiesList({ view, params }: { view: ActivityListView; params: ActivityListParams }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [qLocal, setQLocal] = useState(params.q ?? "");
  const [addOpen, setAddOpen] = useState(false);
  const segment = params.segment ?? (view.counts.needsWork > 0 ? "needs-work" : "all");

  const push = (patch: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged: Record<string, string | undefined> = { ...params, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    start(() => router.push(`${LIST}${sp.toString() ? `?${sp}` : ""}`));
  };
  useEffect(() => {
    const t = setTimeout(() => { if ((params.q ?? "") !== qLocal) push({ q: qLocal || undefined }); }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLocal]);

  const chips: { label: string; clear: () => void }[] = [];
  if (params.owner) chips.push({ label: params.owner, clear: () => push({ owner: undefined }) });
  if (params.department) chips.push({ label: params.department, clear: () => push({ department: undefined }) });
  if (params.purpose) chips.push({ label: view.options.purposes.find((p) => p.id === params.purpose)?.name ?? "Purpose", clear: () => push({ purpose: undefined }) });
  if (params.lifecycle) chips.push({ label: LIFECYCLE_LABEL[params.lifecycle] ?? params.lifecycle, clear: () => push({ lifecycle: undefined }) });

  return (
    <div className="pa-list">
      <div className="pa-head">
        <h1 className="inv-title">Processing activities</h1>
        <div className="row" style={{ gap: 16, alignItems: "center" }}>
          <Link href="/data-map/purposes" className="row-link">Purposes</Link>
          <a href="/api/discovery/export" className="row-link">Export</a>
          <button className="btn primary" onClick={() => setAddOpen(true)}>Add activity</button>
        </div>
      </div>

      <p className="inv-sentence" style={{ marginTop: 14 }}>{view.sentence}</p>
      <p className="cell-sub" style={{ margin: "2px 0 0" }}>{view.gapsLine}</p>

      <div className="inv-controls" style={{ marginTop: 18 }}>
        <div className="mp-segment">
          <button className={segment === "needs-work" ? "on" : ""} onClick={() => push({ segment: "needs-work" })}>Needs work <span className="tnum">{view.counts.needsWork}</span></button>
          <button className={segment === "under-review" ? "on" : ""} onClick={() => push({ segment: "under-review" })}>Under review <span className="tnum">{view.counts.underReview}</span></button>
          <button className={segment === "all" ? "on" : ""} onClick={() => push({ segment: "all" })}>All <span className="tnum">{view.counts.all}</span></button>
        </div>
        <div className="inv-search" style={{ maxWidth: 280 }}>
          <Search size={14} /><input value={qLocal} onChange={(e) => setQLocal(e.target.value)} placeholder="Search activities, owners, purposes, systems" aria-label="Search" />
          {qLocal && <button className="icon-btn" onClick={() => setQLocal("")} aria-label="Clear search"><X size={13} /></button>}
        </div>
        <MoreFilters view={view} params={params} push={push} />
      </div>

      <div className="inv-chips">
        {chips.map((c, i) => <button key={i} className="chip" onClick={c.clear}>{c.label} <X size={11} /></button>)}
        {chips.length > 0 && <button className="link-btn" onClick={() => start(() => router.push(LIST))}>Clear</button>}
        <span className="cell-sub" style={{ marginLeft: "auto" }}>Showing <span className="tnum">{view.showing}</span> of <span className="tnum">{view.total}</span></span>
      </div>

      {view.rows.length === 0 ? (
        <div className="inv-noresult">No activities match these filters. <button className="link-btn" onClick={() => start(() => router.push(LIST))}>Clear filters</button></div>
      ) : (
        <div className="pa-rows">
          {view.rows.map((r) => <Row key={r.id} r={r} multiEntity={view.multiEntity} onOpen={(href) => start(() => router.push(href))} />)}
        </div>
      )}

      {addOpen && <AddModal onClose={() => setAddOpen(false)} onCreated={(id) => { setAddOpen(false); router.push(`${LIST}/${id}`); }} />}
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "Never reviewed";
  const dt = new Date(iso);
  return `Last reviewed ${dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

function targetHref(r: ActivityListRow): string {
  const t = r.next.target;
  const base = `${LIST}/${r.id}`;
  if (!t) return base;
  const sp = new URLSearchParams();
  sp.set("pane", t.pane);
  if (t.purpose) sp.set("purpose", t.purpose);
  if (t.section) sp.set("section", t.section);
  if (t.addPurpose) sp.set("add", "purpose");
  return `${base}?${sp}`;
}

function Row({ r, multiEntity, onOpen }: { r: ActivityListRow; multiEntity: boolean; onOpen: (href: string) => void }) {
  const dotTone = r.completenessKind === "complete" ? "var(--green)" : r.completenessKind === "needs_review" ? "var(--blue)" : "var(--yellow-700, #b45309)";
  const sub = [r.owner ?? "No owner", r.department].filter(Boolean).join(" · ") + (multiEntity && r.entityName ? ` · ${r.entityName}` : "") + " · " + fmtDate(r.lastReviewedAt).replace("Last reviewed", "Last reviewed").replace("Never reviewed", "Never reviewed");
  return (
    <div className="pa-row" onClick={(e) => { if ((e.target as HTMLElement).closest("a,button")) return; onOpen(targetHref(r)); }}>
      <div className="pa-row-main">
        <div className="pa-row-name">{r.name}</div>
        <div className="cell-sub">{sub}</div>
        <div className="cell-sub">{r.summary}</div>
        <div className="pa-row-status">
          {r.completenessKind === "complete" ? (
            <span className="inv-status sev-success"><Check size={13} /> Ready for ROPA</span>
          ) : r.completenessKind === "retired" ? (
            <span className="cell-sub">Retired</span>
          ) : (
            <span className="inv-status"><span className="dot" style={{ background: dotTone }} />{r.completenessLabel}{r.next.actionable && r.next.verb ? <button className="link-btn pa-verb" onClick={() => onOpen(targetHref(r))}>{r.next.verb}</button> : null}</span>
          )}
          {r.openEscalations > 0 && <Link href={`/escalations?activity=${r.id}`} className="link-btn pa-esc" onClick={(e) => e.stopPropagation()}><AlertTriangle size={12} /> {r.openEscalations} pending escalation</Link>}
        </div>
      </div>
      <div className="pa-row-right">
        <span className="cell-sub">{LIFECYCLE_LABEL[r.lifecycle]}</span>
      </div>
    </div>
  );
}

function MoreFilters({ view, params, push }: { view: ActivityListView; params: ActivityListParams; push: (p: Record<string, string | undefined>) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", c); return () => document.removeEventListener("mousedown", c); }, []);
  const n = [params.owner, params.department, params.purpose, params.lifecycle].filter(Boolean).length;
  const Sel = ({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: { id: string; name: string }[] }) => (
    <select className="input sm" style={{ width: "100%" }} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}><option value="">{label}</option>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
  );
  return (
    <div className="inv-more" ref={ref}>
      <button className="btn ghost sm" onClick={() => setOpen((o) => !o)}><SlidersHorizontal size={13} /> More filters{n > 0 && <span className="tnum"> ({n})</span>} <ChevronDown size={13} /></button>
      {open && (
        <div className="inv-more-pop">
          <Sel value={params.lifecycle ?? ""} onChange={(v) => push({ lifecycle: v || undefined })} label="Lifecycle" options={[{ id: "draft", name: "Draft" }, { id: "pending_dpo_review", name: "Waiting for DPO review" }, { id: "active", name: "Active" }, { id: "under_review", name: "Under review" }, { id: "retired", name: "Retired" }]} />
          <Sel value={params.owner ?? ""} onChange={(v) => push({ owner: v || undefined })} label="Owner" options={view.options.owners.map((o) => ({ id: o, name: o }))} />
          <Sel value={params.department ?? ""} onChange={(v) => push({ department: v || undefined })} label="Department" options={view.options.departments.map((o) => ({ id: o, name: o }))} />
          <Sel value={params.purpose ?? ""} onChange={(v) => push({ purpose: v || undefined })} label="Purpose" options={view.options.purposes} />
        </div>
      )}
    </div>
  );
}

function AddModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () => start(async () => { const r = await createDraftActivityAction(name); if (r.ok && r.id) onCreated(r.id); else setErr(r.error ?? "Couldn’t create."); });
  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal std-modal sm" role="dialog" aria-modal="true" aria-label="Add activity">
        <div className="std-modal-head"><h3 style={{ margin: 0 }}>Add activity</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="std-modal-body stack" style={{ gap: 8 }}>
          <label className="fld"><span>Name</span><input className="input" autoFocus value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} placeholder="e.g. Retail Loan Origination" /></label>
          <p className="cell-sub" style={{ margin: 0 }}>Starting from a suggestion or template arrives in the next step. This creates a blank draft.</p>
          {err && <div className="notice warn" style={{ margin: 0 }}>{err}</div>}
        </div>
        <div className="std-modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={pending} onClick={submit}>Create draft</button></div>
      </div>
    </div>, document.body);
}
