import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { Card, Pill, formatDateTime } from "@/components/ui";
import { getCurrentRole } from "@/lib/session";
import { computeDashboardMetrics, type DashboardMetrics } from "@/lib/dashboard/metrics";
import { WIDGET_BY_ID } from "@/lib/dashboard/widgets";
import { ROLE_LABEL, type ActorRole } from "@/lib/domain";
import { personaFor } from "@/lib/products/people";
import { getSetupState } from "@/lib/setup/state";
import { counts as setupCounts, goLive, visibleTasks, isTaskDone, effectiveOwner, ROLE_PERSON, type SetupRole } from "@/lib/setup/tasks";
import { getPurposesView } from "@/lib/engines/purposes";
import { DECLARED_CHANNELS } from "@/lib/activities/systems";
import { daysUntil, ENFORCEMENT } from "@/lib/setup/plan";
import { DashboardSetupStrip } from "@/components/setup/DashboardSetupStrip";

export const dynamic = "force-dynamic";

const TABS = ["operations", "data-health", "compliance"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { operations: "Operations", "data-health": "Data health", compliance: "Compliance & audit" };

/** One catalog widget inside the existing Card. */
function WidgetCard({ id, metrics }: { id: string; metrics: DashboardMetrics }) {
  const def = WIDGET_BY_ID[id];
  if (!def) return null;
  return <Card title={def.name}>{def.render(metrics, def.sizes.includes("full") ? "full" : "compact")}</Card>;
}

interface Alert { severity: "red" | "yellow"; text: string; href: string; cta: string }

// The admin action inbox — representative cross-role work, newest statutory
// deadline first (structure per the command-center comp).
const INBOX: { title: string; sub: string; source: string; lane: string; laneTone: Parameters<typeof Pill>[0]["tone"]; sla: string; slaTone: "red" | "yellow" | "muted"; status: string; statusTone: Parameters<typeof Pill>[0]["tone"] }[] = [
  { title: "Execute erasure across systems", sub: "REQ-1042 · Rahul Kapoor · Customer 88421", source: "Grievance Officer", lane: "Rights request", laneTone: "red", sla: "18h 24m", slaTone: "red", status: "Scope confirmed", statusTone: "blue" },
  { title: "Publish approved privacy notice", sub: "POL-208 · Mobile banking · English + 3 languages", source: "DPO approval", lane: "Approved policy", laneTone: "yellow", sla: "1d 6h", slaTone: "yellow", status: "Ready to implement", statusTone: "yellow" },
  { title: "Revoke offboarded user access", sub: "IAM-761 · Neha Shah · 6 connected systems", source: "miniOrange IAM", lane: "Access change", laneTone: "blue", sla: "2d 3h", slaTone: "muted", status: "Awaiting execution", statusTone: "blue" },
  { title: "Compile deletion evidence", sub: "EVD-093 · Case GR-1019 · PDF evidence package", source: "Grievance Officer", lane: "Evidence request", laneTone: "green", sla: "3d 8h", slaTone: "muted", status: "3 of 4 events found", statusTone: "gray" },
];

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tab?: string; view?: string }> }) {
  const { tab: rawTab, view: rawView } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? "") ? (rawTab as Tab) : "operations";
  const view: "frequent" | "first" = rawView === "first" ? "first" : "frequent";

  const role = await getCurrentRole();
  const [metrics, recent, setup, purposes, fiduciaryCount] = await Promise.all([
    computeDashboardMetrics(),
    db.auditLogEntry.findMany({ orderBy: { seq: "desc" }, take: 4 }),
    getSetupState(),
    getPurposesView(),
    db.entity.count(),
  ]);

  const firstName = personaFor(role).name.split(" ")[0];
  const facts = { fiduciaryCount, approvedPurposes: purposes.counts.approved, channels: DECLARED_CHANNELS.size };
  const sc = setupCounts(setup);
  const caps = goLive(setup, facts);
  const liveCount = caps.filter((c) => c.status === "Live").length;
  const daysLeft = daysUntil(ENFORCEMENT);
  const roleOrder: SetupRole[] = ["admin", "dpo", "ciso", "grievance"];
  const vis = visibleTasks(setup);
  const waitingPeople = roleOrder.filter((r) => r !== role && (r === "admin" || setup.invited.includes(r)))
    .map((r) => { const open = vis.filter((t) => effectiveOwner(t, setup) === r && !isTaskDone(t.id, setup)).length; return open > 0 ? { who: ROLE_PERSON[r], open } : null; })
    .filter(Boolean) as { who: string; open: number }[];
  const waiting = waitingPeople.map((w) => `${w.who} (${w.open})`).join(", ");

  const alerts: Alert[] = [];
  if (metrics.pastDeadline) alerts.push({ severity: "red", text: `${metrics.pastDeadline} request(s) past the fulfilment deadline`, href: "/requests", cta: "Open requests" });
  if (metrics.processorsUnreachable) alerts.push({ severity: "red", text: `${metrics.processorsUnreachable} processor(s) unreachable — a deadline may be at risk`, href: "/integrations/health-monitoring", cta: "Health monitoring" });
  if (metrics.openEscalations) alerts.push({ severity: "yellow", text: `${metrics.openEscalations} escalation(s) awaiting a ruling`, href: "/escalations?status=open", cta: "Open escalations" });
  if (metrics.blockedOnRetention) alerts.push({ severity: "yellow", text: `${metrics.blockedOnRetention} request(s) blocked on a retention exception`, href: "/requests", cta: "Open request" });

  // Command-center action stats, mapped from the live metrics.
  const needsAction = metrics.openRequests;
  const waitingOthers = metrics.openEscalations + metrics.blockedOnRetention;
  const verifiedToday = metrics.completion.verified;
  const atRisk = metrics.pastDeadline;

  const greeting = view === "first" ? `Welcome, ${firstName}` : `Good morning, ${firstName}`;
  const lead = view === "first" ? "Let’s prepare your privacy workspace for a confident first go-live." : "Manage privacy operations, access, integrations, and organization-wide compliance.";

  return (
    <Shell active="/home" title="Home">
      {/* Heading — command-center hierarchy */}
      <div className="dh-head">
        <div>
          <p className="dh-kicker">DPDP Command Center</p>
          <h1 className="page-title" style={{ marginTop: 4 }}>{greeting}</h1>
          <p className="page-subtitle" style={{ marginTop: 6 }}>{lead}</p>
        </div>
        <div className="dh-head-actions">
          <div className="dh-seg">
            <Link href="/home?view=first" className={`dh-seg-btn${view === "first" ? " on" : ""}`}>First-time admin</Link>
            <Link href="/home?view=frequent" className={`dh-seg-btn${view === "frequent" ? " on" : ""}`}>Frequent admin</Link>
          </div>
          <Link href="/requests" className="btn primary">Create action</Link>
        </div>
      </div>

      {/* Setup progress (existing component) */}
      <DashboardSetupStrip requiredDone={sc.requiredDone} requiredTotal={sc.requiredTotal} live={liveCount} youreDone={waitingPeople.length === 0} waiting={waiting} days={daysLeft} amber={daysLeft < 30 && sc.requiredDone < sc.requiredTotal} />

      {/* Acting-within entity bar */}
      <div className="dh-entity">
        <span className="dh-entity-main"><span className="cell-sub">Acting within</span> <strong>Acme India Pvt. Ltd.</strong></span>
        <span className="dh-entity-note">All records, systems, processors and policies are scoped to this obligated entity.</span>
        <Link href="/settings/organization/entities" className="row-link">Switch entity</Link>
      </div>

      {view === "first" ? (
        <FirstTime metrics={metrics} firstName={firstName} sc={sc} liveCount={liveCount} days={daysLeft} waitingPeople={waitingPeople} />
      ) : (
        <>
          {/* Tabs (existing stepper) */}
          <nav className="stepper" style={{ marginBottom: 16, marginTop: 20 }}>
            {TABS.map((t) => (
              <Link key={t} href={`/home?tab=${t}`} className={`step${t === tab ? " active" : ""}`}><span className="step-label">{TAB_LABEL[t]}</span></Link>
            ))}
          </nav>

          {tab === "operations" && (
            <>
              <div className="stat-row" style={{ marginBottom: 16 }}>
                <ActionStat label="Needs your action" value={needsAction} note={`${atRisk} at risk`} tone="red" />
                <ActionStat label="Waiting on others" value={waitingOthers} note={`${metrics.openEscalations} escalations`} tone="yellow" />
                <ActionStat label="Verified today" value={verifiedToday} note="Across connected systems" tone="green" />
                <ActionStat label="At risk tomorrow" value={atRisk} note="Review before the deadline" tone="red" />
              </div>

              <Card title="Needs your action" actions={<Link href="/my-work" className="btn sm ghost">View all actions →</Link>}>
                <p className="cell-sub" style={{ margin: "0 0 12px" }}>Work from every role, ordered by statutory deadline.</p>
                <table className="inv-table dh-inbox">
                  <thead><tr><th>Work item</th><th>Source</th><th>Lane</th><th>SLA remaining</th><th>Status</th></tr></thead>
                  <tbody>
                    {INBOX.map((r) => (
                      <tr key={r.title}>
                        <td><div className="stack" style={{ gap: 2 }}><span className="cell-primary">{r.title}</span><span className="cell-sub">{r.sub}</span></div></td>
                        <td className="cell-sub">{r.source}</td>
                        <td><Pill tone={r.laneTone} dot={false}>{r.lane}</Pill></td>
                        <td><span className={`dh-sla ${r.slaTone}`}>{r.sla}</span></td>
                        <td><Pill tone={r.statusTone}>{r.status}</Pill></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              <div className="grid-2" style={{ marginTop: 16 }}>
                <Card title="Critical alerts">
                  {alerts.length === 0 ? <p className="cell-sub" style={{ margin: 0 }}>Nothing urgent right now.</p> : (
                    <div className="stack" style={{ gap: 8 }}>
                      {alerts.map((a, i) => (
                        <div key={i} className="row" style={{ gap: 8, justifyContent: "space-between", alignItems: "center" }}>
                          <span className="row" style={{ gap: 8 }}><Pill tone={a.severity === "red" ? "red" : "yellow"}>{a.severity === "red" ? "Urgent" : "Attention"}</Pill><span>{a.text}</span></span>
                          <Link href={a.href} className="btn xs">{a.cta} →</Link>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
                <Card title="Recent activity" actions={<Link href="/audit" className="row-link">Audit log</Link>}>
                  {recent.length === 0 ? <p className="cell-sub" style={{ margin: 0 }}>No activity logged yet.</p> : (
                    <div className="stack" style={{ gap: 6 }}>
                      {recent.map((e) => (
                        <div key={e.seq} className="row" style={{ gap: 8, justifyContent: "space-between" }}>
                          <span><span className="cell-primary">{e.action.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span> <span className="cell-sub">on {e.targetType}</span></span>
                          <span className="cell-sub" style={{ whiteSpace: "nowrap" }}>{ROLE_LABEL[e.actorRole as ActorRole] ?? e.actorRole} · {formatDateTime(e.timestamp)}</span>
                        </div>
                      ))}
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
              <WidgetCard id="systems_by_status" metrics={metrics} />
              <WidgetCard id="processors_by_status" metrics={metrics} />
            </div>
          )}

          {tab === "compliance" && (
            <div className="grid-2">
              <WidgetCard id="compliance_score" metrics={metrics} />
              <WidgetCard id="policy_violations" metrics={metrics} />
              <WidgetCard id="vendor_risk" metrics={metrics} />
              <WidgetCard id="protection_exceptions" metrics={metrics} />
              <WidgetCard id="over_broad_access" metrics={metrics} />
              <WidgetCard id="audit_log_volume" metrics={metrics} />
            </div>
          )}
        </>
      )}
    </Shell>
  );
}

function ActionStat({ label, value, note, tone }: { label: string; value: number; note: string; tone: "red" | "yellow" | "green" }) {
  const toneClass = tone === "red" ? "sev-danger" : tone === "yellow" ? "sev-warning" : "sev-success";
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="cell-sub" style={{ marginTop: 2 }}><span className={`dh-dot ${toneClass}`} /> {note}</div>
    </div>
  );
}

function FirstTime({ metrics, firstName, sc, liveCount, days, waitingPeople }: { metrics: DashboardMetrics; firstName: string; sc: { requiredDone: number; requiredTotal: number }; liveCount: number; days: number; waitingPeople: { who: string; open: number }[] }) {
  void firstName; void days;
  const checklist = [
    { title: "Connect your data", desc: "IAM and DLP are connected. Verify one remaining business system.", done: 3, total: 4, href: "/integrations/dlp" },
    { title: "Set governance", desc: "Confirm the accountable contacts and your SDF status.", done: 0, total: 2, href: "/setup" },
    { title: "Prepare experiences", desc: "Configure the rights portal, notices and consent collection.", done: 0, total: 3, href: "/consent/notices" },
  ];
  return (
    <div style={{ marginTop: 20 }}>
      <Card>
        <div className="dh-welcome">
          <div>
            <p className="dh-kicker">Welcome to miniOrange Data Privacy</p>
            <h2 className="card-title" style={{ fontSize: 22, marginTop: 6 }}>Build a trusted privacy foundation</h2>
            <p className="cell-sub" style={{ margin: "8px 0 16px", maxWidth: "46ch" }}>Start with the essentials. We’ll unlock operations and compliance insights as your systems, governance and team become ready.</p>
            <Link href="/setup" className="btn primary">Continue setup →</Link>
          </div>
          <div className="dh-welcome-stat">
            <div className="stat-value" style={{ fontSize: 40 }}>{Math.round((sc.requiredDone / sc.requiredTotal) * 100)}%</div>
            <div className="cell-sub">{sc.requiredDone} of {sc.requiredTotal} required tasks complete · {liveCount} of 3 live</div>
          </div>
        </div>
      </Card>

      <div className="grid-3" style={{ marginTop: 16 }}>
        <div className="stat"><div className="stat-label">Open rights requests</div><div className="stat-value">{metrics.openRequests}</div><div className="cell-sub">Available once request intake is live</div></div>
        <div className="stat"><div className="stat-label">Pending DPO approvals</div><div className="stat-value">{metrics.openEscalations}</div><div className="cell-sub">Awaiting a ruling</div></div>
        <div className="stat"><div className="stat-label">Connected systems</div><div className="stat-value">2</div><div className="cell-sub">1 more system recommended</div></div>
      </div>

      <h2 className="card-title" style={{ fontSize: 17, margin: "24px 0 12px" }}>Three things to get right before go-live</h2>
      <div className="grid-3">
        {checklist.map((c) => (
          <Card key={c.title} footer={<Link href={c.href} className="row-link">Continue →</Link>}>
            <div className="row" style={{ justifyContent: "space-between" }}><strong>{c.title}</strong><span className="cell-sub">{c.done} of {c.total}</span></div>
            <p className="cell-sub" style={{ margin: "8px 0 0" }}>{c.desc}</p>
          </Card>
        ))}
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <Card title="Waiting on your team" actions={<Link href="/settings/organization" className="row-link">Manage team</Link>}>
          {waitingPeople.length === 0 ? <p className="cell-sub" style={{ margin: 0 }}>No one is blocking go-live.</p> : (
            <div className="stack" style={{ gap: 8 }}>
              {waitingPeople.map((w) => (
                <div key={w.who} className="row" style={{ justifyContent: "space-between" }}><span>{w.who}</span><span className="cell-sub">{w.open} open</span></div>
              ))}
            </div>
          )}
        </Card>
        <Card title="What unlocks next">
          <p className="cell-sub" style={{ margin: 0 }}>Once setup is complete, this space becomes a deadline-first inbox for requests, access changes, policy implementation and evidence.</p>
        </Card>
      </div>
    </div>
  );
}
