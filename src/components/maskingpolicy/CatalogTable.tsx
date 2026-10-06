"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

export interface CatalogRow { code: string; name: string; example: string; recommended: string; inPolicy: string; href: string | null; regulated: boolean }
export interface CatalogGroup { id: string; name: string; definition: string; rows: CatalogRow[] }

/** E — read-only catalog table with a search filter and the shared category header. */
export function CatalogTable({ groups }: { groups: CatalogGroup[] }) {
  const [q, setQ] = useState("");
  const n = q.trim().toLowerCase();
  const filtered = groups.map((g) => ({ ...g, rows: n ? g.rows.filter((r) => (r.name + r.code).toLowerCase().includes(n)) : g.rows })).filter((g) => g.rows.length > 0);

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="mask-search" style={{ maxWidth: 320 }}><Search size={14} className="muted" /><input className="input" placeholder="Search by name or code" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="table-wrap"><table className="dtable compact mp-catalog">
        <thead><tr><th>Field</th><th>Recommended masking</th><th>Example</th><th>In your policy</th><th>Notes</th></tr></thead>
        <tbody>
          {filtered.map((g) => (
            <>
              <tr key={g.id} className="mp-cat-row"><td colSpan={5}><strong>{g.name}</strong> <span className="cell-sub">{g.rows.length} fields · {g.definition}</span></td></tr>
              {g.rows.map((r) => (
                <tr key={r.code}>
                  <td><div className="cell-stack"><span className="cell-primary">{r.name}</span><span className="cell-sub mono">{r.code}</span></div></td>
                  <td className="cell-sub">{r.recommended}</td>
                  <td className="mono cell-sub">{r.example}</td>
                  <td>{r.href ? <Link href={r.href} className="row-link">{r.inPolicy}</Link> : <span className="cell-sub">{r.inPolicy}</span>}</td>
                  <td className="cell-sub">{r.regulated ? "Regulated" : ""}</td>
                </tr>
              ))}
            </>
          ))}
          {filtered.length === 0 && <tr><td colSpan={5}><span className="cell-sub">No fields match.</span></td></tr>}
        </tbody>
      </table></div>
    </div>
  );
}
