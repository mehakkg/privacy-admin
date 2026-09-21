"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, ExternalLink } from "lucide-react";
import { Pill } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { BreachReportForm } from "@/components/breach/BreachReportForm";
import { SEVERITY_TONE, BREACH_STATUS_LABEL, clock } from "@/lib/breach";

export interface IncidentRow {
  id: string; reference: string; category: string | null; severity: string; status: string;
  reportedVia: string; detectedAt: string; entityName: string | null; owner: string | null;
}

export function BreachIncidentsList({ rows, entities }: { rows: IncidentRow[]; entities: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <a href="/breach/report" target="_blank" rel="noreferrer" className="row-link">Public self-service reporting form <ExternalLink size={12} /></a>
        <button className="btn primary sm" onClick={() => setOpen(true)}><Plus size={14} /> Report incident</button>
      </div>

      <div className="table-wrap">
        <table className="dtable">
          <thead><tr><th>Reference</th><th>Category</th><th>Severity</th><th>Status</th><th>72h clock</th><th>Source</th><th>Detected</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const c = clock(r.detectedAt);
              const notified = ["board_notified", "remediation", "closed"].includes(r.status);
              return (
                <tr key={r.id} className="clickable" onClick={() => { window.location.href = `/breach/incidents/${r.id}`; }}>
                  <td className="cell-primary"><Link href={`/breach/incidents/${r.id}`} onClick={(e) => e.stopPropagation()}>{r.reference}</Link></td>
                  <td className="cell-sub">{r.category ?? "Uncategorized"}</td>
                  <td><Pill tone={SEVERITY_TONE[r.severity]}>{r.severity}</Pill></td>
                  <td><Pill tone={r.status === "closed" ? "gray" : r.status === "board_notified" ? "green" : "blue"} dot={false}>{BREACH_STATUS_LABEL[r.status] ?? r.status}</Pill></td>
                  <td>{notified ? <span className="cell-sub">Notified</span> : <span className={`clock-chip ${c.band}`}>{c.hoursRemaining <= 0 ? `${-c.hoursRemaining}h overdue` : `${c.hoursRemaining}h left`}</span>}</td>
                  <td className="cell-sub">{r.reportedVia === "public_self_service" ? "Public" : "Internal"}</td>
                  <td className="cell-sub">{r.detectedAt.slice(0, 10)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={7}><div className="empty"><p style={{ margin: 0 }}>No incidents recorded.</p></div></td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title="Report incident" size="lg" subtitle="Internal detection — auto-severity is computed on submit." onClose={() => setOpen(false)}>
          <BreachReportForm reportedVia="internal" entities={entities} onDone={() => setOpen(false)} />
        </Modal>
      )}
    </div>
  );
}
