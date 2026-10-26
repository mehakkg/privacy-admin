"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download, X, ExternalLink, AlertTriangle } from "lucide-react";
import type { DataFlowView as View, Flow, FlowNode } from "@/lib/engines/dataflow";

const DATAFLOW = "/data-flow/map";

/**
 * Data flow — a derived, read-only six-column map of how personal data moves.
 * Findings are the lead element; cross-border is informational, never red. The map
 * is fixed by editing the source (Activities, Consent collection, Vendor Risk).
 */
export function DataFlowView({ view }: { view: View }) {
  const router = useRouter();
  const [mode, setMode] = useState<"diagram" | "table">("diagram");
  const [selected, setSelected] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  // Active flow set: a selected node's flows, or a focused finding's flows.
  const activeFlows = useMemo<Set<string> | null>(() => {
    if (selected) { const n = view.columns.flatMap((c) => c.nodes).find((x) => x.id === selected); return n ? new Set(n.flowIds) : null; }
    if (focusKey) { const f = view.findings.find((x) => x.key === focusKey); return f ? new Set(f.flowIds) : null; }
    return null;
  }, [selected, focusKey, view]);

  const selectNode = (id: string) => { setSelected((s) => (s === id ? null : id)); setFocusKey(null); };
  const selectedNode = selected ? view.columns.flatMap((c) => c.nodes).find((x) => x.id === selected) ?? null : null;
  const detailFlows = selectedNode ? view.flows.filter((f) => selectedNode.flowIds.includes(f.id)) : [];

  if (!view.hasSystems) {
    return (
      <Container view={view} mode={mode} setMode={setMode} router={router}>
        <div className="inv-noresult">Nothing to map yet. Flows appear once an activity has data fields and systems. <Link href="/data-map/processing-activities?bucket=all" className="link-btn">Go to Activities</Link></div>
      </Container>
    );
  }

  return (
    <Container view={view} mode={mode} setMode={setMode} router={router}>
      {mode === "diagram" ? (
        <div className="row" style={{ gap: 0, alignItems: "stretch" }}>
          <Diagram view={view} activeFlows={activeFlows} onSelect={selectNode} selected={selected} />
          {selectedNode && <DetailPanel node={selectedNode} flows={detailFlows} onClose={() => setSelected(null)} router={router} />}
        </div>
      ) : (
        <TableView view={view} />
      )}
      {view.notOnMap.length > 0 && (
        <p className="cell-sub" style={{ marginTop: 14 }}>
          {view.notOnMap.length} {view.notOnMap.length === 1 ? "activity isn’t" : "activities aren’t"} on the map because they have no data mapped: {view.notOnMap.map((a, i) => <span key={a.id}>{i > 0 ? ", " : ""}<Link href={`/data-map/processing-activities?activity=${a.id}`} className="link-btn">{a.name}</Link></span>)}
        </p>
      )}
    </Container>
  );
}

function Container({ view, mode, setMode, router, children }: { view: View; mode: string; setMode: (m: "diagram" | "table") => void; router: ReturnType<typeof useRouter>; children: React.ReactNode }) {
  const pushScope = (id: string) => router.push(`${DATAFLOW}${id ? `?entity=${id}` : ""}`);
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div className="stack" style={{ gap: 8 }}>
          <h1 className="inv-title">Data flow</h1>
          <label className="row" style={{ gap: 8, alignItems: "center" }}>
            <span className="cell-sub">Fiduciary</span>
            <select className="input sm" value={view.entityId ?? ""} onChange={(e) => pushScope(e.target.value)}>
              <option value="">All fiduciaries ({view.entities.length})</option>
              {view.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
        </div>
        <a href="/api/discovery/export" className="btn sec inv-nowrap" style={{ whiteSpace: "nowrap" }}>Export report <Download size={13} /></a>
      </div>

      <p className="inv-sentence">
        Personal data enters through <strong>{plural(view.summary.channels, "channel")}</strong>, is used in <strong>{plural(view.summary.activities, "activity", "activities")}</strong>, stored in <strong>{plural(view.summary.systems, "system")}</strong> and shared with <strong>{plural(view.summary.recipients, "recipient")}</strong>. <strong className={view.summary.attention ? "sev-warning" : ""}>{view.summary.attention} {view.summary.attention === 1 ? "thing needs" : "things need"} attention.</strong>
      </p>

      {view.stale && <div className="notice warn" style={{ margin: 0 }}><AlertTriangle size={12} /> Last DLP sync {view.staleLabel}. New systems may be missing. <Link href="/integrations/dlp" className="link-btn">Sync in Data Discovery →</Link></div>}

      <FindingsStrip view={view} />

      <div className="row" style={{ justifyContent: "flex-end" }}>
        <div className="mp-segment">
          <button className={mode === "diagram" ? "on" : ""} onClick={() => setMode("diagram")}>Diagram</button>
          <button className={mode === "table" ? "on" : ""} onClick={() => setMode("table")}>Table</button>
        </div>
      </div>
      {children}
    </div>
  );
}

