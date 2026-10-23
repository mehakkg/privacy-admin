"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, X, MoreHorizontal, Download } from "lucide-react";
import type { ActivitiesView, ActivitiesViewParams } from "@/lib/engines/activities";
import { formatDate } from "@/lib/datamap/foundations";
import { AddActivityModal } from "@/components/activities/AddActivityModal";
import { createDraftActivityAction } from "@/app/actions/activities";
import { retireActivityAction } from "@/app/actions/activityReview";

const BASE = "/data-map/processing-activities";
const BUCKETS: { key: string; label: string }[] = [
  { key: "needs_work", label: "Needs work" },
  { key: "waiting_for_dpo", label: "Waiting for DPO" },
  { key: "review_due", label: "Review due" },
  { key: "approved", label: "Approved" },
  { key: "all", label: "All" },
];

/**
 * SCREEN — Activities list (Data Map redesign). Every count is computed from the
 * fixture store via nine-state readiness; nothing is hard-coded. The register
 * explanation is DPDP-accurate (a ROPA is not required by the Act).
 */
export function ActivitiesList({ view, params }: { view: ActivitiesView; params: ActivitiesViewParams }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [qLocal, setQLocal] = useState(params.q ?? "");
  const [addOpen, setAddOpen] = useState(false);
  const bucket = params.bucket ?? "needs_work";

  const push = (patch: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged: Record<string, string | undefined> = { ...params, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    start(() => router.push(`${BASE}${sp.toString() ? `?${sp}` : ""}`));
  };
  useEffect(() => {
    const t = setTimeout(() => { if ((params.q ?? "") !== qLocal) push({ q: qLocal || undefined }); }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLocal]);

  const chips: { label: string; clear: () => void }[] = [];
  if (params.entityId) chips.push({ label: view.options.entities.find((e) => e.id === params.entityId)?.name ?? "Fiduciary", clear: () => push({ entityId: undefined }) });
  if (params.principal) chips.push({ label: params.principal, clear: () => push({ principal: undefined }) });
  if (params.department) chips.push({ label: params.department, clear: () => push({ department: undefined }) });

  const count = (k: string) => k === "all" ? view.counts.all : (view.counts as Record<string, number>)[k] ?? 0;

  return (
    <div className="pa-list">
      <div className="pa-head">
        <h1 className="inv-title">Activities</h1>
        <div className="row" style={{ gap: 16, alignItems: "center" }}>
          <Link href="/data-map/purposes" className="row-link">Purposes</Link>
          <a href="/api/discovery/export" className="row-link inv-nowrap">Export register <Download size={13} /></a>
          <button className="btn primary" onClick={() => setAddOpen(true)}>Add activity</button>
        </div>
      </div>

      <p className="cell-sub" style={{ marginTop: 10, maxWidth: 760 }}>Every way Meridian processes personal data: what it collects, why, and where it goes. Notices, rights requests and DPIAs are built from this register.</p>
      <p className="inv-sentence" style={{ marginTop: 12 }}>{view.summary}</p>

      <div className="inv-controls" style={{ marginTop: 16 }}>
        <div className="mp-segment">
          {BUCKETS.map((b) => (
            <button key={b.key} className={bucket === b.key ? "on" : ""} onClick={() => push({ bucket: b.key })}>{b.label} <span className="tnum">{count(b.key)}</span></button>
          ))}
        </div>
        <div className="inv-search" style={{ maxWidth: 260 }}>
          <Search size={14} /><input value={qLocal} onChange={(e) => setQLocal(e.target.value)} placeholder="Search activity, owner or field" aria-label="Search" />
          {qLocal && <button className="icon-btn" onClick={() => setQLocal("")} aria-label="Clear search"><X size={13} /></button>}
        </div>
        <Sel value={params.entityId ?? ""} onChange={(v) => push({ entityId: v || undefined })} label="Fiduciary" options={view.options.entities} />
        <Sel value={params.principal ?? ""} onChange={(v) => push({ principal: v || undefined })} label="Data principal" options={view.options.principals.map((p) => ({ id: p, name: p }))} />
        <Sel value={params.department ?? ""} onChange={(v) => push({ department: v || undefined })} label="Department" options={view.options.departments.map((p) => ({ id: p, name: p }))} />
      </div>

      {chips.length > 0 && (
        <div className="inv-chips">
          {chips.map((c, i) => <button key={i} className="chip" onClick={c.clear}>{c.label} <X size={11} /></button>)}
          <button className="link-btn" onClick={() => start(() => router.push(`${BASE}?bucket=${bucket}`))}>Clear</button>
        </div>
      )}

      {view.rows.length === 0 ? (
        <div className="inv-noresult">No activities match these filters.</div>
      ) : (
        <table className="av-table" style={{ marginTop: 14 }}>
          <thead><tr><th>Activity</th><th>Owner · Dept</th><th>Data principals</th><th>P · F · Proc</th><th>Readiness</th><th>Next step</th><th>Last reviewed</th><th aria-label="Actions"></th></tr></thead>
          <tbody>
            {view.rows.map((r) => (
              <tr key={r.id} className="av-row" onClick={(e) => { if ((e.target as HTMLElement).closest("button,a,select")) return; router.push(`${BASE}/${r.id}`); }}>
                <td><div className="av-name">{r.name}</div><div className="cell-sub">{r.entityName ?? "—"}</div></td>
                <td>{r.owner ?? <span className="sev-warning">No owner</span>}<div className="cell-sub">{r.department ?? "—"}</div></td>
                <td>{r.principals.length ? r.principals.join(", ") : "—"}</td>
                <td className="av-counts">{r.purposeCount} · {r.fieldCount} · {r.processorCount}</td>
                <td><span className={`rchip ${r.chipTone}`}>{r.chipLabel}</span></td>
                <td>{r.next ? (r.next.isLink ? <Link href={`${BASE}/${r.id}`} className="av-next">{r.next.text}</Link> : <span className="av-next text">{r.next.text}</span>) : <span className="cell-sub">—</span>}</td>
                <td className="cell-sub">{r.lastReviewedAt ? formatDate(r.lastReviewedAt) : "Never"}</td>
                <td><RowMenu id={r.id} name={r.name} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {addOpen && <AddActivityModal onClose={() => setAddOpen(false)} onCreated={(id, startFrom) => { setAddOpen(false); router.push(`${BASE}/${id}?pane=${startFrom === "blank" ? "basics" : "purpose"}`); }} />}
    </div>
  );
}

function Sel({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: { id: string; name: string }[] }) {
  return <select className="input sm" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}><option value="">{label}</option>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>;
}

function RowMenu({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", c); return () => document.removeEventListener("mousedown", c); }, []);
  return (
    <div className="inv-more" ref={ref} style={{ position: "relative" }}>
      <button className="icon-btn" aria-label="Actions" onClick={() => setOpen((o) => !o)}><MoreHorizontal size={16} /></button>
      {open && (
        <div className="inv-more-pop" style={{ right: 0, minWidth: 150 }}>
          <button className="menu-item" onClick={() => router.push(`/data-map/processing-activities/${id}`)}>Open</button>
          <button className="menu-item" onClick={() => start(async () => { const r = await createDraftActivityAction(`${name} (copy)`); setOpen(false); if (r.ok && r.id) router.push(`/data-map/processing-activities/${r.id}?pane=basics`); })}>Duplicate</button>
          <button className="menu-item" onClick={() => start(async () => { await retireActivityAction(id, "Archived from the Activities list"); setOpen(false); router.refresh(); })}>Archive</button>
        </div>
      )}
    </div>
  );
}
