"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Lock, CheckCircle2, Circle, X, ChevronDown, ChevronRight, SlidersHorizontal } from "lucide-react";
import type { DataCatalog as Data, CatalogRow } from "@/lib/engines/maskingpolicy";

const INV = "/discovery/inventory";
const SENS: Record<string, { word: string; dot: string; rank: number }> = {
  Restricted: { word: "Restricted", dot: "var(--red)", rank: 4 },
  Confidential: { word: "Confidential", dot: "var(--yellow-700, #b45309)", rank: 3 },
  Internal: { word: "Internal", dot: "var(--blue)", rank: 2 },
  Public: { word: "Public", dot: "var(--text-4, #94a3b8)", rank: 1 },
  "Not classified": { word: "Not classified", dot: "var(--border-strong, #c7ccd1)", rank: 0 },
};
const UNCLASSIFIED = { word: "Not classified", dot: "var(--border-strong, #c7ccd1)", rank: 0 };
const sensOf = (s: string) => SENS[s] ?? UNCLASSIFIED;
const SENS_ORDER = ["Restricted", "Confidential", "Internal", "Public", "Not classified"];

export function DataCatalog({ data }: { data: Data }) {
  const [q, setQ] = useState("");
  const [inPolicy, setInPolicy] = useState<"all" | "in_use" | "not_in_use">("all");
  const [sens, setSens] = useState("");
  const [cat, setCat] = useState("");
  const [more, setMore] = useState(false);
  const [app, setApp] = useState("");
  const [lawOnly, setLawOnly] = useState(false);
  const [diffOnly, setDiffOnly] = useState(false);
  const [showNotSeen, setShowNotSeen] = useState(false);
  const [groupBy, setGroupBy] = useState<"none" | "category" | "sensitivity">("none");
  const [sort, setSort] = useState<{ key: "field" | "sensitivity" | "policy"; dir: 1 | -1 } | null>(null);
  const [drawer, setDrawer] = useState<CatalogRow | null>(null);

  const categories = useMemo(() => [...new Map(data.rows.map((r) => [r.categoryId, r.categoryName])).entries()], [data.rows]);
  const apps = useMemo(() => [...new Set(data.rows.flatMap((r) => r.applications.map((a) => a.name)))], [data.rows]);

  let rows = data.rows.filter((r) => showNotSeen || r.seen);
  if (q.trim()) { const n = q.toLowerCase(); rows = rows.filter((r) => (r.displayName + r.code).toLowerCase().includes(n)); }
  if (inPolicy === "in_use") rows = rows.filter((r) => r.policy.status === "in_use");
  if (inPolicy === "not_in_use") rows = rows.filter((r) => r.policy.status === "not_decided" || r.policy.status === "not_used");
  if (sens) rows = rows.filter((r) => r.sensitivity === sens);
  if (cat) rows = rows.filter((r) => r.categoryId === cat);
  if (app) rows = rows.filter((r) => r.applications.some((a) => a.name === app));
  if (lawOnly) rows = rows.filter((r) => r.regulated);
  if (diffOnly) rows = rows.filter((r) => r.policy.differs);

  // default sort: not_decided first, sensitivity high→low, name
  rows = [...rows].sort((a, b) => {
    if (sort) {
      const m = sort.dir;
      if (sort.key === "field") return a.displayName.localeCompare(b.displayName) * m;
      if (sort.key === "sensitivity") return (sensOf(a.sensitivity).rank - sensOf(b.sensitivity).rank) * m;
      if (sort.key === "policy") return a.policy.status.localeCompare(b.policy.status) * m;
    }
    const un = (r: CatalogRow) => (r.policy.status === "not_decided" ? 0 : 1);
    return un(a) - un(b) || sensOf(b.sensitivity).rank - sensOf(a.sensitivity).rank || a.displayName.localeCompare(b.displayName);
  });

  const activeFilters: { label: string; clear: () => void }[] = [];
  if (sens) activeFilters.push({ label: sensOf(sens).word, clear: () => setSens("") });
  if (cat) activeFilters.push({ label: categories.find((c) => c[0] === cat)?.[1] ?? cat, clear: () => setCat("") });
  if (app) activeFilters.push({ label: app, clear: () => setApp("") });
  if (lawOnly) activeFilters.push({ label: "Protected by law", clear: () => setLawOnly(false) });
  if (diffOnly) activeFilters.push({ label: "Differs from recommended", clear: () => setDiffOnly(false) });
  const clearAll = () => { setSens(""); setCat(""); setApp(""); setLawOnly(false); setDiffOnly(false); setQ(""); setInPolicy("all"); };

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "", label: "", def: "", rows }];
    if (groupBy === "category") return categories.map(([id, name]) => ({ key: id, label: name, def: rows.find((r) => r.categoryId === id)?.categoryDef ?? "", rows: rows.filter((r) => r.categoryId === id) })).filter((g) => g.rows.length);
    return SENS_ORDER.map((s) => ({ key: s, label: sensOf(s).word, def: "", rows: rows.filter((r) => r.sensitivity === s) })).filter((g) => g.rows.length);
  }, [groupBy, rows, categories]);

  const sortBtn = (key: "field" | "sensitivity" | "policy", label: string) => (
    <button className="mp-sort" onClick={() => setSort((s) => s?.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 })} aria-sort={sort?.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      {label}{sort?.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
    </button>
  );

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row mask-filterbar" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div className="mask-search"><Search size={14} className="muted" /><input className="input" placeholder="Search by name or code" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="mp-segment">
          <button className={inPolicy === "all" ? "on" : ""} onClick={() => setInPolicy("all")}>All {data.counts.found}</button>
          <button className={inPolicy === "in_use" ? "on" : ""} onClick={() => setInPolicy("in_use")}>In use {data.counts.inUse}</button>
          <button className={inPolicy === "not_in_use" ? "on" : ""} onClick={() => setInPolicy("not_in_use")}>Not in use {data.counts.notDecided + data.counts.notUsed}</button>
        </div>
        <select className="input sm" value={sens} onChange={(e) => setSens(e.target.value)}><option value="">Sensitivity</option>{SENS_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select className="input sm" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Category</option>{categories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
        <select className="input sm" value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}><option value="none">Group by: None</option><option value="category">Group by: Category</option><option value="sensitivity">Group by: Sensitivity</option></select>
        <button className={`btn ghost sm${more ? " on" : ""}`} onClick={() => setMore((m) => !m)}><SlidersHorizontal size={13} /> More filters</button>
        <span className="cell-sub" style={{ marginLeft: "auto" }}>Showing {rows.length} of {data.counts.found}</span>
      </div>
      {more && (
        <div className="row mask-filterbar" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select className="input sm" value={app} onChange={(e) => setApp(e.target.value)}><option value="">Application</option>{apps.map((a) => <option key={a} value={a}>{a}</option>)}</select>
          <label className="mp-radio"><input type="checkbox" checked={lawOnly} onChange={(e) => setLawOnly(e.target.checked)} /> Protected by law only</label>
          <label className="mp-radio"><input type="checkbox" checked={diffOnly} onChange={(e) => setDiffOnly(e.target.checked)} /> Differs from recommended only</label>
          {data.counts.notSeen > 0 && <label className="mp-radio"><input type="checkbox" checked={showNotSeen} onChange={(e) => setShowNotSeen(e.target.checked)} /> Show platform fields not seen yet ({data.counts.notSeen})</label>}
        </div>
      )}
      {activeFilters.length > 0 && <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>{activeFilters.map((f, i) => <button key={i} className="filter-chip" onClick={f.clear}>{f.label} <X size={11} /></button>)}<button className="link-btn" onClick={clearAll}>Clear</button></div>}

      <div className="table-wrap"><table className="dtable compact mp-catalog">
        <thead><tr><th>{sortBtn("field", "Field")}</th><th>{sortBtn("sensitivity", "Sensitivity")}</th><th>Recommended masking</th><th>{sortBtn("policy", "In active policy")}</th><th /></tr></thead>
        <tbody>
          {groups.map((g) => (
            <GroupRows key={g.key || "all"} g={g} grouped={groupBy !== "none"} onOpen={setDrawer} />
          ))}
          {rows.length === 0 && <tr><td colSpan={5}><div className="stack" style={{ gap: 6, padding: 10 }}><span className="cell-sub">No fields match these filters.</span><button className="link-btn" style={{ alignSelf: "flex-start" }} onClick={clearAll}>Clear filters</button></div></td></tr>}
        </tbody>
      </table></div>
      <p className="cell-sub" style={{ margin: 0 }}>Recommendations come from platform catalog version 1. Examples use made-up values.</p>

      {drawer && <CatalogDrawer row={drawer} onClose={() => setDrawer(null)} />}
    </div>
  );
}

