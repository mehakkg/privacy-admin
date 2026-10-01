"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import { FAMILIES, CHANNELS, SENSITIVITIES } from "@/lib/masking";

type Params = Record<string, string | undefined>;

/**
 * Filter bar for the Protection rules table. Primary filters sit inline next to a
 * compact search box (Governed by · Status · Sensitivity); the less-used Rule
 * family and Channel filters live behind "More filters" so the default bar stays
 * calm. The Status default reflects the gap-first landing (Needs attention). Each
 * control pushes to the URL, so filters are shareable and survive refresh.
 */
export function PolicyFilters({ current, basePath = "/masking", customTemplates = [] }: { current: Params; basePath?: string; customTemplates?: { key: string; name: string }[] }) {
  const router = useRouter();
  const [q, setQ] = useState(current.q ?? "");
  const [more, setMore] = useState(!!(current.family || current.channel));

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
            className="input" placeholder="Search field"
            value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") push({ q: q.trim() || undefined }); }}
            onBlur={() => { if ((current.q ?? "") !== q.trim()) push({ q: q.trim() || undefined }); }}
          />
        </div>
        <select className="input sm" value={current.governedBy ?? ""} onChange={(e) => push({ governedBy: e.target.value || undefined })}>
          <option value="">Governed by</option>
          <option value="baseline">Baseline</option>
          <option value="DPDP">DPDP template</option>
          <option value="RBI">RBI template</option>
          <option value="tenant">Tenant</option>
          {customTemplates.map((t) => <option key={t.key} value={`custom:${t.key}`}>{t.name}</option>)}
        </select>
        <select className="input sm" value={current.status ?? "attention"} onChange={(e) => push({ status: e.target.value || undefined })}>
          <option value="attention">Needs attention</option>
          <option value="all">All fields</option>
          <option value="norule">No rule</option>
          <option value="ambiguous">Ambiguous</option>
          <option value="diverged">Diverged</option>
          <option value="pending">Pending</option>
          <option value="active">Active</option>
        </select>
        <select className="input sm" value={current.sensitivity ?? ""} onChange={(e) => push({ sensitivity: e.target.value || undefined })}>
          <option value="">Sensitivity</option>
          {SENSITIVITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className={`btn ghost sm${more ? " on" : ""}`} onClick={() => setMore((m) => !m)}><SlidersHorizontal size={13} /> More filters</button>
      </div>
      {more && (
        <div className="row mask-filterbar" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select className="input sm" value={current.family ?? ""} onChange={(e) => push({ family: e.target.value || undefined })}>
            <option value="">Rule family</option>
            {FAMILIES.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <select className="input sm" value={current.channel ?? ""} onChange={(e) => push({ channel: e.target.value || undefined })}>
            <option value="">Channel</option>
            {CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
