"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Plus, X, Lock, LayoutTemplate, User, Layers, MoreHorizontal } from "lucide-react";
import { CreateRuleModal, type CatalogField } from "@/components/masking/CreateRuleModal";

export interface InventoryRowView {
  code: string; name: string; path: string; sensitivity: string;
  effLabel: string | null; masked: string | null;
  governedBadge: string | null; governedLayer: string | null; systemRegulated: boolean; selfLocked: boolean;
  coveredSub: string | null; channel: string | null; roleTag: string | null;
  pending: boolean; stricter: boolean; overrides: number;
  group: string | null; groupHref: string | null;
  lastChange: string; attention: boolean; ambiguous: boolean; href: string;
}

const SENS_COLOR: Record<string, string> = { Sensitive: "var(--red)", Personal: "var(--yellow)", Internal: "var(--text-4, #94a3b8)" };

/** Covered-by as icon + text (no pill): lock = floor/regulated, template = regional/custom, person = tenant. */
function CoveredBy({ r }: { r: InventoryRowView }) {
  if (!r.governedBadge) return <span className="cell-sub">—</span>;
  const Icon = r.governedLayer === "baseline" || r.systemRegulated ? Lock : r.governedLayer === "regional" ? LayoutTemplate : User;
  const color = r.systemRegulated ? "var(--red)" : undefined;
  return (
    <div className="cell-stack">
      <span className="row" style={{ gap: 6, alignItems: "center", color: r.pending ? "var(--yellow)" : undefined }}>
        <Icon size={13} style={{ color }} />
        <span>{r.governedBadge}{r.pending ? " · change pending" : r.stricter ? " · stricter" : ""}</span>
      </span>
      {r.coveredSub && <span className="cell-sub">{r.coveredSub}</span>}
    </div>
  );
}

/**
 * The single field-first Rules table. Row checkbox + sticky "Apply rule to
 * selected" bar; the ⋯ action and row click open the resolver drawer. No eye
 * icon anywhere. Columns follow the Rules-card reference: Field (+ technical
 * path), Effective rule, Preview, Covered by (+ owner), Channel, Role, Last
 * change. Channel/Role are advisory (enforcement is off).
 */
export function FieldInventory({ rows, catalog }: { rows: InventoryRowView[]; catalog: CatalogField[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [modal, setModal] = useState<null | string[]>(null);
  const toggle = (c: string) => setSelected((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  const allOnPage = rows.map((r) => r.code);
  const allSelected = allOnPage.length > 0 && allOnPage.every((c) => selected.includes(c));

  return (
    <>
      <div className="table-wrap">
        <table className="dtable rules-table">
          <thead><tr>
            <th style={{ width: 34 }}><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : allOnPage)} aria-label="Select all" /></th>
            <th>Field</th><th>Effective rule</th><th>Preview</th><th>Covered by</th><th>Channel</th><th>Role</th><th>Last change</th><th style={{ width: 44 }} />
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className={selected.includes(r.code) ? "row-active" : ""}>
                <td><input type="checkbox" checked={selected.includes(r.code)} onChange={() => toggle(r.code)} aria-label={`Select ${r.code}`} /></td>
                <td>
                  <Link href={r.href} className="plain-link"><div className="cell-stack">
                    <span className="row" style={{ gap: 6, alignItems: "center" }}>
                      <span className="sens-dot" title={r.sensitivity} style={{ background: SENS_COLOR[r.sensitivity] }} />
                      <span className="cell-primary mono">{r.code}</span>
                    </span>
                    <span className="cell-sub mono">{r.path}</span>
                  </div></Link>
                  {r.group && r.groupHref && <Link href={r.groupHref} className="group-tag"><Layers size={10} /> {r.group}</Link>}
                </td>
                <td>{r.effLabel ? r.effLabel : <span className="row" style={{ gap: 4, color: "var(--red)" }}><AlertTriangle size={13} /> {r.ambiguous ? "Ambiguous" : "No rule"}</span>}</td>
                <td className="mono cell-sub">{r.masked ?? "—"}</td>
                <td><CoveredBy r={r} /></td>
                <td className="cell-sub">{r.channel ?? "—"}</td>
                <td className="cell-sub">{r.selfLocked || r.systemRegulated ? <span className="row" style={{ gap: 4, alignItems: "center" }}><Lock size={11} /> {r.roleTag ?? "Restricted"}</span> : (r.roleTag ?? "—")}</td>
                <td className="cell-sub">{r.lastChange}</td>
                <td><Link href={r.href} className="icon-btn" aria-label={`Open ${r.code}`}><MoreHorizontal size={16} /></Link></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9}><div className="empty">No rules match.</div></td></tr>}
          </tbody>
        </table>
      </div>

      {selected.length > 0 && (
        <div className="mask-selbar">
          <span>{selected.length} field{selected.length === 1 ? "" : "s"} selected</span>
          <button className="link-btn" onClick={() => setSelected([])}><X size={12} /> Clear</button>
          <button className="btn primary sm" style={{ marginLeft: "auto" }} onClick={() => setModal(selected)}><Plus size={14} /> Apply rule to selected ({selected.length})</button>
        </div>
      )}

      {modal && <CreateRuleModal catalog={catalog} initialSelected={modal} onClose={() => { setModal(null); setSelected([]); }} />}
    </>
  );
}
