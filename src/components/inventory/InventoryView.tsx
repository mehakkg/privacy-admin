"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, X, ExternalLink, Download, ChevronDown, ChevronRight, Check, AlertTriangle, Clock, SlidersHorizontal,
} from "lucide-react";
import {
  SENS_TONE, READINESS_META, READINESS_ORDER, SENS_RANK, nextStepLine, cardAction,
  type InventoryView as View, type InventoryRow, type Readiness, type Segment, type Grouping, type PurposeOption, type GroupView,
} from "@/lib/inventory";
import { MovedNote } from "@/components/MovedNote";
import { assignPurposeAction, removePurposeAction, setFieldAttributeAction, suggestPurposesAction, syncNowAction } from "@/app/actions/inventory";
import type { InventoryParams } from "@/lib/engines/inventory";

type Opt = { id: string; name: string };
const DLP_URL = "#";

export function InventoryView({ view, params, moved, categories, subjectTypes }: {
  view: View; params: InventoryParams; moved?: string; categories: Opt[]; subjectTypes: string[];
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [popover, setPopover] = useState<{ fieldIds: string[]; anchor: { top: number; left: number } } | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo: (() => void) | null } | null>(null);
  const [live, setLive] = useState("");
  const [added, setAdded] = useState<Record<string, PurposeOption>>({}); // fieldId → first purpose added (optimistic)
  const [openGroups, setOpenGroups] = useState<Set<string> | null>(null);
  const [qLocal, setQLocal] = useState(params.q ?? "");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const grouping: Grouping = params.grouping ?? "system";
  const segment: Segment = params.segment ?? (view.counts.attention > 0 ? "attention" : "all");
  const purposeById = useMemo(() => new Map(view.approvedPurposes.map((p) => [p.id, p])), [view.approvedPurposes]);

  useEffect(() => { setAdded({}); }, [view]);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // ---- Optimistic status for an assigned field --------------------------------
  const optimisticStatusOf = (r: InventoryRow): Readiness => {
    const p = added[r.id];
    if (!p || r.status !== "pur") return r.status;
    return p.consent === "not_linked" ? "link" : "ready";
  };
  const rows = useMemo(() => view.rows.map((r) => {
    const p = added[r.id];
    if (!p) return r;
    const status = optimisticStatusOf(r);
    const purposes = r.purposes.some((x) => x.id === p.id) ? r.purposes : [...r.purposes, { id: p.id, name: p.name }];
    return { ...r, purposes, status };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [view.rows, added]);

  // ---- Optimistic counts (one source of truth) ------------------------------
  const counts = useMemo(() => {
    const by = { ...view.counts.byStatus };
    for (const id of Object.keys(added)) {
      const orig = view.rows.find((r) => r.id === id);
      if (!orig || orig.status !== "pur") continue;
      const ns = added[id].consent === "not_linked" ? "link" : "ready";
      by.pur = Math.max(0, by.pur - 1); by[ns] += 1;
    }
    const ready = by.ready; const total = view.counts.total;
    return { total, ready, attention: total - ready, byStatus: by };
  }, [view.counts, view.rows, added]);

  // ---- URL controls ---------------------------------------------------------
  const pushParams = (patch: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged: Record<string, string | undefined> = { ...params, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    start(() => router.push(`/discovery/inventory${sp.toString() ? `?${sp}` : ""}`));
  };
  useEffect(() => {
    const t = setTimeout(() => { if ((params.q ?? "") !== qLocal) pushParams({ q: qLocal || undefined }); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLocal]);

  // ---- Displayed rows + groups ---------------------------------------------
  const displayed = useMemo(() => segment === "attention" ? rows.filter((r) => r.status !== "ready") : rows, [rows, segment]);
  const suggestionByKey = useMemo(() => new Map((view.groups ?? []).map((g) => [g.key, g.suggestion])), [view.groups]);
  const groups = useMemo(() => {
    if (grouping === "none") return null;
    const keyOf = (r: InventoryRow) => grouping === "dataType" ? r.dataType : r.system;
    const map = new Map<string, InventoryRow[]>();
    for (const r of displayed) (map.get(keyOf(r)) ?? map.set(keyOf(r), []).get(keyOf(r))!).push(r);
    const gs = [...map.entries()].map(([key, rs]): GroupView & { rows: InventoryRow[] } => {
      const mix = ["Restricted", "Confidential", "Internal", "Public", "Not classified"].map((label) => ({ label, count: rs.filter((r) => r.sensitivity === label).length })).filter((m) => m.count > 0);
      const gaps = (["cls", "pur", "link", "old"] as Readiness[]).map((status) => ({ status, count: rs.filter((r) => r.status === status).length })).filter((g) => g.count > 0);
      const purIds = rs.filter((r) => r.status === "pur").map((r) => r.id);
      const baseSug = suggestionByKey.get(key) ?? null;
      const suggestion = baseSug && purIds.length ? { ...baseSug, fieldIds: purIds } : null;
      return { key, name: key, fieldCount: rs.length, newCount: rs.filter((r) => r.isNew || r.isChanged).length, mix, gaps, ready: rs.every((r) => r.status === "ready"), suggestion, rowIds: rs.map((r) => r.id), rows: rs };
    });
    gs.sort((a, b) => b.gaps.reduce((n, g) => n + g.count, 0) - a.gaps.reduce((n, g) => n + g.count, 0) || a.name.localeCompare(b.name));
    return gs;
  }, [displayed, grouping, suggestionByKey]);

  // First group open, rest collapsed (until the user toggles).
  const isGroupOpen = (key: string, i: number) => openGroups ? openGroups.has(key) : i === 0;
  const toggleGroup = (key: string) => setOpenGroups((s) => { const base = s ?? new Set((groups ?? []).filter((_, i) => i === 0).map((g) => g.key)); const n = new Set(base); n.has(key) ? n.delete(key) : n.add(key); return n; });

  // ---- Assign flow ---------------------------------------------------------
  const doAssign = (fieldIds: string[], purposeId: string) => {
    const purpose = purposeById.get(purposeId); if (!purpose) return;
    setAdded((a) => { const n = { ...a }; for (const id of fieldIds) if (!n[id]) n[id] = purpose; return n; });
    setPopover(null);
    const stillPur = Math.max(0, counts.byStatus.pur - fieldIds.filter((id) => view.rows.find((r) => r.id === id)?.status === "pur").length);
    setLive(`Purpose assigned. ${stillPur} field${stillPur === 1 ? "" : "s"} still need a purpose.`);
    start(async () => {
      const r = await assignPurposeAction(fieldIds, purposeId);
      if (!r.ok) { setToast({ msg: r.error ?? "Couldn’t assign.", undo: null }); setAdded({}); router.refresh(); return; }
      const applied = r.result?.assigned ?? fieldIds.length;
      const skipped = r.result?.skipped ?? 0;
      setToast({
        msg: `Purpose assigned to ${applied} field${applied === 1 ? "" : "s"}.${skipped ? ` ${skipped} already had it.` : ""}`,
        undo: () => start(async () => { for (const id of fieldIds) await removePurposeAction(id, purposeId); setToast(null); router.refresh(); }),
      });
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 8000);
      setSel(new Set());
      router.refresh();
    });
  };

  // ---- Chips ---------------------------------------------------------------
  const chips: { label: string; clear: () => void }[] = [];
  if (params.system) chips.push({ label: params.system, clear: () => pushParams({ system: undefined }) });
  if (params.sensitivity) chips.push({ label: params.sensitivity, clear: () => pushParams({ sensitivity: undefined }) });
  if (params.status) chips.push({ label: READINESS_META[params.status as Readiness]?.label ?? params.status, clear: () => pushParams({ status: undefined }) });
  if (params.dataType) chips.push({ label: params.dataType, clear: () => pushParams({ dataType: undefined }) });
  if (params.dataCategory) chips.push({ label: params.dataCategory, clear: () => pushParams({ dataCategory: undefined }) });
  if (params.purpose) chips.push({ label: purposeById.get(params.purpose)?.name ?? "Purpose", clear: () => pushParams({ purpose: undefined }) });
  if (params.subject) chips.push({ label: params.subject, clear: () => pushParams({ subject: undefined }) });
  if (params.provenance) chips.push({ label: params.provenance, clear: () => pushParams({ provenance: undefined }) });

  const drawerRow = drawerId ? rows.find((r) => r.id === drawerId) ?? null : null;
  const totalShown = displayed.length;

  if (view.notConnected) return (
    <div className="inv-empty">
      <h2>Connect your DLP to see your data.</h2>
      <p className="cell-sub">Discovery, classification and scanning happen in the DLP. Connect it to populate the inventory.</p>
      <div className="row" style={{ gap: 10, justifyContent: "center", marginTop: 8 }}>
        <Link href="/integrations/dlp" className="btn primary">Connect DLP</Link>
        <Link href="/integrations/dlp" className="btn ghost">Add a declared system</Link>
      </div>
    </div>
  );

  const nextStep = nextStepLine(counts, (groups ?? []).reduce((n, g) => n + (g.suggestion?.fieldIds.length ?? 0), 0));
  const act = cardAction(counts);

  return (
    <div className="inv">
      <div aria-live="polite" className="sr-only">{live}</div>

      {/* Header */}
      <div className="inv-head">
        <div className="stack" style={{ gap: 2 }}>
          <h1 className="inv-title">Data inventory</h1>
          <SyncLine view={view} onSync={() => start(async () => { await syncNowAction(); router.refresh(); })} />
        </div>
        <div className="row inv-headlinks">
          <a href={DLP_URL} className="row-link inv-nowrap" aria-label="Open in DLP (external)">Open in DLP <ExternalLink size={13} /></a>
          <a href="/api/discovery/export" className="row-link inv-nowrap">Export <Download size={13} /></a>
        </div>
      </div>

      <MovedNote moved={moved} />

      {/* Readiness card */}
      <div className="inv-card">
        <div className="inv-card-top">
          <div className="stack" style={{ gap: 4 }}>
            <div className="inv-card-sentence"><span className="tnum">{counts.ready}</span> of <span className="tnum">{counts.total}</span> fields are ready for ROPA.</div>
            {nextStep && <div className="cell-sub">{nextStep}{view.sync.status === "failed" && view.sync.lastSyncedExact ? ` · As of ${view.sync.lastSyncedExact}` : ""}</div>}
          </div>
          {act && <button className="btn sm" onClick={() => pushParams({ status: act.status, segment: act.status === "ready" ? "all" : "attention" })}>{act.label}</button>}
        </div>
        <ReadinessBar counts={counts} onPick={(s) => pushParams({ status: s, segment: s === "ready" ? "all" : "attention" })} />
        <div className="inv-legend">
          {READINESS_ORDER.map((s) => counts.byStatus[s] > 0 && (
            <button key={s} className="inv-legend-item" onClick={() => pushParams({ status: s, segment: s === "ready" ? "all" : "attention" })}>
              <span className="dot" style={{ background: READINESS_META[s].dot }} />{READINESS_META[s].label} <span className="tnum">{counts.byStatus[s]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="inv-controls">
        <div className="mp-segment">
          <button className={segment === "attention" ? "on" : ""} onClick={() => pushParams({ segment: "attention" })}>Needs attention <span className="tnum">{counts.attention}</span></button>
          <button className={segment === "all" ? "on" : ""} onClick={() => pushParams({ segment: "all", status: undefined })}>All <span className="tnum">{counts.total}</span></button>
        </div>
        <label className="inv-groupby cell-sub">Group by
          <select className="input sm" value={grouping} onChange={(e) => pushParams({ grouping: e.target.value })} aria-label="Group by">
            <option value="system">System</option><option value="dataType">Data type</option><option value="none">None</option>
          </select>
        </label>
        <div className="inv-search">
          <Search size={14} /><input value={qLocal} onChange={(e) => setQLocal(e.target.value)} placeholder="Search name, path, system" aria-label="Search" />
          {qLocal && <button className="icon-btn" onClick={() => setQLocal("")} aria-label="Clear search"><X size={13} /></button>}
        </div>
        <Select value={params.sensitivity ?? ""} onChange={(v) => pushParams({ sensitivity: v || undefined })} label="Sensitivity" options={["Restricted", "Confidential", "Internal", "Public", "Not classified"].map((s) => ({ id: s, name: s }))} />
        <MoreFilters params={params} pushParams={pushParams} categories={categories} subjectTypes={subjectTypes} purposes={view.approvedPurposes} systems={view.systems} dataTypes={view.dataTypes} />
      </div>

      <div className="inv-chips">
        {chips.map((c, i) => <button key={i} className="chip" onClick={c.clear}>{c.label} <X size={11} /></button>)}
        {chips.length > 0 && <button className="link-btn" onClick={() => start(() => router.push("/discovery/inventory"))}>Clear</button>}
        <span className="cell-sub" style={{ marginLeft: "auto" }}>Showing <span className="tnum">{totalShown}</span> of <span className="tnum">{counts.total}</span></span>
      </div>

      {/* Work list */}
      {totalShown === 0 ? (
        <div className="inv-noresult">No fields match these filters. <button className="link-btn" onClick={() => start(() => router.push("/discovery/inventory"))}>Clear filters</button></div>
      ) : grouping === "none" ? (
        <FlatTable rows={displayed} sel={sel} setSel={setSel} grouping={grouping} onOpen={setDrawerId} onAssign={(ids, e) => openAssign(ids, e, setPopover)} />
      ) : (
        <div className="inv-groups">
          {groups!.map((g, i) => (
            <GroupBlock key={g.key} g={g} grouping={grouping} open={isGroupOpen(g.key, i)} onToggle={() => toggleGroup(g.key)}
              sel={sel} setSel={setSel} onOpen={setDrawerId} onAssign={(ids, e) => openAssign(ids, e, setPopover)}
              onAssignSuggestion={(gg, e) => { if (gg.suggestion!.confidence === "high") doAssign(gg.suggestion!.fieldIds, gg.suggestion!.purposeId); else openAssign(gg.suggestion!.fieldIds, e, setPopover); }}
            />
          ))}
        </div>
      )}

      {sel.size > 0 && (
        <div className="inv-bulkbar">
          <span><span className="tnum">{sel.size}</span> selected</span>
          <div className="row" style={{ gap: 10, marginLeft: "auto" }}>
            <button className="btn primary sm" onClick={(e) => openAssign([...sel], e, setPopover, true)}>Assign purpose</button>
            <button className="btn ghost sm" onClick={() => setSel(new Set())}>Clear</button>
          </div>
        </div>
      )}

      {popover && <AssignPopover fieldIds={popover.fieldIds} anchor={popover.anchor} purposes={view.approvedPurposes} onClose={() => setPopover(null)} onAssign={(pid) => doAssign(popover.fieldIds, pid)} />}
      {drawerRow && <FieldDrawer row={drawerRow} categories={categories} subjectTypes={subjectTypes}
        onClose={() => setDrawerId(null)}
        onAssign={(e) => openAssign([drawerRow.id], e, setPopover)}
        onRemove={(pid) => start(async () => { setAdded((a) => { const n = { ...a }; delete n[drawerRow.id]; return n; }); await removePurposeAction(drawerRow.id, pid); router.refresh(); })}
        onSetAttr={(attr, value) => start(async () => { await setFieldAttributeAction(drawerRow.id, attr, value); router.refresh(); })}
      />}
      {toast && <Toast msg={toast.msg} onUndo={toast.undo} onClose={() => setToast(null)} />}
    </div>
  );
}

function openAssign(fieldIds: string[], e: React.MouseEvent, setPopover: (p: { fieldIds: string[]; anchor: { top: number; left: number } }) => void, fromBulk = false) {
  const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
  setPopover({ fieldIds, anchor: { top: fromBulk ? b.top - 320 : b.bottom + 4, left: Math.max(8, Math.min(b.left, window.innerWidth - 360)) } });
}

// --- Sync line --------------------------------------------------------------
function SyncLine({ view, onSync }: { view: View; onSync: () => void }) {
  const s = view.sync;
  if (s.status === "failed") return <div className="inv-syncline danger"><AlertTriangle size={12} /> DLP sync failed{s.lastSyncedAgo ? ` ${s.lastSyncedAgo}` : ""}.{s.lastSyncedExact ? ` Showing data from ${s.lastSyncedExact}.` : ""} <button className="link-btn" onClick={onSync}>Try again</button> · <a href={DLP_URL} className="link-btn">Open in DLP</a></div>;
  if (s.status === "out_of_date") return <div className="inv-syncline warn"><Clock size={12} /> DLP data is out of date.{s.lastSyncedAgo ? ` Last sync ${s.lastSyncedAgo}.` : ""} <button className="link-btn" onClick={onSync}>Sync now</button></div>;
  return <div className="inv-syncline"><span title={s.lastSyncedExact ?? undefined}>Synced from DLP {s.lastSyncedAgo ?? "just now"} · {s.systems} systems</span> · <button className="link-btn" onClick={onSync}>Sync now</button></div>;
}

// --- Readiness bar ----------------------------------------------------------
function ReadinessBar({ counts, onPick }: { counts: { total: number; byStatus: Record<Readiness, number> }; onPick: (s: Readiness) => void }) {
  const segs = READINESS_ORDER.filter((s) => counts.byStatus[s] > 0);
  return (
    <div className="inv-readybar" role="group" aria-label="Readiness">
      {segs.map((s) => (
        <button key={s} className="inv-readyseg" style={{ flexGrow: counts.byStatus[s], background: READINESS_META[s].dot, minWidth: 4 }}
          aria-label={`${READINESS_META[s].label}, ${counts.byStatus[s]} fields`} title={`${READINESS_META[s].label}: ${counts.byStatus[s]}`} onClick={() => onPick(s)} />
      ))}
    </div>
  );
}

// --- Group block ------------------------------------------------------------
function GroupBlock({ g, grouping, open, onToggle, sel, setSel, onOpen, onAssign, onAssignSuggestion }: {
  g: GroupView & { rows: InventoryRow[] }; grouping: Grouping; open: boolean; onToggle: () => void;
  sel: Set<string>; setSel: React.Dispatch<React.SetStateAction<Set<string>>>; onOpen: (id: string) => void;
  onAssign: (ids: string[], e: React.MouseEvent) => void; onAssignSuggestion: (g: GroupView & { rows: InventoryRow[] }, e: React.MouseEvent) => void;
}) {
  const allSel = g.rows.length > 0 && g.rows.every((r) => sel.has(r.id));
  return (
    <div className="inv-group">
      <div className="inv-group-head">
        <button className="icon-btn" aria-expanded={open} onClick={onToggle}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
        <input type="checkbox" checked={allSel} aria-label={`Select all in ${g.name}`} onChange={(e) => setSel((s) => { const n = new Set(s); for (const r of g.rows) e.target.checked ? n.add(r.id) : n.delete(r.id); return n; })} />
        <div className="inv-group-name"><strong>{g.name}</strong> <span className="cell-sub"><span className="tnum">{g.fieldCount}</span> fields{g.newCount > 0 ? <span className="sev-accent"> · {g.newCount} new</span> : ""}</span></div>
        <div className="inv-group-mid">
          <MixBar mix={g.mix} />
          <span className="cell-sub">{g.gaps.length === 0 ? <span className="sev-success">Ready</span> : g.gaps.map((gg, i) => <span key={gg.status}>{i > 0 ? " · " : ""}<span className="tnum">{gg.count}</span> {gg.status === "cls" ? "need classification" : gg.status === "pur" ? "need a purpose" : gg.status === "link" ? "not linked to consent" : "out of date"}</span>)}</span>
        </div>
        {grouping === "system" && g.suggestion && (
          <div className="inv-group-sug">
            <span className="cell-sub">Suggested: {g.suggestion.purposeName} · {g.suggestion.confidence} confidence</span>
            <button className="btn ghost sm" onClick={(e) => onAssignSuggestion(g, e)}>Assign to {g.suggestion.fieldIds.length}</button>
          </div>
        )}
      </div>
      {open && (
        <table className="inv-table">
          <tbody>
            {g.rows.map((r) => <Row key={r.id} r={r} grouping={grouping} selected={sel.has(r.id)}
              onToggle={() => setSel((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })}
              onOpen={() => onOpen(r.id)} onAssign={(e) => onAssign([r.id], e)} />)}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FlatTable({ rows, sel, setSel, grouping, onOpen, onAssign }: { rows: InventoryRow[]; sel: Set<string>; setSel: React.Dispatch<React.SetStateAction<Set<string>>>; grouping: Grouping; onOpen: (id: string) => void; onAssign: (ids: string[], e: React.MouseEvent) => void }) {
  return (
    <table className="inv-table">
      <thead><tr><th className="inv-check"><input type="checkbox" aria-label="Select all" checked={sel.size > 0 && rows.every((r) => sel.has(r.id))} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th><th>Field</th><th>Sensitivity</th><th>Purposes</th><th>Status</th></tr></thead>
      <tbody>
        {rows.map((r) => <Row key={r.id} r={r} grouping={grouping} selected={sel.has(r.id)} onToggle={() => setSel((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} onOpen={() => onOpen(r.id)} onAssign={(e) => onAssign([r.id], e)} />)}
      </tbody>
    </table>
  );
}

// --- Row --------------------------------------------------------------------
function Row({ r, grouping, selected, onToggle, onOpen, onAssign }: { r: InventoryRow; grouping: Grouping; selected: boolean; onToggle: () => void; onOpen: () => void; onAssign: (e: React.MouseEvent) => void }) {
  const tone = SENS_TONE[r.sensitivity] ?? SENS_TONE["Not classified"];
  const meta = READINESS_META[r.status];
  return (
    <tr className={`inv-row${selected ? " sel" : ""}`} onClick={(e) => { if ((e.target as HTMLElement).closest("button,input,a")) return; onOpen(); }}>
      <td className="inv-check"><input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${r.fieldPath}`} /></td>
      <td>
        <div className="inv-field">
          <span className="mono inv-path">{r.fieldPath}{(r.isNew || r.isChanged) && <span className="inv-mark">{r.isChanged ? "Changed" : "New"}</span>}</span>
          <span className="cell-sub">{grouping === "system" ? r.dataType : `${r.system} · ${r.dataType}`}</span>
        </div>
      </td>
      <td><span className={`inv-sens ${tone.cls}`}><span className="dot" style={{ background: tone.dot }} />{r.sensitivity}</span></td>
      <td>{r.purposes.length === 0 ? <span className="cell-sub">—</span> : <span className="inv-purposes" title={r.purposes.map((p) => p.name).join(", ")}>{r.purposes[0].name}{r.purposes.length > 1 && <span className="cell-sub"> +{r.purposes.length - 1}</span>}</span>}</td>
      <td>
        <span className={`inv-status ${meta.cls}`}><span className="dot" style={{ background: meta.dot }} />{meta.label}</span>
        {meta.action && <span className="inv-rowaction">{meta.kind === "assign" ? <button className="link-btn" onClick={onAssign}>{meta.action}</button> : meta.kind === "classify" ? <a href={DLP_URL} className="link-btn">{meta.action}</a> : <button className="link-btn" onClick={onOpen}>{meta.action}</button>}</span>}
      </td>
    </tr>
  );
}

function MixBar({ mix }: { mix: { label: string; count: number }[] }) {
  const desc = mix.map((m) => `${m.count} ${m.label}`).join(", ");
  return <div className="inv-mixbar" role="img" aria-label={desc} title={desc}>{mix.map((m) => <span key={m.label} style={{ flexGrow: m.count, background: SENS_TONE[m.label]?.dot, minWidth: 3 }} />)}</div>;
}

function Select({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: Opt[] }) {
  return <select className="input sm inv-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}><option value="">{label}</option>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>;
}

function MoreFilters({ params, pushParams, categories, subjectTypes, purposes, systems, dataTypes }: { params: InventoryParams; pushParams: (p: Record<string, string | undefined>) => void; categories: Opt[]; subjectTypes: string[]; purposes: PurposeOption[]; systems: Opt[]; dataTypes: string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", c); return () => document.removeEventListener("mousedown", c); }, []);
  const n = [params.system, params.status, params.dataType, params.dataCategory, params.purpose, params.subject, params.provenance].filter(Boolean).length;
  return (
    <div className="inv-more" ref={ref}>
      <button className="btn ghost sm" onClick={() => setOpen((o) => !o)}><SlidersHorizontal size={13} /> More filters{n > 0 && <span className="tnum"> ({n})</span>} <ChevronDown size={13} /></button>
      {open && (
        <div className="inv-more-pop">
          <Select value={params.system ?? ""} onChange={(v) => pushParams({ system: v || undefined })} label="System" options={systems} />
          <Select value={params.status ?? ""} onChange={(v) => pushParams({ status: v || undefined })} label="Status" options={[{ id: "cls", name: "Needs classification" }, { id: "pur", name: "Needs a purpose" }, { id: "link", name: "Not linked to consent" }, { id: "old", name: "Out of date" }, { id: "ready", name: "Ready for ROPA" }]} />
          <Select value={params.dataType ?? ""} onChange={(v) => pushParams({ dataType: v || undefined })} label="Data type" options={dataTypes.map((t) => ({ id: t, name: t }))} />
          <Select value={params.dataCategory ?? ""} onChange={(v) => pushParams({ dataCategory: v || undefined })} label="Data category" options={categories} />
          <Select value={params.purpose ?? ""} onChange={(v) => pushParams({ purpose: v || undefined })} label="Purpose" options={purposes.map((p) => ({ id: p.id, name: p.name }))} />
          <Select value={params.subject ?? ""} onChange={(v) => pushParams({ subject: v || undefined })} label="Subject type" options={subjectTypes.map((s) => ({ id: s, name: s }))} />
          <Select value={params.provenance ?? ""} onChange={(v) => pushParams({ provenance: v || undefined })} label="Provenance" options={[{ id: "discovered", name: "Discovered" }, { id: "declared", name: "Declared" }, { id: "application", name: "Application" }]} />
        </div>
      )}
    </div>
  );
}

// --- Assign popover ---------------------------------------------------------
function AssignPopover({ fieldIds, anchor, purposes, onClose, onAssign }: { fieldIds: string[]; anchor: { top: number; left: number }; purposes: PurposeOption[]; onClose: () => void; onAssign: (purposeId: string) => void }) {
  const [m, setM] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<{ id: string; name: string; strong: boolean }[]>([]);
  const [top, setTop] = useState(Math.max(8, anchor.top));
  useEffect(() => { setM(true); const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }; document.addEventListener("mousedown", c); return () => document.removeEventListener("mousedown", c); }, [onClose]);
  useEffect(() => { if (fieldIds.length === 1) suggestPurposesAction(fieldIds[0]).then((r) => { setSuggested(r.suggestions); if (r.suggestions[0]) setSel(r.suggestions[0].id); }); }, [fieldIds]);
  useEffect(() => { if (m && ref.current) setTop(Math.max(8, Math.min(anchor.top, window.innerHeight - ref.current.offsetHeight - 8))); }, [m, anchor.top, suggested, sel, q]);
  if (!m) return null;
  const filtered = purposes.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  const chosen = sel ? purposes.find((p) => p.id === sel) : null;
  return createPortal(
    <div ref={ref} className="mp-pop inv-assign" style={{ position: "fixed", top, left: Math.max(8, anchor.left), width: 340 }}>
      <div className="mp-pop-head"><div className="stack" style={{ gap: 0 }}><strong>Assign purpose</strong><span className="cell-sub">{fieldIds.length} field{fieldIds.length === 1 ? "" : "s"}</span></div><button className="icon-btn" onClick={onClose}><X size={14} /></button></div>
      <div className="mp-pop-body">
        {purposes.length === 0 ? <p className="cell-sub" style={{ margin: 0 }}>No approved purposes yet. Ask your DPO.</p> : <>
          <div className="inv-search" style={{ marginBottom: 8 }}><Search size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search purposes" aria-label="Search purposes" /></div>
          {suggested.length > 0 && q === "" && (<div className="inv-sugg"><div className="cell-sub inv-sugg-h">Suggested</div>{suggested.map((s) => <button key={s.id} className={`inv-purpose-opt${sel === s.id ? " on" : ""}`} onClick={() => setSel(s.id)}><span>{s.name}</span><span className="cell-sub">Suggested{s.strong ? " · high confidence" : ""}</span></button>)}</div>)}
          <div className="inv-purpose-list">{filtered.map((p) => <button key={p.id} className={`inv-purpose-opt${sel === p.id ? " on" : ""}`} onClick={() => setSel(p.id)}>{p.name}</button>)}{filtered.length === 0 && <p className="cell-sub" style={{ margin: 0 }}>No matching purposes.</p>}</div>
          {chosen && (<div className="inv-inherit"><div className="cell-sub inv-sugg-h">What this field will inherit</div>
            <div className="row" style={{ justifyContent: "space-between" }}><span className="cell-sub">Retention</span><span>{chosen.retention ?? "—"}</span></div>
            <div className="row" style={{ justifyContent: "space-between" }}><span className="cell-sub">Processor</span><span>{chosen.processors.length ? chosen.processors.join(", ") : "—"}</span></div>
            <div className="row" style={{ justifyContent: "space-between" }}><span className="cell-sub">Consent</span><span className={chosen.consent === "not_linked" ? "sev-warning" : ""}>{chosen.consent === "linked" ? "Linked" : chosen.consent === "not_linked" ? "Not yet linked to an approved purpose" : "Not required"}</span></div>
          </div>)}
          <p className="cell-sub" style={{ margin: "8px 0 0" }}>Purposes waiting for DPO approval aren&rsquo;t listed.</p>
        </>}
      </div>
      {purposes.length > 0 && <div className="mp-pop-foot"><button className="btn ghost sm" onClick={onClose}>Cancel</button><button className="btn primary sm" disabled={!sel} onClick={() => sel && onAssign(sel)}>Assign</button></div>}
    </div>, document.body);
}

// --- Field drawer -----------------------------------------------------------
function FieldDrawer({ row, categories, subjectTypes, onClose, onAssign, onRemove, onSetAttr }: {
  row: InventoryRow; categories: Opt[]; subjectTypes: string[];
  onClose: () => void; onAssign: (e: React.MouseEvent) => void; onRemove: (purposeId: string) => void; onSetAttr: (attr: "dataCategoryId" | "dataSubjectType", value: string | null) => void;
}) {
  const meta = READINESS_META[row.status];
  return createPortal(
    <div className="mp-drawer-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="mp-drawer" role="dialog" aria-label={row.fieldPath}>
        <div className="mp-drawer-head">
          <div className="stack" style={{ gap: 2 }}><span className="mono inv-path">{row.fieldPath}</span><span className="cell-sub">{row.system}</span></div>
          <button className="icon-btn" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="mp-drawer-body stack" style={{ gap: 16 }}>
          <section>
            <div className="inv-sec-h">Managed in DLP</div>
            <KV k="System" v={row.system} /><KV k="Data type" v={row.dataType} />
            <KV k="Sensitivity" v={`${row.sensitivity}, from DLP`} /><KV k="Last scanned" v={row.lastScanned ?? "—"} />
            {row.provenance !== "discovered" && <KV k="Provenance" v={row.provenance === "declared" ? "Declared, not discovered" : "Unknown to DLP"} />}
            {row.isChanged && row.changeSummary && <div className="inv-changed"><AlertTriangle size={12} /> Changed since your last visit: {row.changeSummary}</div>}
            <a href={DLP_URL} className="row-link">Open in DLP</a>
          </section>
          <section>
            <div className="inv-sec-h">Added in Privacy Admin</div>
            <div className="stack" style={{ gap: 6 }}>
              <span className="cell-sub">Purposes</span>
              {row.purposes.length === 0 && <span className="cell-sub">None yet.</span>}
              {row.purposes.map((p) => <div key={p.id} className="inv-purpose-row"><span>{p.name}</span><button className="link-btn" onClick={() => onRemove(p.id)}>Remove</button></div>)}
              <div><button className="btn ghost sm" onClick={onAssign}>Assign purpose</button></div>
            </div>
            <label className="inv-kv-edit"><span className="cell-sub">Data category</span>
              <select className="input sm" value={categories.find((c) => c.name === row.dataCategory)?.id ?? ""} onChange={(e) => onSetAttr("dataCategoryId", e.target.value || null)}><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
            <label className="inv-kv-edit"><span className="cell-sub">Subject type</span>
              <select className="input sm" value={row.subjectType ?? ""} onChange={(e) => onSetAttr("dataSubjectType", e.target.value || null)}><option value="">—</option>{subjectTypes.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </label>
            <KV k="Retention" v={row.retention ?? "— (set by the purpose)"} />
            <KV k="Processor" v={row.processors.length ? row.processors.join(", ") : "—"} />
            <KV k="Used in" v={row.usedInCount > 0 ? `${row.usedInCount} processing ${row.usedInCount === 1 ? "activity" : "activities"}` : "—"} />
            <KV k="Masking" v={<>{row.maskingStatus} <Link href="/data-flow/masking-policy" className="row-link">Masking policy</Link></>} />
          </section>
          <section>
            <div className="inv-sec-h">Readiness</div>
            {row.status === "ready" ? <div className="inv-status sev-success"><Check size={13} /> Ready for ROPA</div> : (
              <ul className="inv-gaplist"><li>{meta.label}.{meta.action ? (meta.kind === "assign" ? <button className="link-btn" onClick={onAssign}> {meta.action}</button> : meta.kind === "classify" ? <a href={DLP_URL} className="link-btn"> {meta.action}</a> : <span> {meta.action}</span>) : ""}</li></ul>
            )}
          </section>
          <Link href={`/audit?search=${row.id}`} className="row-link">View history</Link>
        </div>
      </aside>
    </div>, document.body);
}

function KV({ k, v }: { k: string; v: React.ReactNode }) { return <div className="inv-kv"><span className="cell-sub">{k}</span><span>{v}</span></div>; }

function Toast({ msg, onUndo, onClose }: { msg: string; onUndo: (() => void) | null; onClose: () => void }) {
  return createPortal(<div className="inv-toast" role="status"><span>{msg}</span>{onUndo && <button className="link-btn" onClick={onUndo}>Undo</button>}<button className="icon-btn" onClick={onClose} aria-label="Dismiss"><X size={13} /></button></div>, document.body);
}
