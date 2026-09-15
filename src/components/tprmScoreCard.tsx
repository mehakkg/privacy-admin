import Link from "next/link";
import { Pill, type PillTone } from "@/components/ui";
import type { TprmSummary } from "@/lib/tprm";

const RISK_TONE: Record<string, PillTone> = { low: "gray", medium: "yellow", high: "red", critical: "red" };

/**
 * TPRM score/findings summary — built once, referenced from the Processor detail
 * view (Screen 3) and the ROPA Processor field. A READ-ONLY mirror of TPRM data
 * pulled live via the Vendor ID; nothing here is editable from the Privacy side.
 */
export function TprmScoreCard({ s, compact = false }: { s: TprmSummary; compact?: boolean }) {
  if (s.broken) {
    return (
      <div className="tprm-card broken">
        <div className="tprm-head"><span className="tprm-title">TPRM assessment</span></div>
        <p className="cell-sub" style={{ margin: 0, color: "var(--red)" }}>Linked TPRM Vendor no longer found — contact an Admin.</p>
      </div>
    );
  }
  return (
    <div className="tprm-card">
      <div className="tprm-head">
        <span className="tprm-title">TPRM assessment</span>
        <span className="cell-sub">Synced {s.lastSynced}</span>
      </div>
      <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 10 }}>
        <Link href="/vendor-risk/register" className="row-link">{s.vendorName}</Link>
        <Pill tone={RISK_TONE[s.riskRating]}>{s.riskRating}</Pill>
      </div>
      <div className="row" style={{ gap: 20, alignItems: "baseline" }}>
        <div>
          {s.status === "pending" ? (
            <div className="cell-primary" style={{ fontSize: 15 }}>Assessment pending in TPRM</div>
          ) : s.score === null ? (
            <div className="cell-sub">No assessment on record</div>
          ) : (
            <><div className="stat-value" style={{ fontSize: 26 }}>{s.score}</div><div className="cell-sub">compliance score</div></>
          )}
        </div>
        {!compact && (
          <div>
            <div className="stat-value" style={{ fontSize: 26, color: s.openFindings ? "var(--yellow)" : undefined }}>{s.openFindings}</div>
            <div className="cell-sub">open findings</div>
          </div>
        )}
      </div>
      {s.latestFinding && <p className="cell-sub" style={{ margin: "8px 0 0" }}>{s.latestFinding}</p>}
      <div style={{ marginTop: 10 }}>
        <Link href="/vendor-risk/assessments" className="row-link">View full assessment in TPRM →</Link>
      </div>
    </div>
  );
}
