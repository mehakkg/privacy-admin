"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { getReviewAction, activateActivityAction, submitActivityForDpoAction, withdrawActivitySubmissionAction, decideActivityAction } from "@/app/actions/activities";
import type { ReviewView } from "@/lib/engines/activities";

interface Nav { pane: string; purpose?: string; section?: string; addPurpose?: boolean }

/** SCREEN 7 — Review and activate. */
export function ReviewPane({ activityId, role, go }: { activityId: string; role: string; go: (t: Nav) => void }) {
  const router = useRouter();
  const [rv, setRv] = useState<ReviewView | null>(null);
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ropaOpen, setRopaOpen] = useState(true);
  const [, start] = useTransition();
  const canGovern = role === "dpo" || role === "ciso";
  useEffect(() => { getReviewAction(activityId).then(setRv); }, [activityId]);
  if (!rv) return <div className="stack" style={{ gap: 10 }}><h2 style={{ margin: 0 }}>Review and activate</h2><span className="cell-sub">Loading…</span></div>;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) { setErr(r.error ?? "Something went wrong."); } else { setErr(null); router.refresh(); getReviewAction(activityId).then(setRv); } });
  const onActivate = () => { if (rv.verdict === "blocked") { setErr(`Fix ${rv.blocking.length} item${rv.blocking.length === 1 ? "" : "s"} before activating.`); const t = rv.blocking[0].target; if (t) go(t as Nav); return; } run(() => activateActivityAction(activityId)); };

  return (
    <div className="stack" style={{ gap: 18, maxWidth: 720 }}>
      {/* Verdict */}
      {rv.verdict === "ready" ? (
        <div className="row" style={{ gap: 8, alignItems: "center" }}><CheckCircle2 size={20} style={{ color: "var(--green)" }} /><h2 style={{ margin: 0 }}>Ready to activate</h2></div>
      ) : (
        <div className="row" style={{ gap: 8, alignItems: "center" }}><AlertTriangle size={20} style={{ color: "var(--yellow-700, #b45309)" }} /><h2 style={{ margin: 0 }}>Fix {rv.blocking.length} item{rv.blocking.length === 1 ? "" : "s"} before activating</h2></div>
      )}

      {/* Pending DPO review banners */}
      {rv.lifecycle === "pending_dpo_review" && rv.dpoReview && (
        canGovern ? (
          <div className="notice warn" style={{ margin: 0 }}>Review requested by {rv.dpoReview.requestedBy} on {new Date(rv.dpoReview.requestedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.{rv.dpoReview.note ? ` Note: ${rv.dpoReview.note}` : ""}</div>
        ) : (
          <div className="notice info" style={{ margin: 0 }}>Waiting for K. Menon. Submitted {new Date(rv.dpoReview.requestedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}. <button className="link-btn" onClick={() => run(() => withdrawActivitySubmissionAction(activityId))}>Withdraw</button></div>
        )
      )}

      {/* Blocking checklist */}
      {rv.blocking.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          {rv.blocking.map((it, i) => (
            <div key={i} className="row" style={{ gap: 8, alignItems: "baseline" }}><span className="dot" style={{ background: "var(--yellow-700, #b45309)", marginTop: 5 }} /><span>{it.text}</span>{it.verb && it.target && <button className="link-btn" onClick={() => go(it.target as Nav)}>{it.verb}</button>}</div>
          ))}
        </div>
      )}

      {/* Warnings */}
      {rv.warnings.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="cell-sub" style={{ fontWeight: 600 }}>Worth checking</div>
          {rv.warnings.map((it, i) => (
            <div key={i} className="row" style={{ gap: 8, alignItems: "baseline" }}><span className="dot" style={{ background: "var(--text-4, #94a3b8)", marginTop: 5 }} /><span>{it.text}</span>{it.verb && (it.target ? <button className="link-btn" onClick={() => go(it.target as Nav)}>{it.verb}</button> : <span className="cell-sub">· {it.verb}</span>)}</div>
          ))}
        </div>
      )}

      {/* ROPA preview */}
      <div className="stack" style={{ gap: 6 }}>
        <button className="pa-browse-h" onClick={() => setRopaOpen((o) => !o)} style={{ padding: 0 }}>{ropaOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<strong>How this will appear in ROPA</strong></button>
        {ropaOpen && (rv.ropa.length === 0 ? <span className="cell-sub">No confirmed purposes yet.</span> : (
          <div className="table-wrap"><table className="inv-table"><thead><tr><th>Purpose</th><th>Legal basis</th><th>Data</th><th>Retention</th><th>Processors</th><th>Transfers</th></tr></thead>
            <tbody>{rv.ropa.map((r, i) => <tr key={i} className="inv-row"><td>{r.purpose}</td><td>{r.legalBasis}</td><td className="tnum">{r.dataCount}</td><td>{r.retention}</td><td>{r.processors.length ? r.processors.join(", ") : "—"}</td><td>{r.transfer ? "Outside India" : "—"}</td></tr>)}</tbody>
          </table></div>
        ))}
      </div>

      {err && <div className="notice warn" style={{ margin: 0 }}>{err}</div>}

      {/* Primary action */}
      {rv.lifecycle === "pending_dpo_review" ? (
        canGovern && (
          <div className="stack" style={{ gap: 8 }}>
            <textarea className="input" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment (required to request changes)" />
            <div className="row" style={{ gap: 8 }}>
              <button className="btn primary" onClick={() => run(() => decideActivityAction(activityId, "approve", comment))}>Approve</button>
              <button className="btn" onClick={() => run(() => decideActivityAction(activityId, "request_changes", comment))}>Request changes</button>
            </div>
          </div>
        )
      ) : rv.lifecycle === "active" ? (
        <div className="notice info" style={{ margin: 0 }}>This activity is active.</div>
      ) : rv.requireDpoReview && !canGovern ? (
        <div className="stack" style={{ gap: 8 }}>
          <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="An optional note to the DPO" />
          <div><button className="btn primary" onClick={() => run(() => submitActivityForDpoAction(activityId, note))}>Submit for DPO review</button></div>
        </div>
      ) : (
        <div><button className="btn primary" onClick={onActivate}>Activate activity</button></div>
      )}
    </div>
  );
}
