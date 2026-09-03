import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { Card, PageHead, Pill, Stat, formatDateTime } from "@/components/ui";
import { analyseRole } from "@/lib/guards/baselineGate";
import { ROLE_LABEL, type ActorRole } from "@/lib/domain";

export const dynamic = "force-dynamic";

const CLOSED = new Set(["closed", "completed", "rejected", "fulfilled"]);

function prettyAction(a: string): string {
  return a.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Alert {
  severity: "red" | "yellow";
  text: string;
  href: string;
  cta: string;
}

/**
 * DASHBOARD — the permanent landing surface.
 *
 * Sits above the three macro-groups, ungrouped: it is a summary, not a work
 * queue. The Operations tab pairs a compact Critical Alerts feed (urgent items,
 * pulled together from across the platform) with Recent Activity (the latest
 * logged actions) — distinct from Unified Log Search, which is exhaustive and
 * filterable, and from the metric strips a full dashboard carries.
 */
export default async function DashboardPage() {
  const now = Date.now();

  const [requests, exceptions, escalations, processors, roles, recent] = await Promise.all([
    db.dataPrincipalRequest.findMany(),
    db.retentionException.findMany({ where: { reviewStatus: "unreviewed" } }),
    db.escalation.findMany({ where: { status: "open" } }),
    db.dataProcessor.findMany(),
    db.rBACRole.findMany(),
    db.auditLogEntry.findMany({ orderBy: { seq: "desc" }, take: 8 }),
  ]);

  const blockedIds = new Set(exceptions.map((e) => e.requestId).filter(Boolean) as string[]);
  const pastDeadline = requests.filter(
    (r) => !CLOSED.has(r.status) && r.slaDeadline && r.slaDeadline.getTime() < now,
  );
  const unreachable = processors.filter((p) => p.healthStatus === "unreachable");
  const drift = roles.map(analyseRole).filter((a) => a.severity === "significant");
  const blocked = requests.filter((r) => !CLOSED.has(r.status) && blockedIds.has(r.id));

  const alerts: Alert[] = [];
  if (pastDeadline.length)
    alerts.push({
      severity: "red",
      text: `${pastDeadline.length} request${pastDeadline.length === 1 ? "" : "s"} past the fulfilment deadline`,
      href: "/requests",
      cta: "Open Requests",
    });
  if (unreachable.length)
    alerts.push({
      severity: "red",
      text: `${unreachable.length} processor${unreachable.length === 1 ? "" : "s"} unreachable — a deadline may be at risk`,
      href: "/integrations/health-monitoring",
      cta: "Health Monitoring",
    });
  if (escalations.length)
    alerts.push({
      severity: "yellow",
      text: `${escalations.length} open escalation${escalations.length === 1 ? "" : "s"} awaiting a ruling`,
      href: "/escalations?status=open",
      cta: "Open Escalations",
    });
  if (blocked.length)
    alerts.push({
      severity: "yellow",
      text: `${blocked.length} request${blocked.length === 1 ? "" : "s"} blocked on an unreviewed retention exception`,
      href: "/requests",
      cta: "Open Requests",
    });
  if (drift.length)
    alerts.push({
      severity: "yellow",
      text: `${drift.length} role${drift.length === 1 ? "" : "s"} with significant RBAC drift`,
      href: "/access/roles?drift=significant",
      cta: "RBAC Matrix",
    });

  return (
    <Shell active="/dashboard" title="Dashboard">
      <PageHead
        title="Dashboard"
        titleTip="Your landing surface — a summary of what needs attention, pulled together from across the platform."
      />

      {/* Tabs — Operations is the built one; the fuller dashboard is a follow-on. */}
      <nav className="stepper" style={{ marginBottom: 16 }}>
        <span className="step active"><span className="step-label">Operations</span></span>
      </nav>

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Open requests" value={requests.filter((r) => !CLOSED.has(r.status)).length} />
        <Stat label="Past deadline" value={pastDeadline.length} tone={pastDeadline.length ? "red" : undefined} />
        <Stat label="Open escalations" value={escalations.length} tone={escalations.length ? "yellow" : undefined} />
        <Stat label="Processors unreachable" value={unreachable.length} tone={unreachable.length ? "red" : undefined} />
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
                  <span>
                    <span className="cell-primary">{prettyAction(e.action)}</span>{" "}
                    <span className="cell-sub">on {e.targetType}</span>
                  </span>
                  <span className="cell-sub" style={{ whiteSpace: "nowrap" }}>
                    {ROLE_LABEL[e.actorRole as ActorRole] ?? e.actorRole} · {formatDateTime(e.timestamp)}
                  </span>
                </div>
              ))}
              <Link href="/audit" className="btn sm ghost" style={{ marginTop: 6 }}>
                Full log search →
              </Link>
            </div>
          )}
        </Card>
      </div>
    </Shell>
  );
}
