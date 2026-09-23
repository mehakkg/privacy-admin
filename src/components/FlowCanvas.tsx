"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pill, Chip } from "@/components/ui";
import { ActionError } from "@/components/actions";
import {
  addConnectionAction,
  flagFlowForReviewAction,
  linkDpiaAction,
} from "@/app/actions/dataflow";
import type { ActionResult } from "@/app/actions/requests";

export interface FlowNode {
  id: string;
  label: string;
  nodeType: "source" | "system" | "processor" | "touchpoint";
  subtitle: string | null;
  /** Real record data rendered inline in the drawer; null for unlinked nodes. */
  profile: Record<string, string> | null;
  /** Optional secondary "manage in full" link for out-of-drawer editing. */
  manage: { href: string; label: string } | null;
}
export interface FlowEdge {
  id: string;
  fromId: string;
  toId: string;
  categories: string[];
  purpose: string | null;
  dpiaRef: string | null;
  processorName: string | null;
  status: "documented" | "undisclosed";
  /** True when the connection lands with a processor in a cross-border,
   *  non-notified jurisdiction — a risk flag distinct from "undisclosed". */
  crossBorder?: boolean;
  manual: boolean;
}

/** Column per node type — a left-to-right flow reads better than a physics sim. */
const COLUMN: Record<FlowNode["nodeType"], number> = {
  touchpoint: 0,
  source: 1,
  system: 2,
  processor: 3,
};
const NODE_TONE: Record<FlowNode["nodeType"], string> = {
  touchpoint: "var(--purple)",
  source: "var(--blue)",
  system: "var(--green)",
  processor: "var(--orange)",
};
const NODE_LABEL: Record<FlowNode["nodeType"], string> = {
  touchpoint: "Data principal touchpoint",
  source: "Source",
  system: "Internal system",
  processor: "Data Processor",
};

const NW = 168;
const NH = 54;
const COL_W = 250;
const ROW_H = 96;

/**
 * Undirected reachable set from a starting node — the full multi-hop trace, not
 * just direct neighbours. Answers "which source, system and processor does this
 * touchpoint ultimately connect to" in one selection.
 */
function connectedComponent(startId: string, edges: FlowEdge[]) {
  const adj = new Map<string, { to: string; edgeId: string }[]>();
  const link = (a: string, b: string, id: string) => {
    const list = adj.get(a) ?? [];
    list.push({ to: b, edgeId: id });
    adj.set(a, list);
  };
  for (const e of edges) {
    link(e.fromId, e.toId, e.id);
    link(e.toId, e.fromId, e.id);
  }
  const nodeSet = new Set([startId]);
  const edgeSet = new Set<string>();
  const queue = [startId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const { to, edgeId } of adj.get(cur) ?? []) {
      edgeSet.add(edgeId);
      if (!nodeSet.has(to)) { nodeSet.add(to); queue.push(to); }
    }
  }
  return { nodeSet, edgeSet };
}

