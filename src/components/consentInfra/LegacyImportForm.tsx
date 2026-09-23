"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileStack, AlertTriangle } from "lucide-react";
import { Notice, Pill, Stat } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { legacyBulkImportAction } from "@/app/actions/consentInfra";
import { PROVENANCE_LABEL, PROVENANCE_TONE } from "@/lib/consentInfra";
import type { ActionResult } from "@/app/actions/requests";
import type { LegacyRecordInput } from "@/lib/engines/consentInfra";

export interface PurposeOpt { id: string; name: string }
export interface EntityOpt { id: string; name: string }
export interface TemplateOpt { id: string; name: string; sourceSystem: string; mapping: { legacyField: string; schemaField: string }[] }

const SCHEMA_FIELDS = ["subjectRef", "collectedAt (capture date)", "purpose", "entity"];

/** Parse pasted lines: `subjectRef | legacyISODate | trust(y/n)`. A blank/invalid
 *  date or trust=n makes the record unverifiable. */
function parseRecords(raw: string): { subjectRef: string; date: string | null; trusted: boolean }[] {
  return raw.split(/\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const [subjectRef, date, trust] = line.split(/[|,]/).map((s) => s.trim());
    const parsed = date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null;
    const trusted = Boolean(parsed) && (trust ?? "").toLowerCase().startsWith("y");
    return { subjectRef: subjectRef ?? "", date: parsed, trusted };
  }).filter((r) => r.subjectRef);
}

export function LegacyImportForm({ purposes, entities, templates }: { purposes: PurposeOpt[]; entities: EntityOpt[]; templates: TemplateOpt[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<(ActionResult & { verified?: number; unverifiable?: number; total?: number }) | null>(null);

  const [sourceSystem, setSourceSystem] = useState("Legacy CRM");
  const [mapping, setMapping] = useState([
    { legacyField: "customer_id", schemaField: "subjectRef" },
    { legacyField: "consent_ts", schemaField: "collectedAt (capture date)" },
  ]);
  const [raw, setRaw] = useState("");
  const [purposeTagId, setPurposeTagId] = useState(purposes[0]?.id ?? "");
  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const parsed = useMemo(() => parseRecords(raw), [raw]);
  const verified = parsed.filter((r) => r.trusted).length;
  const unverifiable = parsed.length - verified;

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (t) { setSourceSystem(t.sourceSystem); setMapping(t.mapping); }
  };

  const commit = () => start(async () => {
    const records: LegacyRecordInput[] = parsed.map((r) => ({ subjectRef: r.subjectRef, purposeTagId: purposeTagId || null, entityId: entityId || null, legacyCaptureDate: r.date, dateTrustworthy: r.trusted }));
    const r = await legacyBulkImportAction({ sourceSystem, records, saveTemplate: saveTemplate && templateName.trim() ? { name: templateName.trim(), mapping } : undefined });
    setResult(r);
    if (r.ok) { setRaw(""); router.refresh(); }
  });

  return (
    <div className="stack" style={{ gap: 16 }}>
      <ActionError result={result} />
      {result?.ok && <Notice tone="ok" title={`Imported ${result.total} record(s)`}>{result.verified} with verified capture dates, {result.unverifiable} unverifiable — each flagged honestly. A real hash + import timestamp was generated for every one.</Notice>}

      <div className="dprr-grid" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-head">Source & field mapping</div>
          <div className="card-body">
            {templates.length > 0 && (
              <label className="fld"><span>Reuse a saved mapping</span>
                <select className="input" defaultValue="" onChange={(e) => applyTemplate(e.target.value)}>
                  <option value="">— new mapping —</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.sourceSystem})</option>)}
                </select>
              </label>
            )}
            <label className="fld"><span>Legacy source system</span><input className="input" value={sourceSystem} onChange={(e) => setSourceSystem(e.target.value)} /></label>
            <div className="section-label">Field mapping (legacy → current schema)</div>
            {mapping.map((m, i) => (
              <div key={i} className="row" style={{ gap: 6, marginBottom: 6 }}>
                <input className="input sm" style={{ flex: 1 }} value={m.legacyField} onChange={(e) => setMapping((mm) => mm.map((x, j) => j === i ? { ...x, legacyField: e.target.value } : x))} />
                <span className="cell-sub">→</span>
                <select className="input sm" style={{ flex: 1 }} value={m.schemaField} onChange={(e) => setMapping((mm) => mm.map((x, j) => j === i ? { ...x, schemaField: e.target.value } : x))}>
                  {SCHEMA_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            ))}
            <label className="row" style={{ gap: 6, marginTop: 4 }}><input type="checkbox" checked={saveTemplate} onChange={(e) => setSaveTemplate(e.target.checked)} /><span className="cell-sub">Save this mapping as a reusable template</span></label>
            {saveTemplate && <input className="input sm" style={{ marginTop: 6 }} placeholder="Template name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />}
          </div>
        </div>

        <div className="card">
          <div className="card-head">Batch</div>
          <div className="card-body">
            <label className="fld"><span>Purpose (applied to batch)</span><select className="input" value={purposeTagId} onChange={(e) => setPurposeTagId(e.target.value)}>{purposes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="fld"><span>Business unit (entity)</span><select className="input" value={entityId} onChange={(e) => setEntityId(e.target.value)}>{entities.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}</select></label>
            <label className="fld"><span>Records <span className="cell-sub">one per line: <code>subjectRef | capture-date | trusted(y/n)</code></span></span>
              <textarea className="input" rows={6} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={"CUST-1001 | 2021-04-12 | y\nCUST-1002 | 2019-11-03 | n\nCUST-1003 |  | n"} />
            </label>
          </div>
        </div>
      </div>

      {parsed.length > 0 && (
        <div className="card">
          <div className="card-head">Batch preview <span className="cell-sub">before commit</span></div>
          <div className="card-body">
            <div className="stat-row" style={{ marginBottom: 12 }}>
              <Stat label="Total records" value={parsed.length} />
              <Stat label="Verified dates" value={verified} tone={verified ? "green" : undefined} />
              <Stat label="Unverifiable dates" value={unverifiable} tone={unverifiable ? "yellow" : undefined} />
            </div>
            <div className="table-wrap">
              <table className="dtable">
                <thead><tr><th>Subject</th><th>Legacy date</th><th>Provenance on import</th></tr></thead>
                <tbody>
                  {parsed.slice(0, 12).map((r, i) => (
                    <tr key={i}>
                      <td className="cell-primary">{r.subjectRef}</td>
                      <td className="cell-sub">{r.date ? r.date.slice(0, 10) : <em>none</em>}</td>
                      <td><Pill tone={PROVENANCE_TONE[r.trusted ? "verified_capture_date" : "unverifiable_date"]} dot={false}>{PROVENANCE_LABEL[r.trusted ? "verified_capture_date" : "unverifiable_date"]}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Notice tone="info" title="Honest provenance">
              <AlertTriangle size={12} style={{ verticalAlign: "-1px" }} /> An import is never treated as equivalent to a real-time capture. Unverifiable dates are flagged, not assumed — but every record still gets a real hash and import timestamp, so the import itself is immutable evidence.
            </Notice>
            <button className="btn primary" style={{ marginTop: 10 }} disabled={pending} onClick={commit}><Upload size={14} /> {pending ? "Importing…" : `Commit import (${parsed.length})`}</button>
          </div>
        </div>
      )}
      {parsed.length === 0 && <div className="empty"><FileStack size={16} /> Paste records above to preview the batch by provenance.</div>}
    </div>
  );
}
