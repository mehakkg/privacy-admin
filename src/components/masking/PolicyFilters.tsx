"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import { FAMILIES, CHANNELS, SENSITIVITIES } from "@/lib/masking";

type Params = Record<string, string | undefined>;

/**
 * Filter bar for the Protection rules table: search + Governed by + Status +
 * Sensitivity always visible; Rule family and Channel behind "More filters".
 * Each control pushes to the URL, so filters are shareable and survive refresh.
 */
export function PolicyFilters({ current, basePath = "/masking" }: { current: Params; basePath?: string }) {
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
        <div className="row" style={{ gap: 6, alignItems: "center", flex: "1 1 220px", minWidth: 190 }}>
          <Search size={14} className="muted" />
          <input
            className="input" style={{ flex: 1 }} placeholder="Search field code or name"
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
        </select>
        <select className="input sm" value={current.status ?? ""} onChange={(e) => push({ status: e.target.value || undefined })}>
          <option value="">Status</option>
          <option value="attention">Needs attention</option>
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
        <button className="link-btn" onClick={() => setMore((m) => !m)}><SlidersHorizontal size={13} /> More filters</button>
      </div>
      {more && (
        <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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