export function FlowCanvas({
  nodes,
  edges,
  dpias,
  categories,
  purposes,
}: {
  nodes: FlowNode[];
  edges: FlowEdge[];
  dpias: string[];
  categories: string[];
  purposes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [selected, setSelected] = useState<{ kind: "node" | "edge" | "add"; id: string } | null>(null);
  const [view, setView] = useState<"graph" | "table">("graph");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 20, y: 20 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  // Per-node stats shown on the card itself, so risk reads at a glance.
  const nodeStats = useMemo(() => {
    const m = new Map<string, { flows: number; undisclosed: number }>();
    for (const n of nodes) m.set(n.id, { flows: 0, undisclosed: 0 });
    for (const e of edges) {
      for (const id of [e.fromId, e.toId]) {
        const s = m.get(id);
        if (!s) continue;
        s.flows += 1;
        if (e.status === "undisclosed") s.undisclosed += 1;
      }
    }
    return m;
  }, [nodes, edges]);

  // The highlighted path for the current selection: the whole component for a
  // node, the two endpoints for an edge. null → nothing dimmed.
  const highlight = useMemo(() => {
    if (!selected) return null;
    if (selected.kind === "node") return connectedComponent(selected.id, edges);
    if (selected.kind === "edge") {
      const e = edges.find((x) => x.id === selected.id);
      if (!e) return null;
      return { nodeSet: new Set([e.fromId, e.toId]), edgeSet: new Set([e.id]) };
    }
    return null;
  }, [selected, edges]);
  const nodeDim = (id: string) => (highlight && !highlight.nodeSet.has(id) ? 0.3 : 1);
  const edgeDim = (id: string) => (highlight && !highlight.edgeSet.has(id) ? 0.18 : 1);
  const onPath = (id: string) => Boolean(highlight?.nodeSet.has(id));

  const undisclosedEdges = useMemo(() => edges.filter((e) => e.status === "undisclosed"), [edges]);

  // Deterministic layout: place each node in its type's column, stacked by order.
  const positions = useMemo(() => {
    const perCol: Record<number, number> = {};
    const map = new Map<string, { x: number; y: number }>();
    for (const n of nodes) {
      const col = COLUMN[n.nodeType];
      const row = perCol[col] ?? 0;
      perCol[col] = row + 1;
      map.set(n.id, { x: col * COL_W + 30, y: row * ROW_H + 30 });
    }
    return map;
  }, [nodes]);

  const rows = Math.max(1, ...Array.from(new Set(nodes.map((n) => COLUMN[n.nodeType]))).map((c) => nodes.filter((n) => COLUMN[n.nodeType] === c).length));
  const canvasH = rows * ROW_H + 60;

  const run = (op: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await op();
      setResult(r);
      if (r.ok) {
        setSelected(null);
        router.refresh();
      }
    });

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(2, Math.max(0.4, z - e.deltaY * 0.001)));
  };
  const onDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".flow-node, .flow-edge-hit")) return;
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) });
  };
  const onUp = () => (drag.current = null);

  const selNode = selected?.kind === "node" ? nodes.find((n) => n.id === selected.id) ?? null : null;
  const selEdge = selected?.kind === "edge" ? edges.find((e) => e.id === selected.id) ?? null : null;

  if (nodes.length === 0) {
    return (
      <div className="flow-empty">
        <p style={{ margin: "0 0 12px", fontWeight: 500 }}>Nothing to map yet.</p>
        <p className="cell-sub" style={{ margin: "0 0 14px" }}>
          Connect a source or integration and it appears here automatically.
        </p>
        <Link href="/discovery/sources" className="btn primary">
          Connect a source
        </Link>
      </div>
    );
  }

  return (
    <div className="flow-wrap">
      <div className="flow-toolbar">
        {view === "graph" ? (
          <div className="flow-legend">
            {(Object.keys(NODE_LABEL) as FlowNode["nodeType"][]).map((t) => (
              <span key={t} className="flow-legend-item">
                <span className="flow-legend-dot" style={{ background: NODE_TONE[t] }} />
                {NODE_LABEL[t]}
              </span>
            ))}
            <span className="flow-legend-item">
              <span className="flow-legend-line undisclosed" /> Undisclosed
            </span>
          </div>
        ) : (
          <span className="cell-sub">{edges.length} flow{edges.length === 1 ? "" : "s"} · click a row to inspect</span>
        )}
        <div className="row" style={{ gap: 6 }}>
          <div className="seg-toggle" role="tablist" aria-label="View">
            <button className={`seg-btn${view === "graph" ? " active" : ""}`} onClick={() => setView("graph")}>Graph</button>
            <button className={`seg-btn${view === "table" ? " active" : ""}`} onClick={() => setView("table")}>Table</button>
          </div>
          {view === "graph" && (
            <>
              <button className="btn xs" onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}>−</button>
              <button className="btn xs" onClick={() => setZoom((z) => Math.min(2, z + 0.15))}>+</button>
            </>
          )}
          <button className="btn sm" onClick={() => setSelected({ kind: "add", id: "" })}>
            + Add connection
          </button>
        </div>
      </div>

      {undisclosedEdges.length > 0 && (
        <div className="flow-alert-rail">
          <span className="flow-alert-label">
            {undisclosedEdges.length} undisclosed transfer{undisclosedEdges.length === 1 ? "" : "s"} — no purpose or DPIA:
          </span>
          {undisclosedEdges.map((e) => {
            const from = nodes.find((n) => n.id === e.fromId);
            const to = nodes.find((n) => n.id === e.toId);
            return (
              <button
                key={e.id}
                className={`flow-alert-chip${selected?.kind === "edge" && selected.id === e.id ? " active" : ""}`}
                onClick={() => setSelected({ kind: "edge", id: e.id })}
              >
                {from?.label ?? "?"} → {to?.label ?? "?"}
              </button>
            );
          })}
        </div>
      )}

      <div className="flow-canvas-row">
        {view === "graph" && (
        <div
          className="flow-canvas"
          onWheel={onWheel}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
        >
          <svg width="100%" height={Math.max(canvasH * zoom + 40, 560)} style={{ display: "block" }}>
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {edges.map((e) => {
                const a = positions.get(e.fromId);
                const b = positions.get(e.toId);
                if (!a || !b) return null;
                const x1 = a.x + NW;
                const y1 = a.y + NH / 2;
                const x2 = b.x;
                const y2 = b.y + NH / 2;
                const mx = (x1 + x2) / 2;
                const und = e.status === "undisclosed";
                const xb = !und && e.crossBorder;
                const lit = onPath(e.fromId) && onPath(e.toId) && (!highlight || highlight.edgeSet.has(e.id));
                return (
                  <g key={e.id} className="flow-edge-hit" opacity={edgeDim(e.id)} onClick={() => setSelected({ kind: "edge", id: e.id })} style={{ cursor: "pointer" }}>
                    <path
                      d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke={und ? "var(--red)" : xb ? "var(--yellow)" : "var(--border-strong)"}
                      strokeWidth={und ? 2.2 : xb ? 2.2 : lit ? 2.4 : 1.6}
                      strokeDasharray={und || xb ? "7 5" : undefined}
                    />
                    {/* fat invisible hit line */}
                    <path
                      d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                    />
                  </g>
                );
              })}

              {nodes.map((n) => {
                const p = positions.get(n.id)!;
                const isTouch = n.nodeType === "touchpoint";
                const stat = nodeStats.get(n.id) ?? { flows: 0, undisclosed: 0 };
                const lit = onPath(n.id);
                const isSel = selected?.kind === "node" && selected.id === n.id;
                return (
                  <g
                    key={n.id}
                    className="flow-node"
                    transform={`translate(${p.x},${p.y})`}
                    opacity={nodeDim(n.id)}
                    onClick={() => setSelected({ kind: "node", id: n.id })}
                    style={{ cursor: "pointer" }}
                  >
                    {/* path ring in the node's own type colour — no new palette */}
                    {lit && highlight && (
                      <rect
                        x={-3} y={-3} width={NW + 6} height={NH + 6}
                        rx={isTouch ? (NH + 6) / 2 : 11}
                        fill="none" stroke={NODE_TONE[n.nodeType]} strokeWidth={1.5} opacity={0.4}
                      />
                    )}
                    <rect
                      width={NW}
                      height={NH}
                      rx={isTouch ? NH / 2 : 8}
                      fill="var(--bg)"
                      stroke={NODE_TONE[n.nodeType]}
                      strokeWidth={isSel ? 2.5 : 1.5}
                    />
                    <rect width={5} height={NH} rx={2} fill={NODE_TONE[n.nodeType]} />
                    <text x={16} y={22} fontSize={12.5} fontWeight={600} fill="var(--text)">
                      {n.label.length > 18 ? n.label.slice(0, 17) + "…" : n.label}
                    </text>
                    <text x={16} y={39} fontSize={10.5} fill="var(--text-3)">
                      {(n.subtitle ?? "").slice(0, 22)}
                    </text>
                    {/* stat badges — flow count, and undisclosed count if any */}
                    <text x={NW - 10} y={20} fontSize={10} textAnchor="end" fill="var(--text-3)" className="mono">
                      {stat.flows} flow{stat.flows === 1 ? "" : "s"}
                    </text>
                    {stat.undisclosed > 0 && (
                      <text x={NW - 10} y={34} fontSize={10} textAnchor="end" fill="var(--red)" fontWeight={700} className="mono">
                        {stat.undisclosed} undisclosed
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
        )}

        {view === "table" && (
          <div className="flow-table-wrap">
            <table className="dtable">
              <thead>
                <tr><th>From</th><th>To</th><th>Categories</th><th>Purpose</th><th>DPIA</th><th>Processor</th><th>Status</th></tr>
              </thead>
              <tbody>
                {edges.map((e) => {
                  const from = nodes.find((n) => n.id === e.fromId);
                  const to = nodes.find((n) => n.id === e.toId);
                  const isSel = selected?.kind === "edge" && selected.id === e.id;
                  return (
                    <tr key={e.id} className={`clickable${isSel ? " row-selected" : ""}`} onClick={() => setSelected({ kind: "edge", id: e.id })}>
                      <td className="cell-primary">{from?.label ?? "—"}</td>
                      <td>{to?.label ?? "—"}</td>
                      <td>
                        <span className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                          {e.categories.length ? e.categories.map((c) => <code key={c} className="field-chip">{c}</code>) : <span className="muted">—</span>}
                        </span>
                      </td>
                      <td>{e.purpose ? <Chip>{e.purpose}</Chip> : <span className="muted">—</span>}</td>
                      <td className="mono cell-sub">{e.dpiaRef ?? "—"}</td>
                      <td className="cell-sub">{e.processorName ?? "—"}</td>
                      <td>{e.status === "undisclosed" ? <Pill tone="red">Undisclosed</Pill> : <Pill tone="green" dot={false}>Documented</Pill>}</td>
                    </tr>
                  );
                })}
                {edges.length === 0 && (
                  <tr><td colSpan={7}><div className="empty"><p style={{ margin: 0 }}>No flows match these filters.</p></div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {selected && (
          <aside className="flow-drawer">
            {selNode && (
              <div className="stack" style={{ gap: 12 }}>
                <div>
                  <Pill tone="gray" dot={false}>{NODE_LABEL[selNode.nodeType]}</Pill>
                  <h3 style={{ margin: "8px 0 2px", fontSize: 15 }}>{selNode.label}</h3>
                  <div className="cell-sub">{selNode.subtitle}</div>
                </div>
                {selNode.profile && (
                  <div>
                    <div className="section-label">Profile</div>
                    <dl className="flow-profile">
                      {Object.entries(selNode.profile).map(([k, v]) => (
                        <div key={k} style={{ display: "contents" }}>
                          <dt>{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
                <div>
                  <div className="section-label">Flows</div>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {edges.filter((e) => e.fromId === selNode.id || e.toId === selNode.id).map((e) => {
                      const other = e.fromId === selNode.id ? e.toId : e.fromId;
                      const on = nodes.find((n) => n.id === other);
                      return (
                        <li key={e.id} className="cell-sub" style={{ marginBottom: 2 }}>
                          {e.fromId === selNode.id ? "→ " : "← "}
                          {on?.label}
                          {e.status === "undisclosed" && <Pill tone="red">undisclosed</Pill>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                {selNode.manage && (
                  <Link href={selNode.manage.href} className="row-link" style={{ fontSize: 12.5 }}>
                    {selNode.manage.label}
                  </Link>
                )}
                <button className="btn ghost sm" onClick={() => setSelected(null)}>Close</button>
              </div>
            )}

            {selEdge && (
              <EdgeDrawer
                edge={selEdge}
                nodes={nodes}
                dpias={dpias}
                pending={pending}
                onLinkDpia={(ref) => run(() => linkDpiaAction(selEdge.id, ref))}
                onFlag={(fromL, toL) => run(() => flagFlowForReviewAction(selEdge.id, fromL, toL))}
                onClose={() => setSelected(null)}
              />
            )}

            {selected.kind === "add" && (
              <AddConnectionForm
                nodes={nodes}
                categories={categories}
                purposes={purposes}
                pending={pending}
                onAdd={(from, to, cat, pur) => run(() => addConnectionAction(from, to, cat, pur))}
                onClose={() => setSelected(null)}
              />
            )}
            <ActionError result={result} />
          </aside>
        )}
      </div>
    </div>
  );
}

function EdgeDrawer({
  edge,
  nodes,
  dpias,
  pending,
  onLinkDpia,
  onFlag,
  onClose,
}: {
  edge: FlowEdge;
  nodes: FlowNode[];
  dpias: string[];
  pending: boolean;
  onLinkDpia: (ref: string) => void;
  onFlag: (fromLabel: string, toLabel: string) => void;
  onClose: () => void;
}) {
  const from = nodes.find((n) => n.id === edge.fromId);
  const to = nodes.find((n) => n.id === edge.toId);
  const [dpia, setDpia] = useState(dpias[0] ?? "");

  return (
    <div className="stack" style={{ gap: 12 }}>
      <h3 style={{ margin: 0, fontSize: 15 }}>
        {from?.label} → {to?.label}
      </h3>

      {edge.status === "undisclosed" && (
        <div className="notice danger">
          <div className="notice-title">No purpose or DPIA is linked to this flow.</div>
          <div>
            Detected from recent transfer activity. It needs a purpose and DPIA,
            or a review.
          </div>
        </div>
      )}

      <div>
        <div className="section-label">Data category</div>
        <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
          {edge.categories.length ? edge.categories.map((c) => <code key={c} className="field-chip">{c}</code>) : <span className="muted">—</span>}
        </div>
      </div>
      <div>
        <div className="section-label">Purpose</div>
        {edge.purpose ? (
          <span className="row" style={{ gap: 5 }}>
            <Pill tone="blue">{edge.purpose}</Pill>
            <span className="lock-mark"><span aria-hidden>🔒</span> policy</span>
          </span>
        ) : (
          <Pill tone="red">None</Pill>
        )}
      </div>
      <div>
        <div className="section-label">Linked DPIA</div>
        {edge.dpiaRef ? <span className="mono cell-sub">{edge.dpiaRef}</span> : <span className="muted">None</span>}
      </div>
      {edge.processorName && (
        <div>
          <div className="section-label">Data Processor</div>
          <span className="cell-sub">{edge.processorName}</span>
        </div>
      )}

      {edge.status === "undisclosed" && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 6 }}>
            <select className="input sm" value={dpia} onChange={(e) => setDpia(e.target.value)}>
              {dpias.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <button className="btn sm" disabled={pending || !dpia} onClick={() => onLinkDpia(dpia)}>
              Link existing DPIA
            </button>
          </div>
          <button
            className="btn danger sm"
            disabled={pending}
            onClick={() => onFlag(from?.label ?? "", to?.label ?? "")}
          >
            Flag for DPO review
          </button>
        </div>
      )}

      <button className="btn ghost sm" onClick={onClose}>Close</button>
    </div>
  );
}

function AddConnectionForm({
  nodes,
  categories,
  purposes,
  pending,
  onAdd,
  onClose,
}: {
  nodes: FlowNode[];
  categories: string[];
  purposes: { id: string; name: string }[];
  pending: boolean;
  onAdd: (from: string, to: string, cat: string, purposeId: string | null) => void;
  onClose: () => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cat, setCat] = useState("");
  const [pur, setPur] = useState("");

  return (
    <div className="stack" style={{ gap: 10 }}>
      <h3 style={{ margin: 0, fontSize: 15 }}>Add a connection</h3>
      <p className="cell-sub" style={{ margin: 0 }}>
        For a real data movement the system can&apos;t infer from a live
        integration — a manual periodic export, say.
      </p>
      <div>
        <div className="section-label">From</div>
        <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="">—</option>
          {nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
        </select>
      </div>
      <div>
        <div className="section-label">To</div>
        <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">—</option>
          {nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
        </select>
      </div>
      <div>
        <div className="section-label">Data category</div>
        <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">—</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <div className="section-label">Purpose</div>
        <select className="input" value={pur} onChange={(e) => setPur(e.target.value)}>
          <option value="">— none (will show as undisclosed) —</option>
          {purposes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary sm" disabled={pending || !from || !to} onClick={() => onAdd(from, to, cat, pur || null)}>
          Add connection
        </button>
        <button className="btn ghost sm" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