function GroupRows({ g, grouped, onOpen }: { g: { key: string; label: string; def: string; rows: CatalogRow[] }; grouped: boolean; onOpen: (r: CatalogRow) => void }) {
  const [open, setOpen] = useState(true);
  const inUse = g.rows.filter((r) => r.policy.status === "in_use").length;
  return (
    <>
      {grouped && <tr className="mp-cat-row"><td colSpan={5}><button className="mp-catgroup-head" onClick={() => setOpen((o) => !o)}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<strong>{g.label}</strong><span className="cell-sub">{g.rows.length} fields · {inUse} in use{g.def ? ` · ${g.def}` : ""}</span></button></td></tr>}
      {(!grouped || open) && g.rows.map((r) => <Row key={r.code} r={r} onOpen={onOpen} />)}
    </>
  );
}

function Row({ r, onOpen }: { r: CatalogRow; onOpen: (r: CatalogRow) => void }) {
  const s = sensOf(r.sensitivity);
  return (
    <tr className="rules-row" onClick={(e) => { if ((e.target as HTMLElement).closest("a,button")) return; onOpen(r); }} style={{ cursor: "pointer" }}>
      <td><div className="cell-stack"><span className="cell-primary">{r.displayName}{!r.seen && <span className="mp-tag" style={{ marginLeft: 6 }}>Not seen yet</span>}</span><span className="cell-sub mono">{r.code}</span></div></td>
      <td>
        <div className="cell-stack">
          <span className="row" style={{ gap: 6, alignItems: "center" }}><span className="sens-dot" style={{ background: s.dot }} />{s.word}{(r.sensitivity === "Not classified" || !SENS[r.sensitivity]) && <Link href={`${INV}?field=${r.code}`} className="row-link" onClick={(e) => e.stopPropagation()}>Classify</Link>}</span>
          {r.regulated && <span className="row cell-sub" style={{ gap: 4 }}><Lock size={10} /> Protected by law</span>}
        </div>
      </td>
      <td>
        <div className="cell-stack">
          <span>{r.recommendation.label}{r.recommendation.basis === "legal_minimum" && <span className="mp-tag" style={{ marginLeft: 6 }}>Legal minimum</span>}{r.recommendation.basis === "suggested" && <span className="mp-tag" style={{ marginLeft: 6 }}>Suggested</span>}</span>
          <span className="mono cell-sub">{r.recommendation.example}{r.recommendation.basis === "none" ? " · Not classified" : ""}</span>
        </div>
      </td>
      <td>
        <div className="cell-stack">
          <span className="row" style={{ gap: 6, alignItems: "center" }}>{r.policy.status === "in_use" ? <CheckCircle2 size={13} style={{ color: "var(--green)" }} /> : <Circle size={13} className="muted" />}{r.policy.status === "in_use" ? "In use" : "Not in use"}</span>
          <span className="cell-sub">{r.policy.status === "in_use" ? (r.policy.differs ? `Policy uses ${r.policy.words}. Differs from recommended.` : r.policy.words) : r.policy.words}</span>
        </div>
      </td>
      <td>{r.actionVerb && r.actionHref && <Link href={r.actionHref} className="row-link" onClick={(e) => e.stopPropagation()}>{r.actionVerb}</Link>}</td>
    </tr>
  );
}

