"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, RefreshCw } from "lucide-react";
import { Pill, Chip } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { refreshRopaSuggestionsAction, acceptRopaSuggestionAction, dismissRopaSuggestionAction } from "@/app/actions/ropa";
import type { ActionResult } from "@/app/actions/requests";

export interface RopaField { path: string; type: string; sensitivity: string }
export interface RopaRow {
  id: string;
  sourceName: string;
  purposeName: string | null;
  subjectType: string | null;
  fieldCount: number;
  generated: string;
  status: string;
  dismissedReason: string | null;
  activityId: string | null;
  confidence: string;
  fields: RopaField[];
}

const CONF_TONE: Record<string, "green" | "yellow" | "gray"> = { high: "green", medium: "yellow", low: "gray" };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });
  return { pending, result, run };
}

export function RopaRecommendations({ rows, tab }: { rows: RopaRow[]; tab: string }) {
  const { pending, result, run } = useRun();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((r) => r.id === openId) ?? null;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <span className="cell-sub">{rows.length} {tab} suggestion{rows.length === 1 ? "" : "s"} · generated from approved Discovery classifications, grouped by source · purpose · subject type.</span>
        <button className="btn ghost sm" disabled={pending} onClick={() => run(() => refreshRopaSuggestionsAction())}><RefreshCw size={13} /> Refresh recommendations</button>
      </div>

      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr><th>Source</th><th>Confidence</th><th>Purpose</th><th>Subject type</th><th>Fields</th><th>Generated</th>{tab !== "pending" && <th>{tab === "accepted" ? "Register entry" : "Reason"}</th>}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="clickable ropa-suggestion-row" onClick={() => setOpenId(r.id)}>
                <td>
                  <div className="cell-stack">
                    <span className="cell-primary">{r.sourceName}</span>
                    <Pill tone="purple" dot={false}>Suggested</Pill>
                  </div>
                </td>
                <td><Pill tone={CONF_TONE[r.confidence] ?? "gray"} dot={false}>{r.confidence}</Pill></td>
                <td>{r.purposeName ? <Chip>{r.purposeName}</Chip> : <Pill tone="yellow">Unassigned — needs DPO tagging</Pill>}</td>
                <td>{r.subjectType ? <Chip>{r.subjectType}</Chip> : <span className="muted">—</span>}</td>
                <td className="cell-sub">{r.fieldCount}</td>
                <td className="cell-sub">{r.generated}</td>
                {tab !== "pending" && (
                  <td className="cell-sub">
                    {tab === "accepted"
                      ? (r.activityId ? <Link href="/data-map/processing-activities" className="row-link">In register →</Link> : "—")
                      : (r.dismissedReason ?? "—")}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={tab === "pending" ? 6 : 7}><div className="empty">
                {tab === "pending" ? (
                  <>
                    <p style={{ margin: "0 0 12px" }}>No pending suggestions. Refresh to regenerate from the latest approved classifications.</p>
                    <button className="btn primary sm" disabled={pending} onClick={() => run(() => refreshRopaSuggestionsAction())}>Refresh recommendations</button>
                  </>
                ) : <p style={{ margin: 0 }}>Nothing {tab} yet.</p>}
              </div></td></tr>
            )}
          </tbody>
        </table>
      </div>
      {result && !result.ok && <ActionError result={result} />}

      {open && <RopaDrawer r={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function RopaDrawer({ r, onClose }: { r: RopaRow; onClose: () => void }) {
  const { pending, result, run } = useRun();
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer-panel" style={{ background: "var(--bg)", width: "min(560px, 94vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head drawer-sticky">
          <div className="row" style={{ gap: 8 }}>
            <strong>{r.sourceName}</strong>
            {r.purposeName ? <Chip>{r.purposeName}</Chip> : <Pill tone="yellow">Unassigned purpose</Pill>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="drawer-body">
          <h3 className="drawer-section first">Suggested processing activity</h3>
          <dl className="kv">
            <div style={{ display: "contents" }}><dt>Source</dt><dd>{r.sourceName}</dd></div>
            <div style={{ display: "contents" }}><dt>Purpose</dt><dd>{r.purposeName ?? "Unassigned — needs DPO tagging"}</dd></div>
            <div style={{ display: "contents" }}><dt>Subject type</dt><dd style={{ textTransform: "capitalize" }}>{r.subjectType ?? "—"}</dd></div>
            <div style={{ display: "contents" }}><dt>Generated</dt><dd>{r.generated}</dd></div>
          </dl>

          <h3 className="drawer-section">Fields in this grouping ({r.fields.length})</h3>
          <div className="table-wrap">
            <table className="dtable">
              <thead><tr><th>Field</th><th>Detected type</th><th>Sensitivity</th></tr></thead>
              <tbody>
                {r.fields.map((f, i) => (
                  <tr key={i}><td className="mono cell-sub">{f.path}</td><td className="cell-sub">{f.type}</td><td className="cell-sub" style={{ textTransform: "capitalize" }}>{f.sensitivity}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          {r.status === "pending" ? (
            <>
              <h3 className="drawer-section">Decision</h3>
              {r.purposeName === null && (
                <p className="cell-sub" style={{ color: "var(--yellow)", marginTop: 0 }}>This grouping has no approved purpose — accepting it creates a register entry with an unassigned purpose that still needs DPO tagging.</p>
              )}
              {!dismissing ? (
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn primary" disabled={pending} onClick={() => run(() => acceptRopaSuggestionAction(r.id), onClose)}>{pending ? "Accepting…" : "Accept into ROPA"}</button>
                  <button className="btn btn-outline-danger" onClick={() => setDismissing(true)}>Dismiss</button>
                </div>
              ) : (
                <div className="stack" style={{ gap: 6 }}>
                  <input className="input" placeholder="Reason for dismissal (required)" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn danger sm" disabled={pending || !reason.trim()} onClick={() => run(() => dismissRopaSuggestionAction(r.id, reason), onClose)}>Confirm dismiss</button>
                    <button className="btn ghost sm" onClick={() => setDismissing(false)}>Cancel</button>
                  </div>
                  <span className="cell-sub">A dismissed grouping won&rsquo;t reappear on the next refresh unless a new field joins it.</span>
                </div>
              )}
            </>
          ) : r.status === "accepted" ? (
            <p className="cell-sub" style={{ marginTop: 12 }}>Accepted into the ROPA register as a processing activity. <Link href="/data-map/processing-activities" className="row-link">View in Processing Activities →</Link></p>
          ) : (
            <p className="cell-sub" style={{ marginTop: 12 }}>Dismissed{r.dismissedReason ? `: ${r.dismissedReason}` : ""}.</p>
          )}
          <ActionError result={result} />
        </div>
      </aside>
    </div>
  );
}
