"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { FAMILIES, CHANNELS, SENSITIVITIES } from "@/lib/masking";

type Params = Record<string, string | undefined>;

/**
 * Search + dropdown filters for the Masking policy table. Each control pushes to
 * the URL, so filters are shareable and survive refresh. Active filters render as
 * dismissible chips (server-side) beneath this bar.
 */
export function PolicyFilters({ current, basePath = "/masking" }: { current: Params; basePath?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(current.q ?? "");

  const push = (patch: Params) => {
    const next = new URLSearchParams();
    const merged = { ...current, ...patch };
    // Keep tab; drop the drawer/paging params when filters change.
    for (const [k, v] of Object.entries(merged)) if (v && k !== "field" && k !== "add" && k !== "page") next.set(k, v);
    const s = next.toString();
    router.push(s ? `${basePath}?${s}` : basePath);
  };

  return (
    <div className="row mask-filterbar" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <div className="row" style={{ gap: 6, alignItems: "center", flex: "1 1 240px", minWidth: 200 }}>
        <Search size={14} className="muted" />
        <input
          className="input" style={{ flex: 1 }} placeholder="Search field code or name"
          value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") push({ q: q.trim() || undefined }); }}
          onBlur={() => { if ((current.q ?? "") !== q.trim()) push({ q: q.trim() || undefined }); }}
        />
      </div>
      <select className="input sm" value={current.family ?? ""} onChange={(e) => push({ family: e.target.value || undefined })}>
        <option value="">Rule family</option>
        {FAMILIES.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>
      <select className="input sm" value={current.governedBy ?? ""} onChange={(e) => push({ governedBy: e.target.value || undefined })}>
        <option value="">Governed by</option>
        <option value="baseline">Baseline</option>
        <option value="DPDP">DPDP template</option>
        <option value="RBI">RBI template</option>
        <option value="tenant">Tenant</option>
      </select>
      <select className="input sm" value={current.sensitivity ?? ""} onChange={(e) => push({ sensitivity: e.target.value || undefined })}>
        <option value="">Sensitivity</option>
        {SENSITIVITIES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className="input sm" value={current.channel ?? ""} onChange={(e) => push({ channel: e.target.value || undefined })}>
        <option value="">Channel</option>
        {CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
      <select className="input sm" value={current.status ?? ""} onChange={(e) => push({ status: e.target.value || undefined })}>
        <option value="">Status</option>
        <option value="active">Active</option>
        <option value="norule">No rule</option>
        <option value="pending">Change pending</option>
        <option value="exceptions">Has unmask exceptions</option>
      </select>
    </div>
  );
}
