import Link from "next/link";

/**
 * S9 — the dashboard setup strip. Full-width, under the top bar, until every
 * required task is done AND all three capabilities are live. Amber when under
 * 30 days to enforcement with required tasks still open. Computed, never
 * hard-coded; the dashboard itself is never blocked.
 */
export function DashboardSetupStrip({ requiredDone, requiredTotal, live, youreDone, waiting, days, amber }: {
  requiredDone: number; requiredTotal: number; live: number; youreDone: boolean; waiting: string; days: number; amber: boolean;
}) {
  return (
    <div className="inv-card" style={{ marginBottom: 16, borderColor: amber ? "var(--yellow-border,#f2e0b0)" : "var(--accent)", background: amber ? "var(--yellow-50,#fffbeb)" : "color-mix(in srgb, var(--accent) 5%, var(--bg))" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span className="cell-sub">
          <strong>Setup: {requiredDone} of {requiredTotal} required done</strong>
          {youreDone ? " · You’re done" : ""}
          {waiting ? ` · Waiting on ${waiting}` : ""}
          {" · "}Go-live: {live} of 3 live
          {amber ? ` · ${days} days left` : ""}
        </span>
        <Link href="/setup" className="btn primary sm">Continue setup →</Link>
      </div>
    </div>
  );
}