function CatalogDrawer({ row, onClose }: { row: CatalogRow; onClose: () => void }) {
  const s = sensOf(row.sensitivity);
  return (
    <>
      <div className="mp-drawer-scrim" onClick={onClose}>
        <aside className="mp-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={row.displayName}>
          <div className="mp-drawer-head"><div className="stack" style={{ gap: 2 }}><strong>{row.displayName}</strong><span className="cell-sub mono">{row.code}</span></div><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
          <div className="mp-drawer-body"><div className="stack" style={{ gap: 16 }}>
            <section className="stack" style={{ gap: 4 }}>
              <h4 className="mp-card-h">Sensitivity</h4>
              <span className="row" style={{ gap: 6, alignItems: "center" }}><span className="sens-dot" style={{ background: s.dot }} /> {s.word}</span>
              <span className="cell-sub">Set in Data inventory · <Link href={`${INV}?field=${row.code}`} className="row-link">Open in Data inventory</Link></span>
              {row.regulated && <span className="cell-sub">Protected by law. It can be masked to the legal minimum or hidden completely, never shown in full.</span>}
            </section>
            <section className="stack" style={{ gap: 4 }}><h4 className="mp-card-h">Category</h4><strong>{row.categoryName}</strong><span className="cell-sub">{row.categoryDef}</span></section>
            <section className="stack" style={{ gap: 4 }}>
              <h4 className="mp-card-h">Recommended masking</h4>
              <span>{row.recommendation.label}</span>
              <span className="mono cell-sub">{row.recommendation.example}</span>
              <span className="cell-sub">{row.recommendation.basisText}</span>
            </section>
            <section className="stack" style={{ gap: 4 }}>
              <h4 className="mp-card-h">In active policy</h4>
              {row.policy.status === "in_use" ? (
                row.policy.differs ? (
                  <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
                    <div className="stack" style={{ gap: 1 }}><span className="cell-sub">Recommended</span><span className="mono">{row.policy.recExample}</span></div>
                    <div className="stack" style={{ gap: 1 }}><span className="cell-sub">In version {row.policy.version}</span><span className="mono">{row.policy.example}</span></div>
                  </div>
                ) : <span>In use · <span className="mono">{row.policy.example}</span></span>
              ) : <span className="cell-sub">{row.policy.words}</span>}
            </section>
            <section className="stack" style={{ gap: 4 }}>
              <h4 className="mp-card-h">Seen in your applications</h4>
              {row.applications.length === 0 ? <span className="cell-sub">Not seen in your applications yet.</span> : row.applications.map((a) => <span key={a.name} className="cell-sub">{a.name} · first seen {a.firstSeen} · last seen {a.lastSeen}</span>)}
            </section>
            {row.actionVerb && row.actionHref && <div><Link href={row.actionHref} className="btn">{row.actionVerb}</Link></div>}
          </div></div>
        </aside>
      </div>
    </>
  );
}
