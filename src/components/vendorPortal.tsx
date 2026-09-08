"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { saveAssessmentResponseAction } from "@/app/actions/assessments";
import { ASSESSMENT_QUESTIONS, ASSESSMENT_SECTIONS } from "@/lib/tprm";
import type { ActionResult } from "@/app/actions/requests";

/**
 * SCREEN 2.3 — Vendor Self-Service Assessment Portal. An EXTERNAL, submission-
 * only surface: the vendor answers the questionnaire with save-and-resume, and
 * once submitted it is read-only unless Legal reopens it. The vendor never sees
 * its own risk classification or Legal's notes — this is architecturally
 * separate from the review screen, not the same view with fields hidden.
 */
export function VendorPortal({
  assessmentId, initialResponses, submitted, templateName, vendorName,
}: {
  assessmentId: string;
  initialResponses: Record<string, string>;
  submitted: boolean;
  templateName: string;
  vendorName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>(initialResponses);

  const answered = ASSESSMENT_QUESTIONS.filter((q) => (answers[q.id] ?? "").trim()).length;
  const pct = Math.round((answered / ASSESSMENT_QUESTIONS.length) * 100);

  const run = (submit: boolean) =>
    start(async () => {
      const r = await saveAssessmentResponseAction(assessmentId, answers, submit);
      setResult(r);
      if (r.ok) router.refresh();
    });

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <span className="cell-sub">{vendorName} · {templateName}</span>
        {!submitted && <span className="cell-sub">{pct}% complete</span>}
      </div>

      {submitted ? (
        <div style={{ marginBottom: 12 }}>
          <Notice tone="ok" title="Submitted">
            Your response has been submitted and is now read-only. Contact your reviewer if you need to make a change.
          </Notice>
        </div>
      ) : (
        <div className="linkbar" style={{ marginBottom: 16 }}><div className="linkbar-fill" style={{ width: `${pct}%` }} /></div>
      )}

      {ASSESSMENT_SECTIONS.map((section) => (
        <div key={section} className="card" style={{ marginBottom: 12 }}><div className="card-body">
          <div className="section-label" style={{ marginTop: 0 }}>{section}</div>
          <div className="stack" style={{ gap: 12 }}>
            {ASSESSMENT_QUESTIONS.filter((q) => q.section === section).map((q) => (
              <label key={q.id} className="field">
                <span className="field-label">{q.label}</span>
                {submitted ? (
                  <div className="version-view">{answers[q.id]?.trim() || "(no answer)"}</div>
                ) : (
                  <textarea className="input" style={{ minHeight: 64 }} value={answers[q.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                )}
              </label>
            ))}
          </div>
        </div></div>
      ))}

      {!submitted && (
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" disabled={pending} onClick={() => run(false)}>{pending ? "Saving…" : "Save & resume later"}</button>
          <button className="btn primary" disabled={pending || pct < 100} title={pct < 100 ? "Answer every question before submitting" : undefined} onClick={() => run(true)}>Submit</button>
        </div>
      )}
      <ActionError result={result} />
    </div>
  );
}
