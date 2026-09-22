"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plug, Plus, X } from "lucide-react";
import { Pill, Notice } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { connectRiskSourceAction } from "@/app/actions/scenario7";
import { suggestMetrics } from "@/lib/scenario7";
import { SOURCE_KIND_LABEL } from "@/lib/sources";
import type { ActionResult } from "@/app/actions/requests";

export interface SourceOpt { id: string; name: string; kind: string }
export interface ConnectedSource { id: string; name: string; kind: string; metrics: string[] }

export function RiskSourceConnector({ available, connected }: { available: SourceOpt[]; connected: ConnectedSource[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [sel, setSel] = useState("");
  const [metrics, setMetrics] = useState<string[]>([]);
  const [newMetric, setNewMetric] = useState("");

  const chosen = available.find((s) => s.id === sel);
  const pick = (id: string) => { setSel(id); const s = available.find((x) => x.id === id); setMetrics(s ? suggestMetrics(s.kind) : []); };
  const run = () => start(async () => { const r = await connectRiskSourceAction(sel, metrics); setResult(r); if (r.ok) { setSel(""); setMetrics([]); router.refresh(); } });

  return (
    <div className="dprr-grid" style={{ alignItems: "start" }}>
      <div className="card">
        <div className="card-head">Connect a data source</div>
        <div className="card-body">
          <ActionError result={result} />
          <label className="fld"><span>Source</span>
            <select className="input" value={sel} onChange={(e) => pick(e.target.value)}>
              <option value="">Select a discovered source…</option>
              {available.map((s) => <option key={s.id} value={s.id}>{s.name} · {SOURCE_KIND_LABEL[s.kind] ?? s.kind}</option>)}
            </select>
          </label>
          {chosen && (
            <>
              <div className="fld">
                <span>Suggested default metrics <span className="cell-sub">from the {SOURCE_KIND_LABEL[chosen.kind] ?? chosen.kind} source type — edit before confirming</span></span>
                <div style={{ marginTop: 4 }}>
                  {metrics.map((m, i) => (
                    <div key={i} className="pick-row"><span style={{ flex: 1 }}>{m}</span><button className="btn ghost xs" onClick={() => setMetrics(metrics.filter((_, j) => j !== i))}><X size={12} /></button></div>
                  ))}
                  {metrics.length === 0 && <div className="cell-sub">No metrics — add at least one.</div>}
                </div>
                <div className="add-element-form" style={{ marginTop: 6 }}>
                  <input className="input" style={{ flex: 1 }} placeholder="Add a metric" value={newMetric} onChange={(e) => setNewMetric(e.target.value)} />
                  <button className="btn sm" disabled={!newMetric.trim()} onClick={() => { setMetrics([...metrics, newMetric.trim()]); setNewMetric(""); }}><Plus size={13} /> Add</button>
                </div>
              </div>
              <button className="btn primary" disabled={pending || metrics.length === 0} onClick={run}><Plug size={14} /> Connect source</button>
            </>
          )}
          {available.length === 0 && <Notice tone="info" title="All discovered sources are connected">Every discovered source is already feeding risk analytics.</Notice>}
        </div>
      </div>

      <div className="card">
        <div className="card-head">Connected sources <span className="cell-sub">{connected.length}</span></div>
        <div className="card-body">
          {connected.map((c) => (
            <div key={c.id} style={{ marginBottom: 10 }}>
              <div className="row" style={{ gap: 6, alignItems: "center" }}><span className="cell-primary">{c.name}</span><Pill tone="gray" dot={false}>{SOURCE_KIND_LABEL[c.kind] ?? c.kind}</Pill></div>
              <div className="row" style={{ gap: 4, flexWrap: "wrap", marginTop: 4 }}>{c.metrics.map((m) => <Pill key={m} tone="blue" dot={false}>{m}</Pill>)}</div>
            </div>
          ))}
          {connected.length === 0 && <div className="cell-sub">No sources connected yet.</div>}
        </div>
      </div>
    </div>
  );
}
