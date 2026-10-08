"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw } from "lucide-react";
import { getActivityReasonsAction, resolveReasonAction, dismissReasonAction, confirmReviewAction, type ReasonsView, type ReasonRow } from "@/app/actions/activityReview";

/** SCREEN 9 — Review pane (Keep it right) for under_review activities. */
export function ReviewChangesPane({ activityId }: { activityId: string }) {
  const router = useRouter();
  const [rv, setRv] = useState<ReasonsView | null>(null);
  const [dismiss, setDismiss] = useState<{ id: string; note: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [, start] = useTransition();
  const load = () => getActivityReasonsAction(activityId).then(setRv);
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activityId]);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) { setErr(r.error ?? "Something went wrong."); } else { setErr(null); await load(); router.refresh(); } });

  if (!rv) return <div className="stack" style={{ gap: 10 }}><h2 style={{ margin: 0 }}>Review</h2><span className="cell-sub">Loading…</span></div>;
  const open = rv.reasons.filter((r) => r.status === "open");
  const closed = rv.reasons.filter((r) => r.status !== "open");
  const lastConfirmed = rv.lastConfirmed ? new Date(rv.lastConfirmed).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "never";

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 680 }}>
      <div className="stack" style={{ gap: 2 }}>
        <h2 style={{ margin: 0 }}>Review</h2>
        <span className="cell-sub">Last confirmed {lastConfirmed}. {open.length} change{open.length === 1 ? "" : "s"} to check.</span>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        {open.map((r) => (
          <div key={r.id} className="stack" style={{ gap: 6, paddingBottom: 8, borderBottom: "1px solid var(--border-soft)" }}>
            <div className="row" style={{ gap: 10, alignItems: "baseline", justifyContent: "space-between" }}>
              <span>{r.detail}</span>
              <div className="row" style={{ gap: 10 }}>
                <button className="link-btn" onClick={() => run(() => resolveReasonAction(activityId, r.id))}>{r.verb}</button>
                {r.dismissible && <button className="link-btn" onClick={() => setDismiss({ id: r.id, note: "" })}>Dismiss</button>}
              </div>
            </div>
            {dismiss?.id === r.id && (
              <div className="row" style={{ gap: 6 }}>
                <input className="input sm" style={{ flex: 1 }} value={dismiss.note} onChange={(e) => setDismiss({ id: r.id, note: e.target.value })} placeholder="Why dismiss? (a short note)" />
                <button className="btn sm" onClick={() => run(() => dismissReasonAction(activityId, r.id, dismiss.note))}>Dismiss</button>
                <button className="btn ghost sm" onClick={() => setDismiss(null)}>Cancel</button>
              </div>
            )}
          </div>
        ))}
        {open.length === 0 && <div className="row" style={{ gap: 8, color: "var(--green)" }}><Check size={15} /> All changes handled.</div>}
      </div>

      {closed.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <button className="link-btn" onClick={() => setShowResolved((s) => !s)}>Resolved ({closed.length})</button>
          {showResolved && closed.map((r) => (
            <div key={r.id} className="cell-sub row" style={{ gap: 6, alignItems: "baseline" }}><RotateCcw size={11} /> {r.detail}{r.status === "dismissed" && r.dismissNote ? ` — dismissed: ${r.dismissNote}` : " — done"}</div>
          ))}
        </div>
      )}

      {err && <div className="notice warn" style={{ margin: 0 }}>{err}</div>}
      <div><button className="btn primary" onClick={() => run(() => confirmReviewAction(activityId))}>Confirm still accurate</button></div>
    </div>
  );
}
