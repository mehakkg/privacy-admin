import { BreachReportForm } from "@/components/breach/BreachReportForm";

export const dynamic = "force-dynamic";

/**
 * SCREEN 1 (public) — self-service breach reporting. A genuinely unauthenticated
 * entry point: no Shell chrome, no login, no role. Anyone who spots a data
 * incident can report it; it lands as a triage incident visible to the CISO.
 */
export default function PublicBreachReportPage() {
  return (
    <div className="public-report">
      <div className="public-report-card">
        <div className="public-report-head">
          <span className="public-brand">Privacy Console</span>
          <h1>Report a data incident</h1>
          <p className="cell-sub">See something that looks like a personal-data breach — a misdirected email, an exposed file, unauthorized access? Tell us. You don&rsquo;t need an account. Our data-protection team is notified immediately.</p>
        </div>
        <BreachReportForm reportedVia="public_self_service" />
      </div>
    </div>
  );
}
