"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { CASES, type ThreeState } from "@/lib/caseflow/data";

const stateTone: Record<ThreeState, string> = {
  "Pending": "gray",
  "Partially complete": "yellow",
  "Fully verified": "green",
};

export function CaseInbox() {
  const router = useRouter();
  const [lane, setLane] = useState<"all" | "mine" | "breaching">("mine");

  const rows = CASES.filter((c) => (lane === "breaching" ? c.slaTone === "danger" : true));

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="stack" style={{ gap: 4 }}>
        <p className="dh-kicker">Operate</p>
        <h1 className="inv-title">My Work</h1>
        <p className="cell-sub" style={{ margin: 0 }}>Cases assigned to you across journeys. One queue, newest SLA risk first — open a case to act on its current step.</p>
      </div>

      <div className="cm-appr-stats">
        <div className="stat"><span className="stat-n">{CASES.length}</span><span className="stat-l">Assigned to you</span></div>
        <div className="stat"><span className="stat-n danger">1</span><span className="stat-l">Breaching &lt; 24h</span></div>
        <div className="stat"><span className="stat-n">1</span><span className="stat-l">Partially complete</span></div>
      </div>

      <div className="wf-tabs">
        <button className={lane === "mine" ? "on" : ""} onClick={() => setLane("mine")}>Assigned to me</button>
        <button className={lane === "breaching" ? "on" : ""} onClick={() => setLane("breaching")}>Breaching SLA</button>
        <button className={lane === "all" ? "on" : ""} onClick={() => setLane("all")}>All open</button>
      </div>

      <div className="inv-card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="inv-table">
          <thead><tr><th>Case</th><th>Subject</th><th>Journey</th><th>Current step</th><th>Status</th><th>SLA left</th><th></th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.id}
                className="cm-row-link"
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/cases/${c.id}`)}
                onKeyDown={(e) => { if (e.key === "Enter") router.push(`/cases/${c.id}`); }}
              >
                <td><span className="cm-id">{c.id}</span><div className="cell-sub">v{c.version} · {c.lane}</div></td>
                <td style={{ fontWeight: 600 }}>{c.subject}</td>
                <td className="cell-sub">{c.journey}</td>
                <td className="cell-sub">{c.stepName}</td>
                <td><span className={`pill ${stateTone[c.status]}`}>{c.status}</span></td>
                <td><span className={c.slaTone === "danger" ? "sev-critical" : c.slaTone === "warn" ? "sev-warning" : "cell-sub"}>{c.sla}</span></td>
                <td style={{ textAlign: "right" }}><span className="cm-review-cta">Open <ArrowRight size={13} /></span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
