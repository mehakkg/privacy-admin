"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Check, X, ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";
import { Pill, Notice } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { saveIntegrationAction } from "@/app/actions/scenario4";
import { SYNC_FREQUENCIES } from "@/lib/scenario4";
import type { ActionResult } from "@/app/actions/requests";

export function IntegrationSetupForm({ approvedFields }: { approvedFields: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [name, setName] = useState(""); const [vendor, setVendor] = useState("");
  const [freq, setFreq] = useState("daily");
  const [monitoring, setMonitoring] = useState(true);
  const [rows, setRows] = useState<{ target: string; source: string }[]>([{ target: "", source: "" }]);
  const [showReq, setShowReq] = useState(false);

  const approved = new Set(approvedFields);
  const isValid = (t: string) => !t.trim() || approved.has(t.trim());
  const invalidCount = rows.filter((r) => r.target.trim() && !approved.has(r.target.trim())).length;
  const run = (connect: boolean) => start(async () => {
    const r = await saveIntegrationAction({ name, vendor, syncFrequency: freq, mapping: rows, monitoringEnabled: monitoring, connect });
    setResult(r);
    if (r.ok) { router.refresh(); if (connect) { setName(""); setVendor(""); setRows([{ target: "", source: "" }]); } }
  });

  return (
    <div className="dprr-grid" style={{ alignItems: "start" }}>
      <div>
        <ActionError result={result} />
        <div className="card">
          <div className="card-head">Connect integration</div>
          <div className="card-body">
            <div className="row" style={{ gap: 10 }}>
              <label className="fld" style={{ flex: 1 }}><span>Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marketing CDP" /></label>
              <label className="fld" style={{ flex: 1 }}><span>Vendor</span><input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="e.g. Segment" /></label>
            </div>
            <label className="fld"><span>Sync frequency</span>
              <select className="input" value={freq} onChange={(e) => setFreq(e.target.value)}>{SYNC_FREQUENCIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
            </label>

            <div className="fld">
              <span>Field mapping — validated against the CISO-approved schema</span>
              <div style={{ marginTop: 4 }}>
                {rows.map((r, i) => {
                  const valid = isValid(r.target);
                  return (
                    <div key={i} className="map-row">
                      <input className={`input${!valid ? " input-invalid" : ""}`} placeholder="Target field (must be approved)" value={r.target} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, target: e.target.value } : x))} />
                      <span className="cell-sub">←</span>
                      <input className="input" placeholder="Source field" value={r.source} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, source: e.target.value } : x))} />
                      {r.target.trim() && (valid ? <Check size={14} style={{ color: "var(--green)" }} /> : <X size={14} style={{ color: "var(--red)" }} />)}
                      <button className="btn ghost xs" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={12} /></button>
                    </div>
                  );
                })}
                <button className="btn ghost xs" onClick={() => setRows([...rows, { target: "", source: "" }])}><Plus size={12} /> Add mapping</button>
              </div>
            </div>

            <label className="row" style={{ gap: 8, alignItems: "center", marginBottom: 8 }}>
              <input type="checkbox" checked={monitoring} onChange={(e) => setMonitoring(e.target.checked)} />
              <span>Drift monitoring for silent vendor API changes <Pill tone="green" dot={false}>on by default</Pill></span>
            </label>

            {invalidCount > 0 && <Notice tone="danger" title={`${invalidCount} mapping(s) outside the approved schema`}>Save is blocked while any target field is not in the CISO-approved schema. Fix or remove the flagged rows.</Notice>}

            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <button className="btn" disabled={pending} onClick={() => run(false)}>Save draft</button>
              <button className="btn primary" disabled={pending || !name.trim() || !vendor.trim() || invalidCount > 0} onClick={() => run(true)}>Configure &amp; connect</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <button className="card-head" style={{ width: "100%", textAlign: "left", background: "none", border: 0, borderBottom: "1px solid var(--border-soft)", cursor: "pointer", font: "inherit" }} onClick={() => setShowReq(!showReq)}>
          {showReq ? <ChevronDown size={13} /> : <ChevronRight size={13} />} <ShieldCheck size={13} style={{ verticalAlign: "-2px" }} /> CISO-approved schema ({approvedFields.length})
        </button>
        {showReq && (
          <div className="card-body">
            <p className="cell-sub" style={{ margin: "0 0 8px" }}>Only these target fields may be mapped. A mapping to anything else is blocked at save.</p>
            <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>{approvedFields.map((f) => <Pill key={f} tone="gray" dot={false}>{f}</Pill>)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
