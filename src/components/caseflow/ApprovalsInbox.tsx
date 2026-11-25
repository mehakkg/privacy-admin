"use client";

import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { APPROVALS } from "@/lib/caseflow/data";

const typeTone: Record<string, string> = {
  "Workflow version": "blue",
  "Sub-processor": "orange",
  "Notice": "gray",
};

export function ApprovalsInbox() {
  const router = useRouter();
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="stack" style={{ gap: 4 }}>
        <p className="dh-kicker">Govern &amp; review</p>
        <h1 className="inv-title">Approvals</h1>
        <p className="cell-sub" style={{ margin: 0 }}>Items waiting on your sign-off as DPO. Approving a workflow version publishes it for all new cases.</p>
      </div>

      <div className="cm-appr-stats">
        <div className="stat"><span className="stat-n">{APPROVALS.length}</span><span className="stat-l">Awaiting you</span></div>
        <div className="stat"><span className="stat-n">1</span><span className="stat-l">Config change</span></div>
        <div className="stat"><span className="stat-n">2d</span><span className="stat-l">Oldest waiting</span></div>
      </div>

      <div className="inv-card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="inv-table">
          <thead><tr><th>Type</th><th>Item</th><th>Requested by</th><th>Waiting</th><th>Blocks</th><th></th></tr></thead>
          <tbody>
            {APPROVALS.map((a) => {
              const isVersion = a.type === "Workflow version";
              return (
                <tr
                  key={a.id}
                  className={isVersion ? "cm-row-link" : ""}
                  onClick={isVersion ? () => router.push(`/approvals/${a.id}`) : undefined}
                  role={isVersion ? "link" : undefined}
                  tabIndex={isVersion ? 0 : undefined}
                  onKeyDown={isVersion ? (e) => { if (e.key === "Enter") router.push(`/approvals/${a.id}`); } : undefined}
                >
                  <td><span className={`pill ${typeTone[a.type] ?? "gray"}`}>{a.type}</span></td>
                  <td><span style={{ fontWeight: 600 }}>{a.title}</span></td>
                  <td className="cell-sub">{a.requester}</td>
                  <td>{a.waiting === "4 hours" ? <span className="cell-sub">{a.waiting}</span> : <span className="sev-warning">{a.waiting}</span>}</td>
                  <td className="cell-sub">{a.blocking}</td>
                  <td style={{ textAlign: "right" }}>{isVersion ? <span className="cm-review-cta">Review <ArrowRight size={13} /></span> : <span className="cell-sub">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
