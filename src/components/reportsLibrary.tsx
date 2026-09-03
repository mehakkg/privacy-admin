"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Download, Eye } from "lucide-react";
import { Pill } from "@/components/ui";

export interface ReportDef {
  slug: string;
  name: string;
  desc: string;
  /** view = viewable inline; download = export-only. */
  mode: "view" | "download";
}

/**
 * Reports — a library of standardized regulatory deliverables, one card per
 * report type. Categorically different from Evidence Compiler's ad hoc,
 * query-built packages for a specific inquiry: these are the fixed statutory
 * outputs, each either viewable inline or export-only.
 */
export function ReportsLibrary({ reports }: { reports: ReportDef[] }) {
  return (
    <div className="metric-grid">
      {reports.map((r) => (
        <ReportCard key={r.slug} report={r} />
      ))}
    </div>
  );
}

function ReportCard({ report }: { report: ReportDef }) {
  const [queued, setQueued] = useState(false);
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <div className="row" style={{ gap: 8, justifyContent: "space-between", alignItems: "flex-start" }}>
          <span className="row" style={{ gap: 8 }}>
            <FileText size={16} strokeWidth={1.9} />
            <strong>{report.name}</strong>
          </span>
          <Pill tone={report.mode === "view" ? "blue" : "gray"} dot={false}>
            {report.mode === "view" ? "Viewable inline" : "Export-only"}
          </Pill>
        </div>
        <p className="cell-sub" style={{ margin: 0, flex: 1 }}>{report.desc}</p>
        <div className="row" style={{ gap: 8, marginTop: 4 }}>
          {report.mode === "view" ? (
            <Link href={`/analytics/reports/${report.slug}`} className="btn sm primary">
              <Eye size={13} /> View report
            </Link>
          ) : (
            <button
              className="btn sm primary"
              disabled={queued}
              onClick={() => setQueued(true)}
            >
              <Download size={13} /> {queued ? "Preparing PDF…" : "Download PDF"}
            </button>
          )}
        </div>
        {queued && (
          <p className="cell-sub" style={{ margin: 0 }}>
            Export queued — the generated PDF will be delivered to your downloads (demo).
          </p>
        )}
      </div>
    </div>
  );
}
