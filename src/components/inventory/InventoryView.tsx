"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, X, ExternalLink, Download, ChevronDown, Check, AlertTriangle, Clock, SlidersHorizontal,
} from "lucide-react";
import {
  SENS_TONE, GAP_META, topGap,
  type InventoryView as View, type InventoryRow, type GapType, type Segment, type PurposeOption,
} from "@/lib/inventory";
import { MovedNote } from "@/components/MovedNote";
import { assignPurposeAction, removePurposeAction, setFieldAttributeAction, suggestPurposesAction, syncNowAction } from "@/app/actions/inventory";
import type { InventoryParams } from "@/lib/engines/inventory";

type Opt = { id: string; name: string };
const DLP_URL = "#"; // external DLP console; link out, never embed.

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
  // Optimistic: purposes added client-side (fieldId → purpose refs) + rows resolved out of "attention".
  const [added, setAdded] = useState<Record<string, PurposeOption[]>>({});
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [qLocal, setQLocal] = useState(params.q ?? "");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const segment: Segment = params.segment ?? (view.counts.attention > 0 ? "attention" : "all");

  // Reset optimistic state whenever fresh server data arrives.
  useEffect(() => { setAdded({}); setResolved(new Set()); }, [view]);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // ---- URL-driven controls -------------------------------------------------
  const pushParams = (patch: Partial<InventoryParams> & { [k: string]: string | undefined }) => {
    const sp = new URLSearchParams();
    const merged: Record<string, string | undefined> = { ...params, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    start(() => router.push(`/discovery/inventory${sp.toString() ? `?${sp}` : ""}`));
  };
  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => { if ((params.q ?? "") !== qLocal) pushParams({ q: qLocal || undefined }); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLocal]);

  // ---- Rows with optimistic overlay ---------------------------------------
  const rows = useMemo(() => view.rows.map((r) => {
    const extra = added[r.id] ?? [];
    if (!extra.length) return r;
    const purposes = [...r.purposes, ...extra.map((p) => ({ id: p.id, name: p.name }))];
    const gaps = r.gaps.filter((g) => g !== "no_purpose");
    return { ...r, purposes, gaps };
  }), [view.rows, added]);

  // ---- Optimistic header numbers ------------------------------------------
  const withPurposeBase = Math.round((view.coveragePct / 100) * view.personalTotal);
  const assignedNew = Object.keys(added).filter((id) => view.rows.find((r) => r.id === id && r.purposes.length === 0)).length;
  const coveragePct = view.personalTotal ? Math.round(((withPurposeBase + assignedNew) / view.personalTotal) * 100) : 100;
  const attentionResolvedN = [...resolved].filter((id) => { const r = view.rows.find((x) => x.id === id); return r && r.gaps.length === 1 && r.gaps[0] === "no_purpose"; }).length;
  const attentionCount = Math.max(0, view.counts.attention - attentionResolvedN);
  const noPurposeTally = Math.max(0, (view.level1.parts.find((p) => p.label === "need a purpose")?.count ?? 0) - assignedNew);

  // ---- Assign flow ---------------------------------------------------------
  const purposeById = useMemo(() => new Map(view.approvedPurposes.map((p) => [p.id, p])), [view.approvedPurposes]);

  const doAssign = (fieldIds: string[], purposeId: string) => {
    const purpose = purposeById.get(purposeId); if (!purpose) return;
    // Optimistic
    setAdded((a) => { const n = { ...a }; for (const id of fieldIds) if (!(n[id] ?? []).some((p) => p.id === purposeId) && !view.rows.find((r) => r.id === id)?.purposes.some((p) => p.id === purposeId)) n[id] = [...(n[id] ?? []), purpose]; return n; });
    if (segment === "attention") setResolved((s) => { const n = new Set(s); for (const id of fieldIds) { const r = view.rows.find((x) => x.id === id); if (r && r.gaps.length === 1 && r.gaps[0] === "no_purpose") n.add(id); } return n; });
    setPopover(null);
    const stillNeed = Math.max(0, noPurposeTally - fieldIds.filter((id) => view.rows.find((r) => r.id === id)?.purposes.length === 0).length);
    setLive(`Purpose assigned. ${stillNeed} field${stillNeed === 1 ? "" : "s"} still need a purpose.`);
    start(async () => {
      const r = await assignPurposeAction(fieldIds, purposeId);
      if (!r.ok) { setToast({ msg: r.error ?? "Couldn’t assign.", undo: null }); setAdded({}); setResolved(new Set()); router.refresh(); return; }
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

  // ---- Active filter chips -------------------------------------------------
  const chips: { label: string; clear: () => void }[] = [];
  if (params.system) chips.push({ label: params.system, clear: () => pushParams({ system: undefined }) });
  if (params.sensitivity) chips.push({ label: params.sensitivity, clear: () => pushParams({ sensitivity: undefined }) });
  if (params.status) chips.push({ label: GAP_META[params.status as GapType]?.text ?? params.status, clear: () => pushParams({ status: undefined }) });
  if (params.dataType) chips.push({ label: params.dataType, clear: () => pushParams({ dataType: undefined }) });
  if (params.dataCategory) chips.push({ label: params.dataCategory, clear: () => pushParams({ dataCategory: undefined }) });
  if (params.purpose) chips.push({ label: purposeById.get(params.purpose)?.name ?? "Purpose", clear: () => pushParams({ purpose: undefined }) });
  if (params.subject) chips.push({ label: params.subject, clear: () => pushParams({ subject: undefined }) });
  if (params.provenance) chips.push({ label: params.provenance, clear: () => pushParams({ provenance: undefined }) });

  const drawerRow = drawerId ? rows.find((r) => r.id === drawerId) ?? null : null;

  // ---- Not connected -------------------------------------------------------
  if (view.notConnected) {
    return (
      <div className="inv-empty">
        <h2>Connect your DLP to see your data.</h2>
        <p className="cell-sub">Discovery, classification and scanning happen in the DLP. Connect it to populate the inventory.</p>
        <div className="row" style={{ gap: 10, justifyContent: "center", marginTop: 8 }}>
          <Link href="/integrations/dlp" className="btn primary">Connect DLP</Link>
          <Link href="/integrations/dlp" className="btn ghost">Add a declared system</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="inv">
      <div aria-live="polite" className="sr-only">{live}</div>

      {/* Header */}
      <div className="inv-head">
        <h1 className="inv-title">Data inventory</h1>
        <div className="row" style={{ gap: 14 }}>
          <a href={DLP_URL} className="row-link" aria-label="Open in DLP (external)">Open in DLP <ExternalLink size={13} /></a>
          <a href="/api/discovery/export" className="row-link">Export <Download size={13} /></a>
        </div>
      </div>

      <MovedNote moved={moved} />

      {/* Level 1 sentence + coverage */}
      <p className="inv-sentence">
        <span className="tnum">{view.personalTotal}</span> personal-data fields from DLP.{" "}
        {view.level1.everyHasPurpose ? "Every one has a purpose."
          : (() => { const parts = view.level1.parts.map((p) => p.label === "need a purpose" ? { ...p, count: noPurposeTally } : p).filter((p) => p.count > 0);
              const totalAttn = attentionCount;
              if (parts.length === 0) return "Every one has a purpose.";
              const shown = parts.slice(0, 3);
              const more = parts.length - shown.length;
              return <>{" "}<span className="tnum">{totalAttn}</span> need attention: {shown.map((p, i) => <span key={p.label}>{i > 0 ? ", " : ""}<span className="tnum">{p.count}</span> {p.label}</span>)}{more > 0 ? `, +${more} more` : ""}.</>;
            })()}
      </p>
      <div className="inv-coverage">
        <span className="cell-sub">Purpose coverage <span className="tnum">{coveragePct}%</span></span>
        <div className="inv-bar" role="progressbar" aria-valuenow={coveragePct} aria-valuemin={0} aria-valuemax={100} aria-label="Purpose coverage">
          <div className="inv-bar-fill" style={{ width: `${coveragePct}%` }} />
        </div>
      </div>

      {/* Sync strip */}
      <SyncStrip view={view} onSync={() => start(async () => { await syncNowAction(); router.refresh(); })} />

      {/* Controls */}
      <div className="inv-controls">
        <div className="mp-segment">
          {(["attention", "new", "all"] as Segment[]).map((s) => (
            <button key={s} className={segment === s ? "on" : ""} onClick={() => pushParams({ segment: s })}>
              {s === "attention" ? "Needs attention" : s === "new" ? "New" : "All"} <span className="tnum">{s === "attention" ? attentionCount : s === "new" ? view.counts.new : view.counts.all}</span>
            </button>
          ))}
        </div>
        <div className="inv-search">
          <Search size={14} />
          <input value={qLocal} onChange={(e) => setQLocal(e.target.value)} placeholder="Search name, path, system" aria-label="Search" />
          {qLocal && <button className="icon-btn" onClick={() => setQLocal("")} aria-label="Clear search"><X size={13} /></button>}
        </div>
        <Select value={params.system ?? ""} onChange={(v) => pushParams({ system: v || undefined })} label="System" options={view.systems.map((s) => ({ id: s.id, name: s.name }))} />
        <Select value={params.sensitivity ?? ""} onChange={(v) => pushParams({ sensitivity: v || undefined })} label="Sensitivity" options={["Restricted", "Confidential", "Internal", "Public", "Not classified"].map((s) => ({ id: s, name: s }))} />
        <MoreFilters params={params} pushParams={pushParams} categories={categories} subjectTypes={subjectTypes} purposes={view.approvedPurposes} />
      </div>

      {(chips.length > 0) && (
        <div className="inv-chips">
          {chips.map((c, i) => <button key={i} className="chip" onClick={c.clear}>{c.label} <X size={11} /></button>)}
          <button className="link-btn" onClick={() => start(() => router.push("/discovery/inventory"))}>Clear</button>
          <span className="cell-sub" style={{ marginLeft: "auto" }}>Showing <span className="tnum">{rows.length}</span> of <span className="tnum">{view.personalTotal}</span></span>
        </div>
      )}
      {chips.length === 0 && <div className="inv-chips"><span className="cell-sub" style={{ marginLeft: "auto" }}>Showing <span className="tnum">{rows.length}</span> of <span className="tnum">{view.personalTotal}</span></span></div>}

      {/* Table */}
      {rows.length === 0 ? (
        <div className="inv-noresult">No fields match these filters. <button className="link-btn" onClick={() => start(() => router.push("/discovery/inventory"))}>Clear filters</button></div>
      ) : (
        <table className="inv-table">
          <thead>
            <tr>
              <th className="inv-check"><input type="checkbox" aria-label="Select all" checked={sel.size > 0 && rows.every((r) => sel.has(r.id))} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
              <th>Field</th><th>Sensitivity</th><th>Purposes</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row key={r.id} r={r} selected={sel.has(r.id)} resolving={resolved.has(r.id)}
                onToggle={() => setSel((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })}
                onOpen={() => setDrawerId(r.id)}
                onAssign={(e) => { const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); setPopover({ fieldIds: [r.id], anchor: { top: b.bottom + 4, left: Math.min(b.left, window.innerWidth - 380) } }); }}
              />
            ))}
          </tbody>
        </table>
      )}

      {/* Bulk bar */}
      {sel.size > 0 && (
        <div className="inv-bulkbar">
          <span><span className="tnum">{sel.size}</span> selected</span>
          <div className="row" style={{ gap: 10, marginLeft: "auto" }}>
            <button className="btn primary sm" onClick={(e) => { const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); setPopover({ fieldIds: [...sel], anchor: { top: b.bottom - 320, left: b.left - 300 } }); }}>Assign purpose</button>
            <button className="btn ghost sm" onClick={() => setSel(new Set())}>Clear</button>
          </div>
        </div>
      )}

      {popover && <AssignPopover fieldIds={popover.fieldIds} anchor={popover.anchor} purposes={view.approvedPurposes} onClose={() => setPopover(null)} onAssign={(pid) => doAssign(popover.fieldIds, pid)} />}
      {drawerRow && <FieldDrawer row={drawerRow} categories={categories} subjectTypes={subjectTypes} purposes={view.approvedPurposes}
        onClose={() => setDrawerId(null)}
        onAssign={(e) => { const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); setPopover({ fieldIds: [drawerRow.id], anchor: { top: b.bottom + 4, left: Math.min(b.left, window.innerWidth - 380) } }); }}
        onRemove={(pid) => start(async () => { setAdded((a) => { const n = { ...a }; if (n[drawerRow.id]) n[drawerRow.id] = n[drawerRow.id].filter((p) => p.id !== pid); return n; }); await removePurposeAction(drawerRow.id, pid); router.refresh(); })}
        onSetAttr={(attr, value) => start(async () => { await setFieldAttributeAction(drawerRow.id, attr, value); router.refresh(); })}
      />}

      {toast && <Toast msg={toast.msg} onUndo={toast.undo} onClose={() => setToast(null)} />}
    </div>
  );
}

