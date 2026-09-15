"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { finalizeClassificationAction, reopenAssessmentAction } from "@/app/actions/assessments";
import { RISKS } from "@/lib/tprm";
import type { ActionResult } from "@/app/actions/requests";

const RISK_TONE: Record<string, "gray" | "yellow" | "orange" | "red"> = { low: "gray", medium: "yellow", high: "red", critical: "red" };

/**
 * SCREEN 2.4 — Assessment Review & Classification (Legal's side). Legal reads the
 * vendor's answers and sets the FINAL rating, with the explicit ability to
 * override the system baseline — the reason is required, so "a human owns the
 * rating" is evidenced, not asserted. Finalizing writes back to the register.
 */
export function ReviewClassification({
  assessmentId, baseline, classification, reason, verified, vendorSubmitted,
}: {
  assessmentId: string;
  baseline: string;
  classification: string | null;
  reason: string | null;
  verified: boolean;
  vendorSubmitted: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [rating, setRating] = useState(classification ?? baseline);
  const [why, setWhy] = useState("");

  const run = (op: () => Promise<ActionResult>) =>
    start(async () => { const r = await op(); setResult(r); if (r.ok) router.refresh(); });

  return (
    <div className="card"><div className="card-body">
      <div className="section-label" style={{ marginTop: 0 }}>Final classification</div>
      <p className="cell-sub" style={{ marginTop: 0 }}>
        System baseline: <Pill tone={RISK_TONE[baseline]} dot={false}>{baseline}</Pill> — a starting suggestion, not the answer.
      </p>

      {verified ? (
        <div className="stack" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8 }}>
            <span>Classified as</span> <Pill tone={RISK_TONE[classification ?? "medium"]}>{classification}</Pill>
            <span className="cell-sub">— written back to the register</span>
          </div>
          {reason && <span className="cell-sub">Reason: {reason}</span>}
          <button className="btn ghost sm" disabled={pending} onClick={() => run(() => reopenAssessmentAction(assessmentId))} style={{ alignSelf: "flex-start" }}>
            Reopen for the vendor to edit
          </button>
        </div>
      ) : !vendorSubmitted ? (
        <p className="cell-sub">Waiting on the vendor&rsquo;s submission before a classification can be finalized.</p>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {RISKS.map((r) => <button key={r} className={`btn sm ${rating === r ? "primary" : "ghost"}`} onClick={() => setRating(r)}>{r}</button>)}
          </div>
          <input className="input" placeholder="Reason for this classification (required)" value={why} onChange={(e) => setWhy(e.target.value)} />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary" disabled={pending || !why.trim()} onClick={() => run(() => finalizeClassificationAction(assessmentId, rating, why))}>
              {pending ? "Finalizing…" : "Finalize classification"}
            </button>
            <button className="btn ghost sm" disabled={pending} onClick={() => run(() => reopenAssessmentAction(assessmentId))}>Reopen for vendor</button>
          </div>
          <span className="cell-sub">Finalizing sets the review to Fully verified and writes the rating back to the Vendor register.</span>
        </div>
      )}
      <ActionError result={result} />
    </div></div>
  );
}
