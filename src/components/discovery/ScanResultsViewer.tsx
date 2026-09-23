"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldAlert, Pencil, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { Pill, Chip, Notice } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { ActionError } from "@/components/actions";
import { overrideClassificationAction, bulkOnboardSourcesAction } from "@/app/actions/scenario4";
import { RISK_LEVELS, RISK_LABEL, RISK_TONE, SOURCE_KIND_LABEL, OVERRIDE_REASON_CATEGORIES } from "@/lib/scenario4";
import { Tabs } from "@/components/Tabs";
import type { ActionResult } from "@/app/actions/requests";

export interface Finding {
  id: string; fieldPath: string; sourceName: string; sourceKind: string;
  detectedType: string; effectiveType: string; risk: string; matchedRule: string; quarantined: boolean; overridden: boolean;
  scanType: "regular" | "deep"; isNew: boolean;
}
export interface NewSource { id: string; name: string; kind: string }

export function ScanResultsViewer({ findings, newSources }: { findings: Finding[]; newSources: NewSource[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [kindFilter, setKindFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ medium: true, low: true });
  const [reasonOpen, setReasonOpen] = useState<Finding | null>(null);
  const [ov, setOv] = useState({ type: "", category: "", note: "" });
  const [selSources, setSelSources] = useState<string[]>([]);
  // Regular vs Deep are distinct tabs (never blended); default view shows only
  // findings new since last review, with an explicit full-history toggle.
  const [scanTab, setScanTab] = useState<"regular" | "deep">("regular");
  const [showAll, setShowAll] = useState(false);

  const run = (op: () => Promise<ActionResult>, after?: () => void) => start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });

  const inTab = findings.filter((f) => f.scanType === scanTab);
  const newCount = { regular: findings.filter((f) => f.scanType === "regular" && f.isNew).length, deep: findings.filter((f) => f.scanType === "deep" && f.isNew).length };
  const kinds = useMemo(() => [...new Set(inTab.map((f) => f.sourceKind))], [inTab]);
  const filtered = inTab
    .filter((f) => (showAll ? true : f.isNew))
    .filter((f) => (kindFilter ? f.sourceKind === kindFilter : true));
  const byRisk = (risk: string) => filtered.filter((f) => f.risk === risk);

  return (
    <div>
      <ActionError result={result} />

      {newSources.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">Newly discovered sources <span className="cell-sub">{newSources.length}</span></div>
          <div className="card-body">
            <p className="cell-sub" style={{ margin: "0 0 8px" }}>Sources found by the scan but not yet in the inventory. Select and onboard in one action.</p>
            {newSources.map((s) => (
              <label key={s.id} className="pick-row"><input type="checkbox" checked={selSources.includes(s.id)} onChange={() => setSelSources((x) => x.includes(s.id) ? x.filter((y) => y !== s.id) : [...x, s.id])} /><span className="cell-primary">{s.name}</span><Pill tone="gray" dot={false}>{SOURCE_KIND_LABEL[s.kind] ?? s.kind}</Pill></label>
            ))}
            <button className="btn sm primary" style={{ marginTop: 10 }} disabled={pending || selSources.length === 0} onClick={() => run(() => bulkOnboardSourcesAction(selSources), () => setSelSources([]))}>Bulk-onboard {selSources.length} source(s)</button>
          </div>
        </div>
      )}

      <Tabs
        tabs={[{ key: "regular", label: "Regular Scan", badge: newCount.regular }, { key: "deep", label: "Deep Scan", badge: newCount.deep }]}
        active={scanTab}
        onChange={(k) => { setKindFilter(""); setScanTab(k as "regular" | "deep"); }}
      />

      <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <button className={`btn xs${!showAll ? " primary" : ""}`} onClick={() => setShowAll(false)}>New since last review</button>
        <button className={`btn xs${showAll ? " primary" : ""}`} onClick={() => setShowAll(true)}>Show all history</button>
        <span style={{ marginLeft: 12 }} className="cell-sub">Source type:</span>
        <button className={`btn xs${!kindFilter ? " primary" : ""}`} onClick={() => setKindFilter("")}>All</button>
        {kinds.map((k) => <button key={k} className={`btn xs${kindFilter === k ? " primary" : ""}`} onClick={() => setKindFilter(k)}>{SOURCE_KIND_LABEL[k] ?? k}</button>)}
      </div>

      {!showAll && filtered.length === 0 && (
        <Notice tone="ok" title="Nothing new to review">No new {scanTab} scan findings since your last review. Switch to “Show all history” to see everything.</Notice>
      )}

      {RISK_LEVELS.map((risk) => {
        const rows = byRisk(risk);
        const isCollapsed = collapsed[risk] ?? false;
        return (
          <div key={risk} className="risk-group">
            <button className="risk-head" onClick={() => setCollapsed((c) => ({ ...c, [risk]: !isCollapsed }))}>
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              <Pill tone={RISK_TONE[risk]} dot={false}>{RISK_LABEL[risk]}</Pill>
              <span className="cell-sub">{rows.length} finding{rows.length === 1 ? "" : "s"}</span>
              {risk === "high" && rows.length > 0 && <span className="cell-sub" style={{ color: "var(--red)" }}><ShieldAlert size={12} style={{ verticalAlign: "-2px" }} /> review first · auto-quarantined on flag</span>}
            </button>
            {!isCollapsed && (
              <div className="table-wrap">
                <table className="dtable">
                  <thead><tr><th>Field</th><th>Source</th><th>Classification</th><th>Matched rule</th><th></th></tr></thead>
                  <tbody>
                    {rows.map((f) => (
                      <tr key={f.id}>
                        <td><span className="mono cell-primary">{f.fieldPath}</span>{f.quarantined && <div><Pill tone="red" dot={false}>Quarantined</Pill></div>}</td>
                        <td><div className="cell-stack"><span>{f.sourceName}</span><span className="cell-sub">{SOURCE_KIND_LABEL[f.sourceKind] ?? f.sourceKind}</span></div></td>
                        <td><Chip>{f.effectiveType}</Chip>{f.overridden && <span className="cell-sub"> overridden</span>}</td>
                        <td><span className="cell-sub"><Sparkles size={11} style={{ verticalAlign: "-1px" }} /> {f.matchedRule}</span></td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <button className="btn ghost xs" onClick={() => { setReasonOpen(f); setOv({ type: f.effectiveType, category: "", note: "" }); }}><Pencil size={12} /> Override</button>
                          {f.quarantined && <Link href="/discovery/quarantine" className="row-link" style={{ fontSize: 12, marginLeft: 8 }}>In quarantine →</Link>}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan={5}><div className="empty">No {RISK_LABEL[risk].toLowerCase()} findings.</div></td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {/* SCREEN 3 — Classification override with required reason category + note. */}
      {reasonOpen && (
        <Modal title={`Override classification — ${reasonOpen.fieldPath}`} subtitle={`Scan classified this as "${reasonOpen.detectedType}". Corrections are recorded, not silent.`} onClose={() => setReasonOpen(null)}
          footer={<><button className="btn" onClick={() => setReasonOpen(null)}>Cancel</button><button className="btn primary" disabled={pending || !ov.type.trim() || !ov.category || !ov.note.trim()} onClick={() => run(() => overrideClassificationAction(reasonOpen.id, ov.type, ov.category, ov.note), () => setReasonOpen(null))}>Submit correction</button></>}>
          <label className="fld"><span>Corrected classification</span><input className="input" value={ov.type} onChange={(e) => setOv({ ...ov, type: e.target.value })} placeholder="e.g. financial, kyc, contact" /></label>
          <label className="fld"><span>Reason category (required)</span>
            <select className="input" value={ov.category} onChange={(e) => setOv({ ...ov, category: e.target.value })}>
              <option value="">Select…</option>
              {OVERRIDE_REASON_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <label className="fld"><span>Note (required)</span><textarea className="input" rows={2} value={ov.note} onChange={(e) => setOv({ ...ov, note: e.target.value })} /></label>
          <Notice tone="info" title="Recorded to the field's history">The old label, new label, category, note, who and when are logged to the audit trail — an override is never a silent overwrite.</Notice>
        </Modal>
      )}
    </div>
  );
}
