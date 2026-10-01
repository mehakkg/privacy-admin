"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import { FAMILIES, SENSITIVITIES } from "@/lib/masking";

type Params = Record<string, string | undefined>;

const CHANNEL_OPTS = ["API", "Web", "Portal", "Logs"];
const ROLE_OPTS = ["Admin", "Support", "Analyst", "Security", "HR"];

/**
 * Rules-table filter bar: compact search + the primary filters inline (Owned by ·
 * Status · Channel · Role), with Governed by, Sensitivity and Rule family behind
 * "More filters". A right-aligned "N of M rules" count mirrors the reference.
 * Status defaults to the gap-first landing (Needs attention).
 */
export function PolicyFilters({ current, basePath = "/masking", customTemplates = [], resultCount }: { current: Params; basePath?: string; customTemplates?: { key: string; name: string }[]; resultCount?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(current.q ?? "");
  const [more, setMore] = useState(!!(current.family || current.sensitivity || current.governedBy));

  const push = (patch: Params) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...current, ...patch })) if (v && k !== "field" && k !== "add" && k !== "page") next.set(k, v);
    const s = next.toString();
    router.push(s ? `${basePath}?${s}` : basePath);
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row mask-filterbar" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div className="mask-search">
          <Search size={14} className="muted" />
          <input
            className="input" placeholder="Search rules or fields"
            value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") push({ q: q.trim() || undefined }); }}
            onBlur={() => { if ((current.q ?? "") !== q.trim()) push({ q: q.trim() || undefined }); }}
          />
        </div>
        <select className="input sm" value={current.owner ?? ""} onChange={(e) => push({ owner: e.target.value || undefined })}>
          <option value="">Owned by anyone</option>
          <option value="me">Owned by me</option>
        </select>
        <select className="input sm" value={current.status ?? "attention"} onChange={(e) => push({ status: e.target.value || undefined })}>
          <option value="attention">Needs attention</option>
          <option value="all">All rules</option>
          <option value="norule">No rule</option>
          <option value="ambiguous">Ambiguous</option>
          <option value="diverged">Diverged</option>
          <option value="pending">Pending</option>
          <option value="active">Active</option>
        </select>
        <select className="input sm" value={current.channel ?? ""} onChange={(e) => push({ channel: e.target.value || undefined })}>
          <option value="">Channel</option>
          {CHANNEL_OPTS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input sm" value={current.role ?? ""} onChange={(e) => push({ role: e.target.value || undefined })}>
          <option value="">Role</option>
          {ROLE_OPTS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button className={`btn ghost sm${more ? " on" : ""}`} onClick={() => setMore((m) => !m)}><SlidersHorizontal size={13} /> More filters</button>
        {resultCount && <span className="cell-sub" style={{ marginLeft: "auto" }}>{resultCount}</span>}
      </div>
      {more && (
        <div className="row mask-filterbar" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select className="input sm" value={current.governedBy ?? ""} onChange={(e) => push({ governedBy: e.target.value || undefined })}>
            <option value="">Governed by</option>
            <option value="baseline">Baseline</option>
            <option value="DPDP">DPDP template</option>
            <option value="RBI">RBI template</option>
            <option value="tenant">Tenant</option>
            {customTemplates.map((t) => <option key={t.key} value={`custom:${t.key}`}>{t.name}</option>)}
          </select>
          <select className="input sm" value={current.sensitivity ?? ""} onChange={(e) => push({ sensitivity: e.target.value || undefined })}>
            <option value="">Sensitivity</option>
            {SENSITIVITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="input sm" value={current.family ?? ""} onChange={(e) => push({ family: e.target.value || undefined })}>
            <option value="">Rule family</option>
            {FAMILIES.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
