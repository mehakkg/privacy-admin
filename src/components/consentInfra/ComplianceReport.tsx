"use client";

import { Download, FileText } from "lucide-react";
import { Stat } from "@/components/ui";

export interface ReportRow { section: string; metric: string; value: string }

export function ComplianceReport({ month, rows, headline }: { month: string; rows: ReportRow[]; headline: { label: string; value: number | string; tone?: "red" | "green" | "yellow" }[] }) {
  const exportCsv = () => {
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const header = ["Section", "Metric", "Value"].map(esc).join(",");
    const body = rows.map((r) => [r.section, r.metric, r.value].map(esc).join(",")).join("\n");
    const csv = `Monthly Cookie Compliance Report,${esc(month)}\n\n${header}\n${body}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cookie-compliance-${month.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const bySection = rows.reduce<Record<string, ReportRow[]>>((acc, r) => { (acc[r.section] ??= []).push(r); return acc; }, {});

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span className="row" style={{ gap: 6 }}><FileText size={15} /> <strong>{month}</strong></span>
        <button className="btn primary sm" style={{ marginLeft: "auto" }} onClick={exportCsv}><Download size={13} /> Generate export (CSV)</button>
      </div>

      <div className="stat-row">
        {headline.map((h) => <Stat key={h.label} label={h.label} value={h.value} tone={h.tone} />)}
      </div>

      <div className="card">
        <div className="card-head">Report preview</div>
        <div className="card-body">
          {Object.entries(bySection).map(([section, items]) => (
            <div key={section} style={{ marginBottom: 14 }}>
              <div className="section-label">{section}</div>
              <div className="table-wrap">
                <table className="dtable">
                  <tbody>
                    {items.map((r, i) => (
                      <tr key={i}><td className="cell-primary" style={{ width: "60%" }}>{r.metric}</td><td className="mono">{r.value}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <p className="cell-sub">One structured export — scan results, categorisation actions, and geo/language verification status — reusing the same export mechanism as the other report screens.</p>
        </div>
      </div>
    </div>
  );
}
