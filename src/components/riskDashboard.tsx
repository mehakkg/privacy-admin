"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { Lock, ArrowUp, ArrowDown, ArrowRight } from "lucide-react";
import { Pill } from "@/components/ui";
import type { PillTone } from "@/components/ui";

export interface Metric {
  key: string;
  label: string;
  kind: "score" | "count" | "ratio";
  value: number;
  display: string;
  band?: "teal" | "amber" | "red";
  /** Typography variant for the value. Omitted → auto-detected from the display
   *  string (bare number / fraction / percent → kpi; sentence-length → status). */
  variant?: "kpi" | "status";
  trend?: { dir: "up" | "down" | "flat"; from?: number };
  sparkline?: number[];
  link: string | null;
  linkLabel?: string;
  freshness: {
    asOf: string;
    status: "fresh" | "stale" | "disconnected";
    label: string;
    sourceName?: string;
    sourceLink?: string;
  };
}
export interface Journey {
  name: string;
  score: number;
  band: "teal" | "amber" | "red";
  trend: "up" | "down" | "flat";
  primaryRisk: string | null;
  factors: { label: string; link: string }[];
}
interface ExportRow {
  endpoint: string;
  metrics: string;
  frequency: string;
  status: string;
  lastTest: string | null;
}

const BAND_COLOR: Record<string, string> = {
  teal: "var(--green)",
  amber: "var(--yellow)",
  red: "var(--red)",
};
const BAND_TONE: Record<string, PillTone> = { teal: "green", amber: "yellow", red: "red" };

const HIDE_KEY = "analytics.hidden";
const ORDER_KEY = "analytics.order";
const EXPORT_KEY = "analytics.exports";

const DEFAULT_EXPORTS: ExportRow[] = [
  {
    endpoint: "Meridian Compliance BI (Power BI)",
    metrics: "All dashboard metrics",
    frequency: "Daily",
    status: "Active",
    lastTest: "Succeeded",
  },
];

function trendGlyph(dir?: string) {
  if (dir === "up") return <span style={{ color: "var(--green)" }}>↑</span>;
  if (dir === "down") return <span style={{ color: "var(--red)" }}>↓</span>;
  return <span className="cell-sub">→</span>;
}

