"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, CheckCircle2, HelpCircle, ArrowRight } from "lucide-react";
import { Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { resolveDriftAction } from "@/app/actions/rbac";
import { capabilityById, capabilityDiff } from "@/lib/rbac";
import type { ActionResult } from "@/app/actions/requests";

export interface DriftView {
  id: string;
  roleName: string;
  userName: string;
  severity: string;   // critical | minor
  resolution: string; // corrected | retroactively_approved | unresolved
  detectedAt: string;
  traceable: boolean;
  changeTrace: string | null;
  baseline: string[];
  current: string[];
}

const RES_LABEL: Record<string, string> = { corrected: "Corrected to baseline", retroactively_approved: "Retroactively approved", unresolved: "Unresolved" };

export function DriftDashboard({ rows, lastScan }: { rows: DriftView[]; lastScan: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [open, setOpen] = useState<DriftView | null>(null);

  const run = (op: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });

  if (rows.length === 0) {
    return (
      <div className="drift-clear">
        <CheckCircle2 size={28} color="var(--green)" />
        <p style={{ margin: "10px 0 2px", fontWeight: 600 }}>No drift detected</p>
        <p className="cell-sub" style={{ margin: 0 }}>Every assignment matches its approved baseline. Last scan {lastScan}.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr><th>Role</th><th>User</th><th>Change</th><th>Severity</th><th>Status</th><th>Detected</th></tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const diff = capabilityDiff(d.baseline, d.current);
              return (
                <tr key={d.id} className="clickable" onClick={() => setOpen(d)}>
                  <td className="cell-primary">{d.roleName}</td>
                  <td className="cell-sub">{d.userName}</td>
                  <td>
                    <span className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                      {diff.added.map((id) => <span key={id} className="diff-add">+ {capabilityById(id)?.action ?? id}</span>)}
                      {diff.removed.map((id) => <span key={id} className="diff-remove">− {capabilityById(id)?.action ?? id}</span>)}
                    </span>
                  </td>
                  <td><Pill tone={d.severity === "critical" ? "red" : "yellow"}>{d.severity === "critical" ? "Critical" : "Minor"}</Pill></td>
                  <td>{d.resolution === "unresolved" ? <Pill tone="gray">Unresolved</Pill> : <Pill tone="green" dot={false}>{RES_LABEL[d.resolution]}</Pill>}</td>
                  <td className="cell-sub">{d.detectedAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ActionError result={result} />

      {open && (
        <DriftReviewDrawer
          d={open}
          pending={pending}
          onCorrect={() => run(() => resolveDriftAction(open.id, "corrected"), () => setOpen(null))}
          onRetro={() => run(() => resolveDriftAction(open.id, "retroactively_approved"), () => setOpen(null))}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/** SCREEN 7 — Drift Review. Side-by-side diff; two equally-weighted decisions,
 *  neither styled as the default. */
function DriftReviewDrawer({
  d, pending, onCorrect, onRetro, onClose,
}: {
  d: DriftView; pending: boolean; onCorrect: () => void; onRetro: () => void; onClose: () => void;
}) {
  const diff = capabilityDiff(d.baseline, d.current);
  const resolved = d.resolution !== "unresolved";
  const cap = (id: string) => capabilityById(id)?.action ?? id;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer-panel" style={{ background: "var(--bg)", width: "min(640px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head drawer-sticky">
          <div className="row" style={{ gap: 8 }}>
            <strong>{d.roleName} · {d.userName}</strong>
            <Pill tone={d.severity === "critical" ? "red" : "yellow"}>{d.severity === "critical" ? "Critical" : "Minor"}</Pill>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="drawer-body">
          <div className={`notice ${d.traceable ? "policy" : "danger"}`} style={{ marginBottom: 12 }}>
            <div className="notice-title">{d.traceable ? "Change traced" : <><HelpCircle size={12} /> Source unclear — flag for investigation</>}</div>
            <div>{d.traceable ? d.changeTrace : "This change could not be traced to a source. It routes to manual investigation before any resolution is recorded."}</div>
          </div>

          <h3 className="drawer-section first">Baseline vs current</h3>
          <div className="drift-diff">
            <div className="drift-col">
              <div className="section-label">Approved baseline</div>
              {d.baseline.map((id) => <div key={id} className="cap-row-static"><span className="cell-primary">{cap(id)}</span></div>)}
            </div>
            <div className="drift-col">
              <div className="section-label">Current</div>
              {d.current.map((id) => (
                <div key={id} className={`cap-row-static${diff.added.includes(id) ? " added" : ""}`}>
                  <span className="cell-primary">{cap(id)}{diff.added.includes(id) && <span className="diff-add" style={{ marginLeft: 6 }}>added</span>}</span>
                </div>
              ))}
              {diff.removed.map((id) => <div key={id} className="cap-row-static removed"><span className="cell-primary">{cap(id)} <span className="diff-remove" style={{ marginLeft: 6 }}>removed</span></span></div>)}
            </div>
          </div>

          {resolved ? (
            <div className="notice info" style={{ marginTop: 16 }}>
              <div className="notice-title">Resolved</div>
              <div>{RES_LABEL[d.resolution]}.</div>
            </div>
          ) : (
            <>
              <h3 className="drawer-section">Decision</h3>
              <p className="cell-sub" style={{ marginTop: 0 }}>Both outcomes are legitimate — revert the change, or formalise it. Neither is the default.</p>
              <div className="drift-actions">
                <button className="btn drift-choice" disabled={pending} onClick={onCorrect}>Correct to baseline</button>
                <button className="btn drift-choice" disabled={pending} onClick={onRetro}>Request retroactive approval <ArrowRight size={13} /></button>
              </div>
              <p className="cell-sub" style={{ marginTop: 8 }}>Retroactive approval updates the baseline only after the DPO clears it.</p>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
