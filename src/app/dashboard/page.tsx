import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { Card, PageHead, Pill, Stat, formatDateTime } from "@/components/ui";
import { getCurrentRole } from "@/lib/session";
import { computeDashboardMetrics, type DashboardMetrics } from "@/lib/dashboard/metrics";
import { WIDGET_BY_ID } from "@/lib/dashboard/widgets";
import { MyDashboard } from "@/components/myDashboard";
import type { SavedWidget } from "@/app/actions/dashboard";
import { ROLE_LABEL, type ActorRole } from "@/lib/domain";
import { getOnboardingSnapshot } from "@/lib/onboarding";
import { OnboardingBanners, type BannerState } from "@/components/dashboard/OnboardingBanners";

export const dynamic = "force-dynamic";

const TABS = ["operations", "data-health", "compliance", "my-dashboard"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  operations: "Operations",
  "data-health": "Data Health",
  compliance: "Compliance & Audit",
  "my-dashboard": "My Dashboard",
};

function prettyAction(a: string): string {
  return a.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Render one catalog widget inside a Card (used on the fixed tabs). */
function WidgetCard({ id, metrics }: { id: string; metrics: DashboardMetrics }) {
  const def = WIDGET_BY_ID[id];
  if (!def) return null;
  return <Card title={def.name}>{def.render(metrics, def.sizes.includes("full") ? "full" : "compact")}</Card>;
}

interface Alert { severity: "red" | "yellow"; text: string; href: string; cta: string }

/**
 * DASHBOARD — four tabs. Operations pins the six Tier-1 safety metrics (never
 * removable) and shows the recommended Tier-2 set; Data Health and Compliance &
 * Audit are curated Tier-2 views; My Dashboard is the fully customizable, per-
 * role tab built from the widget library.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? "") ? (rawTab as Tab) : "operations";

  const role = await getCurrentRole();
  const [metrics, recent, layoutRow, onb, primaryEntity] = await Promise.all([
    computeDashboardMetrics(),
    db.auditLogEntry.findMany({ orderBy: { seq: "desc" }, take: 8 }),
    db.dashboardLayout.findUnique({ where: { role } }),
    getOnboardingSnapshot(),
    db.entity.findFirst({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const allGsDone = onb.sourceConnected && onb.assignmentCount > 0 && onb.entityCount > 1;
  const banners: BannerState = {
    showWelcome: onb.configured && !onb.provisionBannerDismissed,
    welcomeText: onb.entityCount > 1
      ? `We set up ${onb.entityCount} entities${onb.assignmentCount ? ` and invited ${onb.assignmentCount} team member${onb.assignmentCount === 1 ? "" : "s"}` : ""}.`
      : `We set up ${onb.orgName ?? "your organization"} as your entity and assigned you the Admin role.`,
    showGettingStarted: onb.configured && !onb.gettingStartedDismissed && !allGsDone,
    showIncomplete: onb.hasGovernanceGap,
    incompleteReason: onb.entityCount === 0
      ? "No legal entity has been set up yet — every organization needs at least one Data Fiduciary."
      : `${onb.entitiesMissingGovernance} entit${onb.entitiesMissingGovernance === 1 ? "y has" : "ies have"} no governance structure set.`,
    primaryEntity: primaryEntity ?? null,
    items: { source: onb.sourceConnected, teammates: onb.assignmentCount > 0, anotherEntity: onb.entityCount > 1 },
  };

  let initialWidgets: SavedWidget[] = [];
  try {
    const parsed = JSON.parse(layoutRow?.widgetsJson ?? "[]");
    if (Array.isArray(parsed)) initialWidgets = parsed.filter((w) => w && WIDGET_BY_ID[w.id] && WIDGET_BY_ID[w.id].tier !== 1);
  } catch { /* empty layout is fine */ }

  // Tier-1 alerts, from the same metrics — these can never be customized away.
  const alerts: Alert[] = [];
  if (metrics.pastDeadline) alerts.push({ severity: "red", text: `${metrics.pastDeadline} request(s) past the fulfilment deadline`, href: "/requests", cta: "Open Requests" });
  if (metrics.processorsUnreachable) alerts.push({ severity: "red", text: `${metrics.processorsUnreachable} processor(s) unreachable — a deadline may be at risk`, href: "/integrations/health-monitoring", cta: "Health Monitoring" });
  if (metrics.openEscalations) alerts.push({ severity: "yellow", text: `${metrics.openEscalations} open escalation(s) awaiting a ruling`, href: "/escalations?status=open", cta: "Open Escalations" });
  if (metrics.blockedOnRetention) alerts.push({ severity: "yellow", text: `${metrics.blockedOnRetention} request(s) blocked on an unreviewed retention exception`, href: "/requests", cta: "Open Requests" });
  if (metrics.ropaDrift.total) alerts.push({ severity: "yellow", text: `${metrics.ropaDrift.total} field(s) drift from the RoPA register`, href: "/discovery/ropa", cta: "Open ROPA" });

  return (
    <Shell active="/dashboard" title="Dashboard">
      <PageHead title="Dashboard" titleTip="Your landing surface — a summary of what needs attention, pulled together from across the platform." />

      <OnboardingBanners state={banners} />

      <nav className="stepper" style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <Link key={t} href={`/dashboard?tab=${t}`} className={`step${t === tab ? " active" : ""}`}>
            <span className="step-label">{TAB_LABEL[t]}</span>
          </Link>
        ))}
      </nav>

      {tab === "operations" && (
        <>
          {/* Tier 1 — pinned, never removable. */}
          <div className="stat-row" style={{ marginBottom: 16 }}>
            <Stat label="Open requests" value={metrics.openRequests} />
            <Stat label="Past deadline" value={metrics.pastDeadline} tone={metrics.pastDeadline ? "red" : undefined} />
            <Stat label="Blocked on retention" value={metrics.blockedOnRetention} tone={metrics.blockedOnRetention ? "yellow" : undefined} />
            <Stat label="With failures" value={metrics.withFailures} tone={metrics.withFailures ? "red" : undefined} />
            <Stat label="Open escalations" value={metrics.openEscalations} tone={metrics.openEscalations ? "yellow" : undefined} />
            <Stat label="Processors unreachable" value={metrics.processorsUnreachable} tone={metrics.processorsUnreachable ? "red" : undefined} />
          </div>

          {/* Tier 2 — recommended. */}
          <div className="grid-2" style={{ marginBottom: 16 }}>
            <WidgetCard id="completion_donut" metrics={metrics} />
            <WidgetCard id="ropa_drift" metrics={metrics} />
            <WidgetCard id="principal_linkage" metrics={metrics} />
            <WidgetCard id="notices_pending" metrics={metrics} />
          </div>

          <div className="grid-2">
            <Card title="Critical alerts">
              {alerts.length === 0 ? (
                <p className="cell-sub" style={{ margin: 0 }}>Nothing urgent right now.</p>
              ) : (
                <div className="stack" style={{ gap: 8 }}>
                  {alerts.map((a, i) => (
                    <div key={i} className="row" style={{ gap: 8, justifyContent: "space-between", alignItems: "center" }}>
                      <span className="row" style={{ gap: 8 }}>
                        <Pill tone={a.severity}>{a.severity === "red" ? "Urgent" : "Attention"}</Pill>
                        <span>{a.text}</span>
                      </span>
                      <Link href={a.href} className="btn xs">{a.cta} →</Link>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Recent activity">
              {recent.length === 0 ? (
                <p className="cell-sub" style={{ margin: 0 }}>No activity logged yet.</p>
              ) : (
                <div className="stack" style={{ gap: 6 }}>
                  {recent.map((e) => (
                    <div key={e.seq} className="row" style={{ gap: 8, justifyContent: "space-between" }}>
                      <span><span className="cell-primary">{prettyAction(e.action)}</span> <span className="cell-sub">on {e.targetType}</span></span>
                      <span className="cell-sub" style={{ whiteSpace: "nowrap" }}>{ROLE_LABEL[e.actorRole as ActorRole] ?? e.actorRole} · {formatDateTime(e.timestamp)}</span>
                    </div>
                  ))}
                  <Link href="/audit" className="btn sm ghost" style={{ marginTop: 6 }}>Full log search →</Link>
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      {tab === "data-health" && (
        <div className="grid-2">
          <WidgetCard id="discovery_coverage" metrics={metrics} />
          <WidgetCard id="ropa_coverage_pct" metrics={metrics} />
          <WidgetCard id="principal_linkage" metrics={metrics} />
          <WidgetCard id="ropa_drift" metrics={metrics} />
          <WidgetCard id="classification_backlog" metrics={metrics} />
          <WidgetCard id="fiduciary_sdf" metrics={metrics} />
          <WidgetCard id="systems_by_status" metrics={metrics} />
          <WidgetCard id="processors_by_status" metrics={metrics} />
        </div>
      )}

      {tab === "compliance" && (
        <div className="grid-2">
          <WidgetCard id="compliance_score" metrics={metrics} />
          <WidgetCard id="policy_violations" metrics={metrics} />
          <WidgetCard id="vendor_risk" metrics={metrics} />
          <WidgetCard id="notices_pending" metrics={metrics} />
          <WidgetCard id="protection_exceptions" metrics={metrics} />
          <WidgetCard id="over_broad_access" metrics={metrics} />
          <WidgetCard id="audit_log_volume" metrics={metrics} />
        </div>
      )}

      {tab === "my-dashboard" && (
        <MyDashboard metrics={metrics} initial={initialWidgets} role={role} />
      )}
    </Shell>
  );
}
