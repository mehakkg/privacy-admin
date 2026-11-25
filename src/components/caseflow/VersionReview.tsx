"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Lock, Plus, Pencil, Check, X, CircleDot } from "lucide-react";
import { JOURNEY, DIFF, PEOPLE } from "@/lib/caseflow/data";

export function VersionReview() {
  const router = useRouter();
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="stack" style={{ gap: 16, maxWidth: 560 }}>
        <Link href="/approvals" className="row-link" style={{ display: "inline-flex", width: "fit-content" }}><ArrowLeft size={14} /> Approvals</Link>
        <div className="cm-done">
          <div className="cm-done-mark"><Check size={22} /></div>
          <h2 style={{ margin: 0 }}>v{JOURNEY.draftVersion} published</h2>
          <p className="cell-sub" style={{ margin: 0 }}>Live from now. New erasure cases follow v{JOURNEY.draftVersion}; the {JOURNEY.openCasesLive} cases already open finish on v{JOURNEY.liveVersion}. A signed approval record was written to the audit log.</p>
          <div className="row" style={{ gap: 10, marginTop: 6 }}>
            <Link href="/cases" className="btn primary">Go to My Work</Link>
            <Link href="/approvals" className="btn sec">Back to approvals</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Link href="/approvals" className="row-link" style={{ display: "inline-flex", width: "fit-content" }}><ArrowLeft size={14} /> Approvals</Link>

      <div className="cm-ed-head">
        <div className="stack" style={{ gap: 3 }}>
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <span className="cm-id">{JOURNEY.id}</span>
            <h1 className="inv-title" style={{ margin: 0, fontSize: 22 }}>{JOURNEY.name}</h1>
          </div>
          <p className="cell-sub" style={{ margin: 0 }}>Reviewing <strong>v{JOURNEY.draftVersion}</strong> against Live <strong>v{JOURNEY.liveVersion}</strong> · submitted by Ritu Nair · 2 days waiting</p>
        </div>
        <span className="pill yellow">Awaiting your approval</span>
      </div>

      <div className="grid-2" style={{ gap: 16, alignItems: "start" }}>
        {/* Diff */}
        <div className="inv-card stack" style={{ gap: 12 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <strong>What changed ({DIFF.length})</strong>
            <span className="cell-sub">v{JOURNEY.liveVersion} → v{JOURNEY.draftVersion}</span>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            {DIFF.map((d, i) => (
              <div key={i} className="cm-diff">
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <span className={`cm-diff-ic ${d.change}`}>{d.change === "added" ? <Plus size={12} /> : <Pencil size={12} />}</span>
                  <strong style={{ fontSize: 13 }}>{d.step}</strong>
                  {d.locked && <span className="cm-lockchip"><Lock size={10} /> DPO step</span>}
                </div>
                <div className="cm-diff-delta">
                  <span className="cm-from">{d.from}</span>
                  <span className="cm-arrow">→</span>
                  <span className="cm-to">{d.to}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="cm-impact" style={{ marginTop: 2 }}><CircleDot size={13} /> Validation passed when submitted — no open blockers.</p>
        </div>

        {/* Decision */}
        <div className="inv-card stack" style={{ gap: 12 }}>
          <strong>Your decision</strong>
          <div className="stack" style={{ gap: 8 }}>
            <button className={`cm-choice ${decision === "approve" ? "on approve" : ""}`} onClick={() => setDecision("approve")}>
              <span className="cm-choice-mark"><Check size={15} /></span>
              <span className="stack" style={{ gap: 1, alignItems: "flex-start" }}><strong>Approve &amp; publish v{JOURNEY.draftVersion}</strong><span className="cell-sub">Becomes live for all new cases</span></span>
            </button>
            <button className={`cm-choice ${decision === "reject" ? "on reject" : ""}`} onClick={() => setDecision("reject")}>
              <span className="cm-choice-mark reject"><X size={15} /></span>
              <span className="stack" style={{ gap: 1, alignItems: "flex-start" }}><strong>Send back to Ritu</strong><span className="cell-sub">Returns to draft with your note</span></span>
            </button>
          </div>
          <label className="stack" style={{ gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{decision === "reject" ? "Reason (required)" : "Approval note (optional)"}</span>
            <textarea className="input" rows={3} maxLength={500} placeholder={decision === "reject" ? "What needs to change…" : "Signed off — backups complete, within legal ceiling."} />
          </label>
          <button
            className="btn primary"
            disabled={!decision}
            onClick={() => setDone(true)}
          >{decision === "reject" ? "Send back" : `Approve & publish v${JOURNEY.draftVersion}`}</button>
          <p className="cell-sub" style={{ margin: 0, fontSize: 12 }}><Lock size={11} style={{ verticalAlign: "-1px" }} /> Your decision is recorded with your name and timestamp in the audit log.</p>
        </div>
      </div>
    </div>
  );
}