function Sparkline({ series, color }: { series: number[]; color: string }) {
  if (series.length < 2) return null;
  const w = 96;
  const h = 28;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const pts = series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * w;
      const y = h - ((v - min) / span) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }} aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function RiskDashboard({
  metrics,
  journeys,
  thresholds,
  thresholdOwner,
  range,
}: {
  metrics: Metric[];
  journeys: Journey[];
  thresholds: { metric: string; bands: string }[];
  thresholdOwner: string;
  range: string;
}) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [order, setOrder] = useState<string[]>(metrics.map((m) => m.key));
  const [configureOpen, setConfigureOpen] = useState(false);
  const [detail, setDetail] = useState<Metric | null>(null);
  const [journeysOpen, setJourneysOpen] = useState(true);
  const [expandedJourney, setExpandedJourney] = useState<string | null>(null);
  const [exports, setExports] = useState<ExportRow[]>(DEFAULT_EXPORTS);

  useEffect(() => {
    try {
      const h = JSON.parse(localStorage.getItem(HIDE_KEY) ?? "[]");
      if (Array.isArray(h)) setHidden(h);
      const o = JSON.parse(localStorage.getItem(ORDER_KEY) ?? "null");
      if (Array.isArray(o) && o.length) setOrder(o);
      const e = JSON.parse(localStorage.getItem(EXPORT_KEY) ?? "null");
      if (Array.isArray(e)) setExports(e);
    } catch {
      /* storage blocked — defaults */
    }
  }, []);

  const persist = (key: string, val: unknown) => {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {
      /* ignore */
    }
  };

  const toggleHidden = (k: string) => {
    setHidden((prev) => {
      const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k];
      persist(HIDE_KEY, next);
      return next;
    });
  };
  const move = (k: string, dir: -1 | 1) => {
    setOrder((prev) => {
      const idx = prev.indexOf(k);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      persist(ORDER_KEY, next);
      return next;
    });
  };

  const byKey = new Map(metrics.map((m) => [m.key, m]));
  const ordered = order.map((k) => byKey.get(k)).filter(Boolean) as Metric[];
  // include any metric missing from a stale saved order
  for (const m of metrics) if (!order.includes(m.key)) ordered.push(m);
  const visible = ordered.filter((m) => !hidden.includes(m.key));

  return (
    <div>
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn sm" onClick={() => setConfigureOpen(true)}>
          Configure
        </button>
      </div>

      <div className="metric-grid">
        {visible.map((m) => (
          <MetricCard key={m.key} m={m} onOpen={() => !m.link && setDetail(m)} />
        ))}
      </div>

      {/* Journey breakdown */}
      <div className="card" style={{ marginTop: 20 }}>
        <button
          className="card-head"
          style={{ width: "100%", background: "none", border: 0, cursor: "pointer", textAlign: "left" }}
          onClick={() => setJourneysOpen((v) => !v)}
        >
          <h2 className="card-title">Compliance score by digital journey {journeysOpen ? "▾" : "▸"}</h2>
        </button>
        {journeysOpen && (
          <div className="card-body">
            <div className="table-wrap">
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Journey</th>
                    <th style={{ width: 90 }}>Score</th>
                    <th style={{ width: 70 }}>Trend</th>
                    <th>Primary risk factor</th>
                  </tr>
                </thead>
                <tbody>
                  {journeys.map((j) => (
                    <Fragment key={j.name}>
                      <tr
                        style={{ cursor: j.factors.length ? "pointer" : "default" }}
                        onClick={() => j.factors.length && setExpandedJourney((v) => (v === j.name ? null : j.name))}
                      >
                        <td className="cell-primary">
                          {j.factors.length ? (expandedJourney === j.name ? "▾ " : "▸ ") : ""}
                          {j.name}
                        </td>
                        <td>
                          <Pill tone={BAND_TONE[j.band]} dot={false}>{j.score}</Pill>
                        </td>
                        <td>{trendGlyph(j.trend)}</td>
                        <td className="cell-sub">{j.primaryRisk ?? "—"}</td>
                      </tr>
                      {expandedJourney === j.name && j.factors.length > 0 && (
                        <tr>
                          <td colSpan={4} style={{ background: "var(--bg-subtle, #fafafa)" }}>
                            <div className="section-label">What&rsquo;s dragging this journey&rsquo;s score</div>
                            <div className="stack" style={{ gap: 4 }}>
                              {j.factors.map((f) => (
                                <Link key={f.label} href={f.link} className="row" style={{ gap: 6 }}>
                                  <ArrowRight size={13} />
                                  <span>{f.label}</span>
                                </Link>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Configure drawer */}
      {configureOpen && (
        <Drawer title="Configure dashboard" onClose={() => setConfigureOpen(false)}>
          <ConfigureBody
            metrics={ordered}
            hidden={hidden}
            onToggle={toggleHidden}
            onMove={move}
            thresholds={thresholds}
            thresholdOwner={thresholdOwner}
            exports={exports}
            setExports={(rows) => {
              setExports(rows);
              persist(EXPORT_KEY, rows);
            }}
          />
        </Drawer>
      )}

      {/* Metric detail drawer (compliance score) */}
      {detail && (
        <Drawer title={detail.label} onClose={() => setDetail(null)}>
          <MetricDetail m={detail} range={range} />
        </Drawer>
      )}
    </div>
  );
}

/** KPI (short number/fraction/percent) vs status-summary (sentence). Explicit
 *  `variant` wins; otherwise auto-detect — we err toward "status" for anything
 *  that isn't clearly a short numeric, since guessing "kpi" wrong is the bug. */
function isKpiValue(m: Metric): boolean {
  if (m.variant) return m.variant === "kpi";
  const t = m.display.trim();
  return /^[\d.,]+%?$/.test(t) || /^\d+\s*(?:of|\/)\s*\d+/i.test(t) || t.length <= 6;
}

function MetricCard({ m, onOpen }: { m: Metric; onOpen: () => void }) {
  const disconnected = m.freshness.status === "disconnected";
  const stale = m.freshness.status === "stale";
  const kpi = isKpiValue(m);

  const inner = (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <span className="metric-label">{m.label}</span>
        {m.trend && !disconnected && <span className="metric-trend">{trendGlyph(m.trend.dir)}</span>}
      </div>

      {disconnected ? (
        <div className="metric-disconnected">
          <div className="metric-unable">Unable to compute</div>
          <div className="cell-sub">{m.freshness.sourceName} is disconnected.</div>
          {m.freshness.sourceLink && (
            <Link href={m.freshness.sourceLink} className="row-link" onClick={(e) => e.stopPropagation()}>
              Fix in Health Monitoring →
            </Link>
          )}
        </div>
      ) : (
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", gap: 8 }}>
          <div
            className={`metric-value ${kpi ? "kpi" : "status"}`}
            style={{ color: m.band ? BAND_COLOR[m.band] : undefined }}
          >
            {m.display}
          </div>
          {m.sparkline && <Sparkline series={m.sparkline} color={m.band ? BAND_COLOR[m.band] : "var(--accent)"} />}
        </div>
      )}

      {m.trend?.from !== undefined && !disconnected && (
        <div className="cell-sub" style={{ marginTop: 2 }}>
          {m.trend.dir === "down" ? "Down" : m.trend.dir === "up" ? "Up" : "Flat"} from {m.trend.from} over 30 days
        </div>
      )}

      <div className={`metric-freshness ${stale ? "stale" : disconnected ? "disc" : ""}`}>
        {stale && "⚠ "}
        {m.freshness.label}
      </div>

      {m.link && !disconnected && (
        <div className="metric-link">{m.linkLabel ?? "View"} →</div>
      )}
    </>
  );

  if (m.link && !disconnected) {
    return (
      <Link href={m.link} className="metric-card linkable">
        {inner}
      </Link>
    );
  }
  return (
    <div
      className={`metric-card ${!m.link && !disconnected ? "linkable" : ""}`}
      onClick={!m.link && !disconnected ? onOpen : undefined}
      role={!m.link && !disconnected ? "button" : undefined}
    >
      {inner}
    </div>
  );
}

function MetricDetail({ m, range }: { m: Metric; range: string }) {
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div>
        <div className="metric-value" style={{ color: m.band ? BAND_COLOR[m.band] : undefined }}>{m.display}</div>
        {m.trend?.from !== undefined && (
          <div className="cell-sub">
            {m.trend.dir === "down" ? "Down" : "Up"} from {m.trend.from} · last {range} days
          </div>
        )}
      </div>
      {m.sparkline && (
        <div>
          <div className="section-label">Trend</div>
          <div style={{ transform: "scale(2.2)", transformOrigin: "left center", height: 60, marginTop: 20 }}>
            <Sparkline series={m.sparkline} color={m.band ? BAND_COLOR[m.band] : "var(--accent)"} />
          </div>
        </div>
      )}
      <div>
        <div className="section-label">Contributing metrics that moved it</div>
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          <li className="cell-sub">Open requests at risk — dragging the score down</li>
          <li className="cell-sub">Escalations aged past threshold — small negative contribution</li>
          <li className="cell-sub">Processor health — one processor unreachable</li>
          <li className="cell-sub">RBAC drift — significant drift on one role</li>
        </ul>
        <p className="cell-sub" style={{ marginTop: 8 }}>
          The colour band (Healthy / At risk / Critical) is set by your DPO in the
          Governance Portal — shown here as applied colour, not editable.
        </p>
      </div>
    </div>
  );
}

function ConfigureBody({
  metrics,
  hidden,
  onToggle,
  onMove,
  thresholds,
  thresholdOwner,
  exports,
  setExports,
}: {
  metrics: Metric[];
  hidden: string[];
  onToggle: (k: string) => void;
  onMove: (k: string, dir: -1 | 1) => void;
  thresholds: { metric: string; bands: string }[];
  thresholdOwner: string;
  exports: ExportRow[];
  setExports: (rows: ExportRow[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ endpoint: "", frequency: "Daily" });

  return (
    <div className="stack" style={{ gap: 22 }}>
      {/* Metrics checklist */}
      <div>
        <div className="section-label">Metrics shown on dashboard</div>
        <p className="cell-sub" style={{ margin: "0 0 8px" }}>
          Arrange what displays. This is the whole of &ldquo;configuration&rdquo; here — you
          are not connecting new data; every metric already computes from the platform.
        </p>
        <div className="stack" style={{ gap: 4 }}>
          {metrics.map((m, i) => (
            <div key={m.key} className="row" style={{ gap: 8, justifyContent: "space-between" }}>
              <label className="row" style={{ gap: 8 }}>
                <input type="checkbox" checked={!hidden.includes(m.key)} onChange={() => onToggle(m.key)} />
                <span>{m.label}</span>
              </label>
              <span className="row" style={{ gap: 2 }}>
                <button className="btn xs ghost" disabled={i === 0} onClick={() => onMove(m.key, -1)} aria-label="Move up">
                  <ArrowUp size={13} />
                </button>
                <button
                  className="btn xs ghost"
                  disabled={i === metrics.length - 1}
                  onClick={() => onMove(m.key, 1)}
                  aria-label="Move down"
                >
                  <ArrowDown size={13} />
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Thresholds — policy-locked */}
      <div>
        <div className="row" style={{ gap: 6 }}>
          <Lock size={13} />
          <div className="section-label" style={{ margin: 0 }}>Thresholds</div>
        </div>
        <div className="notice policy compact" style={{ marginTop: 6 }}>
          <span>Set by {thresholdOwner} — managed in the Governance Portal. Read-only here.</span>
        </div>
        <div className="stack" style={{ gap: 4, marginTop: 8 }}>
          {thresholds.map((t) => (
            <div key={t.metric} className="row" style={{ gap: 8, justifyContent: "space-between" }}>
              <span className="locked-cell"><Lock size={11} />{t.metric}</span>
              <span className="cell-sub mono" style={{ textAlign: "right" }}>{t.bands}</span>
            </div>
          ))}
        </div>
      </div>

      {/* External export */}
      <div>
        <div className="section-label">External export</div>
        <p className="cell-sub" style={{ margin: "0 0 8px" }}>
          Pipe this dashboard&apos;s data into your own BI tooling. Distinct from how the
          dashboard computes its numbers.
        </p>
        <div className="table-wrap">
          <table className="dtable">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Metrics</th>
                <th>Frequency</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {exports.map((e, i) => (
                <tr key={i}>
                  <td className="cell-primary">{e.endpoint}</td>
                  <td className="cell-sub">{e.metrics}</td>
                  <td className="cell-sub">{e.frequency}</td>
                  <td>
                    <Pill tone={e.status === "Active" ? "green" : "gray"}>{e.status}</Pill>
                  </td>
                  <td>
                    <button
                      className="btn xs"
                      onClick={() => {
                        const next = [...exports];
                        next[i] = { ...e, lastTest: "Succeeded" };
                        setExports(next);
                      }}
                    >
                      {e.lastTest ? `Test · ${e.lastTest}` : "Test"}
                    </button>
                  </td>
                </tr>
              ))}
              {adding && (
                <tr className="pa-unsaved">
                  <td>
                    <input
                      className="pa-input"
                      placeholder="https://bi.example.com/ingest"
                      value={draft.endpoint}
                      onChange={(e) => setDraft({ ...draft, endpoint: e.target.value })}
                    />
                  </td>
                  <td className="cell-sub">All dashboard metrics</td>
                  <td>
                    <select
                      className="pa-input"
                      value={draft.frequency}
                      onChange={(e) => setDraft({ ...draft, frequency: e.target.value })}
                    >
                      <option>Hourly</option>
                      <option>Daily</option>
                      <option>Weekly</option>
                    </select>
                  </td>
                  <td><Pill tone="gray">Draft</Pill></td>
                  <td>
                    <button
                      className="btn xs primary"
                      disabled={!draft.endpoint.trim()}
                      onClick={() => {
                        setExports([
                          ...exports,
                          { endpoint: draft.endpoint.trim(), metrics: "All dashboard metrics", frequency: draft.frequency, status: "Active", lastTest: null },
                        ]);
                        setDraft({ endpoint: "", frequency: "Daily" });
                        setAdding(false);
                      }}
                    >
                      Save
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!adding && (
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => setAdding(true)}>+ Add export</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h3 style={{ margin: 0, fontSize: 15 }}>{title}</h3>
          <button className="btn xs ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="drawer-body">{children}</div>
      </div>
    </div>
  );
}
