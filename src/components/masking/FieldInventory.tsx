"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, PanelRightOpen, Plus, X } from "lucide-react";
import { Pill, type PillTone } from "@/components/ui";
import { CreateRuleModal, type CatalogField } from "@/components/masking/CreateRuleModal";

export interface InventoryRowView {
  code: string; name: string; sensitivity: string;
  effLabel: string | null; masked: string | null;
  governedBadge: string | null; governedTone: PillTone; pending: boolean; stricter: boolean;
  overrides: number; lastChange: string; attention: boolean; ambiguous: boolean; href: string;
}

const SENS_TONE: Record<string, PillTone> = { Sensitive: "red", Personal: "yellow", Internal: "gray" };

/**
 * By-field table with multi-select. A sticky bar offers "Create rule for selected";
 * "New rule" opens the stepper with an empty picker. Open details (no eye) opens
 * the resolver drawer.
 */
export function FieldInventory({ rows, catalog, channelLabel }: { rows: InventoryRowView[]; catalog: CatalogField[]; channelLabel: string | null }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [modal, setModal] = useState<null | string[]>(null);
  const toggle = (c: string) => setSelected((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  const allOnPage = rows.map((r) => r.code);
  const allSelected = allOnPage.length > 0 && allOnPage.every((c) => selected.includes(c));

  return (
    <>
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 8 }}>
        <button className="btn sm" onClick={() => setModal([])}><Plus size={14} /> New rule</button>
      </div>

      <div className="table-wrap">
        <table className="dtable">
          <thead><tr>
            <th style={{ width: 34 }}><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : allOnPage)} aria-label="Select all" /></th>
            <th>Field</th><th>Sensitivity</th><th>Effective rule{channelLabel ? ` · ${channelLabel}` : ""}</th><th>Preview</th><th>Governed by</th><th>Channels</th><th>Last change</th><th style={{ width: 116 }} />
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className={selected.includes(r.code) ? "row-active" : ""}>
                <td><input type="checkbox" checked={selected.includes(r.code)} onChange={() => toggle(r.code)} aria-label={`Select ${r.code}`} /></td>
                <td><Link href={r.href} className="plain-link"><div className="cell-stack"><span className="cell-primary mono">{r.code}</span><span className="cell-sub">{r.name}</span></div></Link></td>
                <td><Pill tone={SENS_TONE[r.sensitivity]} dot={false}>{r.sensitivity}</Pill></td>
                <td>{r.effLabel ? r.effLabel : <span className="row" style={{ gap: 4, color: "var(--red)" }}><AlertTriangle size={13} /> {r.ambiguous ? "Ambiguous" : "No rule"}</span>}</td>
                <td className="mono cell-sub">{r.masked ?? "—"}</td>
                <td>{r.governedBadge ? <Pill tone={r.pending ? "yellow" : r.governedTone} dot={false}>{r.pending ? `${r.governedBadge} · change pending` : `${r.governedBadge}${r.stricter ? " · stricter" : ""}`}</Pill> : <span className="cell-sub">—</span>}</td>
                <td className="cell-sub">{r.overrides > 0 ? `${r.overrides} overrides` : "Same everywhere"}</td>
                <td className="cell-sub">{r.lastChange}</td>
                <td><Link href={r.href} className="row-link" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><PanelRightOpen size={14} /> Open details</Link></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9}><div className="empty">No fields match.</div></td></tr>}
          </tbody>
        </table>
      </div>

      {selected.length > 0 && (
        <div className="mask-selbar">
          <span>{selected.length} field{selected.length === 1 ? "" : "s"} selected</span>
          <button className="link-btn" onClick={() => setSelected([])}><X size={12} /> Clear</button>
          <button className="btn primary sm" style={{ marginLeft: "auto" }} onClick={() => setModal(selected)}><Plus size={14} /> Create rule for selected</button>
        </div>
      )}

      {modal && <CreateRuleModal catalog={catalog} initialSelected={modal} onClose={() => { setModal(null); setSelected([]); }} />}
    </>
  );
}