// --- Sync strip -------------------------------------------------------------
function SyncStrip({ view, onSync }: { view: View; onSync: () => void }) {
  const s = view.sync;
  if (s.status === "failed") return <div className="inv-sync danger"><AlertTriangle size={13} /> <span>{s.warnText ?? "DLP sync failed"}.{s.lastSyncedExact ? ` Showing data from ${s.lastSyncedExact}.` : ""}</span><div className="row" style={{ gap: 12, marginLeft: "auto" }}><button className="link-btn" onClick={onSync}>Try again</button><a href={DLP_URL} className="link-btn">Open in DLP</a></div></div>;
  if (s.status === "out_of_date") return <div className="inv-sync warn"><Clock size={13} /> <span>DLP data is out of date.{s.lastSyncedAgo ? ` Last sync ${s.lastSyncedAgo}.` : ""}</span><button className="link-btn" style={{ marginLeft: "auto" }} onClick={onSync}>Sync now</button></div>;
  return <div className="inv-sync"><span title={s.lastSyncedExact ?? undefined}>Synced from DLP {s.lastSyncedAgo ?? "just now"} · {s.systems} systems</span><button className="link-btn" style={{ marginLeft: "auto" }} onClick={onSync}>Sync now</button></div>;
}

// --- Row --------------------------------------------------------------------
function Row({ r, selected, resolving, onToggle, onOpen, onAssign }: { r: InventoryRow; selected: boolean; resolving: boolean; onToggle: () => void; onOpen: () => void; onAssign: (e: React.MouseEvent) => void }) {
  const tone = SENS_TONE[r.sensitivity] ?? SENS_TONE["Not classified"];
  const gap = topGap(r.gaps);
  const meta = gap ? GAP_META[gap] : null;
  const extraGaps = r.gaps.length - (gap ? 1 : 0);
  return (
    <tr className={`inv-row${resolving ? " resolving" : ""}${r.isNew || r.isChanged ? " marked" : ""}`} onClick={(e) => { if ((e.target as HTMLElement).closest("button,input,a")) return; onOpen(); }}>
      <td className="inv-check"><input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${r.fieldPath}`} /></td>
      <td>
        <div className="inv-field">
          <span className="mono inv-path">{r.fieldPath}{(r.isNew || r.isChanged) && <span className="inv-mark">{r.isChanged ? "Changed" : "New"}</span>}</span>
          <span className="cell-sub">{r.system} · {r.dataType}</span>
        </div>
      </td>
      <td><span className={`inv-sens ${tone.cls}`}><span className="dot" style={{ background: tone.dot }} />{r.sensitivity}</span></td>
      <td>{r.purposes.length === 0 ? <span className="cell-sub">—</span> : <span className="inv-purposes" title={r.purposes.map((p) => p.name).join(", ")}>{r.purposes[0].name}{r.purposes.length > 1 && <span className="cell-sub"> +{r.purposes.length - 1}</span>}</span>}</td>
      <td>
        {!meta ? <span className="inv-status ok"><Check size={13} /> Complete</span> : (
          <span className="inv-status">
            <span className="dot" style={{ background: gap === "out_of_date" ? "var(--text-4,#94a3b8)" : "var(--yellow-700,#b45309)" }} />
            <span>{meta.text}{extraGaps > 0 && <span className="cell-sub"> +{extraGaps}</span>}</span>
            {meta.action && (meta.kind === "assign"
              ? <button className="link-btn" onClick={onAssign}>{meta.action}</button>
              : meta.kind === "dlp"
              ? <a href={DLP_URL} className="link-btn">{meta.action}</a>
              : <button className="link-btn" onClick={onOpen}>{meta.action}</button>)}
          </span>
        )}
      </td>
    </tr>
  );
}

// --- Select -----------------------------------------------------------------
function Select({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: Opt[] }) {
  return (
    <select className="input sm inv-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{label}</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}

// --- More filters -----------------------------------------------------------
function MoreFilters({ params, pushParams, categories, subjectTypes, purposes }: { params: InventoryParams; pushParams: (p: Record<string, string | undefined>) => void; categories: Opt[]; subjectTypes: string[]; purposes: PurposeOption[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", c); return () => document.removeEventListener("mousedown", c); }, []);
  const n = [params.status, params.dataType, params.dataCategory, params.purpose, params.subject, params.provenance].filter(Boolean).length;
  return (
    <div className="inv-more" ref={ref}>
      <button className="btn ghost sm" onClick={() => setOpen((o) => !o)}><SlidersHorizontal size={13} /> More filters{n > 0 && <span className="tnum"> ({n})</span>} <ChevronDown size={13} /></button>
      {open && (
        <div className="inv-more-pop">
          <Select value={params.status ?? ""} onChange={(v) => pushParams({ status: v || undefined })} label="Status" options={[{ id: "no_purpose", name: "Needs a purpose" }, { id: "not_classified", name: "Needs classification" }, { id: "purpose_not_linked_to_consent", name: "Not linked to consent" }, { id: "no_retention", name: "No retention" }, { id: "unknown_to_dlp", name: "Unknown to DLP" }, { id: "out_of_date", name: "Out of date" }, { id: "complete", name: "Complete" }]} />
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
  useEffect(() => { setM(true); const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }; document.addEventListener("mousedown", c); return () => document.removeEventListener("mousedown", c); }, [onClose]);
  useEffect(() => { if (fieldIds.length === 1) suggestPurposesAction(fieldIds[0]).then((r) => { setSuggested(r.suggestions); if (r.suggestions[0]) setSel(r.suggestions[0].id); }); }, [fieldIds]);
  if (!m) return null;

  const filtered = purposes.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  const chosen = sel ? purposes.find((p) => p.id === sel) : null;

  return createPortal(
    <div ref={ref} className="mp-pop inv-assign" style={{ position: "fixed", top: Math.max(8, anchor.top), left: Math.max(8, anchor.left), width: 340 }}>
      <div className="mp-pop-head"><strong>Assign purpose</strong><button className="icon-btn" onClick={onClose}><X size={14} /></button></div>
      <div className="mp-pop-body">
        {purposes.length === 0 ? (
          <p className="cell-sub" style={{ margin: 0 }}>No approved purposes yet. Ask your DPO.</p>
        ) : <>
          <div className="inv-search" style={{ marginBottom: 8 }}><Search size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search purposes" aria-label="Search purposes" /></div>
          {suggested.length > 0 && q === "" && (
            <div className="inv-sugg">
              <div className="cell-sub inv-sugg-h">Suggested</div>
              {suggested.map((s) => <button key={s.id} className={`inv-purpose-opt${sel === s.id ? " on" : ""}`} onClick={() => setSel(s.id)}><span>{s.name}</span><span className="cell-sub">Suggested{s.strong ? " · high confidence" : ""}</span></button>)}
            </div>
          )}
          <div className="inv-purpose-list">
            {filtered.map((p) => <button key={p.id} className={`inv-purpose-opt${sel === p.id ? " on" : ""}`} onClick={() => setSel(p.id)}>{p.name}</button>)}
            {filtered.length === 0 && <p className="cell-sub" style={{ margin: 0 }}>No matching purposes.</p>}
          </div>
          {chosen && (
            <div className="inv-inherit">
              <div className="cell-sub inv-sugg-h">What this field will inherit</div>
              <div className="row" style={{ justifyContent: "space-between" }}><span className="cell-sub">Retention</span><span>{chosen.retention ?? "—"}</span></div>
              <div className="row" style={{ justifyContent: "space-between" }}><span className="cell-sub">Processor</span><span>{chosen.processors.length ? chosen.processors.join(", ") : "—"}</span></div>
              <div className="row" style={{ justifyContent: "space-between" }}><span className="cell-sub">Consent</span><span className={chosen.consent === "not_linked" ? "sev-warning" : ""}>{chosen.consent === "linked" ? "Linked" : chosen.consent === "not_linked" ? "Not yet linked to an approved purpose" : "Not required"}</span></div>
            </div>
          )}
          <p className="cell-sub" style={{ margin: "8px 0 0" }}>Purposes waiting for DPO approval aren&rsquo;t listed.</p>
        </>}
      </div>
      {purposes.length > 0 && (
        <div className="mp-pop-foot"><button className="btn ghost sm" onClick={onClose}>Cancel</button><button className="btn primary sm" disabled={!sel} onClick={() => sel && onAssign(sel)}>Assign</button></div>
      )}
    </div>, document.body);
}

// --- Field drawer -----------------------------------------------------------
function FieldDrawer({ row, categories, subjectTypes, onClose, onAssign, onRemove, onSetAttr }: {
  row: InventoryRow; categories: Opt[]; subjectTypes: string[]; purposes: PurposeOption[];
  onClose: () => void; onAssign: (e: React.MouseEvent) => void; onRemove: (purposeId: string) => void; onSetAttr: (attr: "dataCategoryId" | "dataSubjectType", value: string | null) => void;
}) {
  return createPortal(
    <div className="mp-drawer-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="mp-drawer" role="dialog" aria-label={row.fieldPath}>
        <div className="mp-drawer-head">
          <div className="stack" style={{ gap: 2 }}><span className="mono inv-path">{row.fieldPath}</span><span className="cell-sub">{row.system}</span></div>
          <div className="row" style={{ gap: 8 }}><a href={DLP_URL} className="row-link">Open in DLP</a><button className="icon-btn" onClick={onClose}><X size={15} /></button></div>
        </div>

        <div className="mp-drawer-body stack" style={{ gap: 16 }}>
          <section>
            <div className="inv-sec-h">From DLP <span className="cell-sub">· Managed in DLP</span></div>
            <KV k="System" v={row.system} />
            <KV k="Location" v={row.location} />
            <KV k="Data type" v={row.dataType} />
            <KV k="Sensitivity" v={`${row.sensitivity}, from DLP`} />
            <KV k="Last scanned" v={row.lastScanned ?? "—"} />
            {row.isChanged && row.changeSummary && <div className="inv-changed"><AlertTriangle size={12} /> Changed since your last visit: {row.changeSummary}</div>}
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
              <select className="input sm" value={categories.find((c) => c.name === row.dataCategory)?.id ?? ""} onChange={(e) => onSetAttr("dataCategoryId", e.target.value || null)}>
                <option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="inv-kv-edit"><span className="cell-sub">Subject type</span>
              <select className="input sm" value={row.subjectType ?? ""} onChange={(e) => onSetAttr("dataSubjectType", e.target.value || null)}>
                <option value="">—</option>{subjectTypes.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <KV k="Retention" v={row.retention ?? "— (set by the purpose)"} />
            <KV k="Processor" v={row.processors.length ? row.processors.join(", ") : "—"} />
            <KV k="Masking" v={<>{row.maskingStatus} <Link href="/data-flow/masking-policy" className="row-link">Masking policy</Link></>} />
          </section>

          {row.gaps.length > 0 && (
            <section>
              <div className="inv-sec-h">Gaps</div>
              <ul className="inv-gaplist">
                {row.gaps.map((g) => <li key={g}>{GAP_META[g].text}.{GAP_META[g].action ? (GAP_META[g].kind === "assign" ? <button className="link-btn" onClick={onAssign}> {GAP_META[g].action}</button> : GAP_META[g].kind === "dlp" ? <a href={DLP_URL} className="link-btn"> {GAP_META[g].action}</a> : <span> {GAP_META[g].action}</span>) : ""}</li>)}
              </ul>
            </section>
          )}

          <Link href={`/audit?search=${row.id}`} className="row-link">View history</Link>
        </div>
      </aside>
    </div>, document.body);
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="inv-kv"><span className="cell-sub">{k}</span><span>{v}</span></div>;
}

// --- Toast ------------------------------------------------------------------
function Toast({ msg, onUndo, onClose }: { msg: string; onUndo: (() => void) | null; onClose: () => void }) {
  return createPortal(
    <div className="inv-toast" role="status">
      <span>{msg}</span>
      {onUndo && <button className="link-btn" onClick={() => { onUndo(); }}>Undo</button>}
      <button className="icon-btn" onClick={onClose} aria-label="Dismiss"><X size={13} /></button>
    </div>, document.body);
}