function FindingsStrip({ view }: { view: View }) {
  if (view.findings.length === 0) return <div className="notice info" style={{ margin: 0 }}>No findings. Every flow has a notice, a declared channel and a valid contract.</div>;
  return (
    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      {view.findings.map((f) => (
        <span key={f.key} className={`rchip ${f.level === "blocking" ? "amber-fill" : f.key === "duplicate" ? "amber-outline" : "info"}`} title={f.anchor}>
          {f.label} <span className="tnum">{f.count}</span>
        </span>
      ))}
    </div>
  );
}

// --- Diagram ----------------------------------------------------------------
function Diagram({ view, activeFlows, onSelect, selected }: { view: View; activeFlows: Set<string> | null; onSelect: (id: string) => void; selected: string | null }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [edges, setEdges] = useState<{ id: string; d: string; blocking: boolean; crossBorder: boolean; count: number; active: boolean }[]>([]);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  const edgeActive = (flowIds: string[]) => !activeFlows || flowIds.some((id) => activeFlows.has(id));
  const nodeActive = (n: FlowNode) => !activeFlows || n.flowIds.some((id) => activeFlows.has(id));

  useLayoutEffect(() => {
    const wrap = wrapRef.current; if (!wrap) return;
    const compute = () => {
      const base = wrap.getBoundingClientRect();
      setDims({ w: base.width, h: base.height });
      const paths = view.edges.map((e) => {
        const a = nodeRefs.current.get(e.from), b = nodeRefs.current.get(e.to);
        if (!a || !b) return null;
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        const x1 = ra.right - base.left, y1 = ra.top + ra.height / 2 - base.top;
        const x2 = rb.left - base.left, y2 = rb.top + rb.height / 2 - base.top;
        const mx = (x1 + x2) / 2;
        return { id: e.id, d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`, blocking: e.blocking, crossBorder: e.crossBorder, count: e.count, active: edgeActive(e.flowIds) };
      }).filter(Boolean) as typeof edges;
      setEdges(paths);
    };
    compute();
    const ro = new ResizeObserver(compute); ro.observe(wrap);
    window.addEventListener("resize", compute);
    return () => { ro.disconnect(); window.removeEventListener("resize", compute); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeFlows]);

  const nCols = view.columns.length;
  return (
    <div className="df-canvas df-canvas-grid" ref={wrapRef} style={{ position: "relative", flex: 1, minWidth: 0, overflowX: "auto" }}>
      <svg width={dims.w} height={dims.h} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        {edges.map((e) => {
          const tracing = !!activeFlows; // a node/finding is focused → trace mode
          // Calm neutral connectors by default; a finding is shown ON its card, not
          // as a red line. Red/blue only appear while tracing a selected path.
          const stroke = !e.active
            ? "var(--border, #cbd5e1)"
            : tracing
              ? (e.blocking ? "var(--red, #dc2626)" : "var(--accent, #2563eb)")
              : "var(--border-strong, #94a3b8)";
          const width = e.count > 5 ? 2.25 : e.count > 1 ? 1.75 : 1.5;
          const opacity = !e.active ? 0.12 : tracing ? 1 : 0.5;
          return (
            <path key={e.id} d={e.d} fill="none" stroke={stroke} strokeWidth={width}
              strokeDasharray={e.crossBorder ? "5 4" : undefined} opacity={opacity} strokeLinecap="round" />
          );
        })}
      </svg>
      <div className="df-cols" style={{ position: "relative", zIndex: 1, display: "flex", gap: 44, alignItems: "flex-start" }}>
        {view.columns.map((c, ci) => (
          <div key={c.key} className="df-col" style={{ flex: "0 0 170px", minWidth: 170 }}>
            <div className="cell-sub" style={{ fontWeight: 700, fontSize: 10, letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 12, color: "var(--text-3)" }}>{c.label} · {c.nodes.length}</div>
            <div className="stack" style={{ gap: 14 }}>
              {c.nodes.map((n) => (
                <button key={n.id} ref={(el) => { if (el) nodeRefs.current.set(n.id, el); }}
                  className={`df-card${selected === n.id ? " on" : ""}`} onClick={() => onSelect(n.id)}
                  style={{ textAlign: "left", width: "100%", border: "1px solid var(--border)", borderRadius: 12, padding: "11px 13px", background: "var(--surface, #fff)", cursor: "pointer", opacity: nodeActive(n) ? 1 : 0.3, borderColor: selected === n.id ? "var(--accent, #2563eb)" : "var(--border)", boxShadow: selected === n.id ? "0 0 0 3px rgba(37,99,235,0.12)" : "0 1px 2px rgba(16,24,40,0.05)" }}>
                  {ci > 0 && <span className="df-port in" aria-hidden />}
                  {ci < nCols - 1 && <span className="df-port out" aria-hidden />}
                  <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>{n.label}</div>
                  {n.sub && <div className="cell-sub" style={{ fontSize: 11.5, marginTop: 3 }}>{n.sub}{n.crossBorder ? " · outside India" : ""}</div>}
                  {n.finding && <span className="rchip amber-fill" style={{ marginTop: 8, fontSize: 10.5, padding: "2px 8px" }}>{n.finding}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailPanel({ node, flows, onClose, router }: { node: FlowNode; flows: Flow[]; onClose: () => void; router: ReturnType<typeof useRouter> }) {
  return (
    <aside className="df-detail" style={{ flex: "0 0 300px", borderLeft: "1px solid var(--border)", paddingLeft: 14, marginLeft: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <strong>{node.label}</strong>
        <button className="icon-btn" onClick={onClose}><X size={15} /></button>
      </div>
      <div className="stack" style={{ gap: 14 }}>
        {flows.map((f) => (
          <div key={f.id} className="stack" style={{ gap: 6 }}>
            <div className="cell-sub">{[f.principal, f.channel, f.noticeBasis, f.activity, ...f.systems.map((s) => s.name), ...f.recipients.map((r) => r.name)].join(" → ")}</div>
            {f.fields.length > 0 && <div className="cell-sub">Fields: {f.fields.slice(0, 6).join(", ")}{f.fields.length > 6 ? ` +${f.fields.length - 6}` : ""}</div>}
            {f.findings.filter((k) => k === "no_notice" || k === "undeclared" || k === "contract").length > 0 && (
              <div className="stack" style={{ gap: 4 }}>
                {f.noticeMissing && <div className="sev-warning">No notice — <Link href="/data-map/purposes" className="link-btn">Add to a notice →</Link></div>}
                {f.findings.includes("undeclared") && <div className="sev-warning">Undeclared channel ({f.channel}) — <Link href="/consent/platform" className="link-btn">Configure in Consent collection →</Link></div>}
                {f.systems.some((s) => s.contractExpired) && <div className="sev-warning">Contract expired — <Link href="/vendor-risk/register" className="link-btn">Renew in Vendor Risk →</Link></div>}
              </div>
            )}
            <button className="link-btn" onClick={() => router.push(`/data-map/processing-activities?activity=${f.activityId}`)}>Open activity →</button>
          </div>
        ))}
      </div>
    </aside>
  );
}

// --- Table ------------------------------------------------------------------
function TableView({ view }: { view: View }) {
  const csvHref = useMemo(() => {
    const rows = [["Principal", "Channel", "Notice / basis", "Activity", "Purpose", "System", "Shared with", "Location", "Findings"]];
    for (const f of view.flows) rows.push([f.principal, f.channel, f.noticeBasis, f.activity, f.purpose, f.systems.map((s) => s.name).join("; "), f.recipients.map((r) => r.name).join("; "), [...f.systems, ...f.recipients].map((s) => s.country).join("; "), f.findings.join("; ")]);
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  }, [view.flows]);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "flex-end" }}><a href={csvHref} download="data-flow.csv" className="btn sec sm">Export CSV <Download size={12} /></a></div>
      <div style={{ overflowX: "auto" }}>
        <table className="av-table">
          <thead><tr><th>Principal</th><th>Channel</th><th>Notice / basis</th><th>Activity</th><th>Purpose</th><th>System</th><th>Shared with</th><th>Location</th><th>Findings</th></tr></thead>
          <tbody>
            {view.flows.map((f) => (
              <tr key={f.id}>
                <td>{f.principal}</td><td>{f.channel}</td><td>{f.noticeBasis}</td><td className="av-name">{f.activity}</td><td className="cell-sub">{f.purpose}</td>
                <td className="cell-sub">{f.systems.map((s) => s.name).join(", ") || "—"}</td>
                <td className="cell-sub">{f.recipients.map((r) => r.name).join(", ") || "—"}</td>
                <td className="cell-sub">{[...new Set([...f.systems, ...f.recipients].map((s) => s.country))].join(", ")}</td>
                <td>{f.findings.length ? f.findings.map((k, i) => <span key={i} className="cell-sub">{i > 0 ? ", " : ""}{k.replace(/_/g, " ")}</span>) : <span className="cell-sub">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function plural(n: number, noun: string, pl?: string): string { return `${n} ${n === 1 ? noun : pl ?? `${noun}s`}`; }
