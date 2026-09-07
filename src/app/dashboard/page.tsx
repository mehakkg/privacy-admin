import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { Card, InfoTip, PageHead, Pill, Stat, formatDateTime } from "@/components/ui";
import { decodeList } from "@/lib/codec/json";
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

  const [requests, exceptions, escalations, processors, recent, classifiedFields, activities, locations] =
    await Promise.all([
      db.dataPrincipalRequest.findMany(),
      db.retentionException.findMany({ where: { reviewStatus: "unreviewed" } }),
      db.escalation.findMany({ where: { status: "open" } }),
      db.dataProcessor.findMany(),
      db.auditLogEntry.findMany({ orderBy: { seq: "desc" }, take: 8 }),
      db.classifiedField.findMany(),
      db.processingActivity.findMany({ select: { purposeTagId: true } }),
      db.dataLocation.findMany({ select: { dataCategoriesJson: true, principalId: true, stale: true } }),
    ]);

  const blockedIds = new Set(exceptions.map((e) => e.requestId).filter(Boolean) as string[]);
  const pastDeadline = requests.filter(
    (r) => !CLOSED.has(r.status) && r.slaDeadline && r.slaDeadline.getTime() < now,
  );
  const unreachable = processors.filter((p) => p.healthStatus === "unreachable");
  const blocked = requests.filter((r) => !CLOSED.has(r.status) && blockedIds.has(r.id));

  // --- RoPA drift & violations ----------------------------------------------
  // Reality (what DLP classified) checked against the register (what Processing
  // Activities claim is processed). Two disagreements: a field reclassified
  // since the last scan, and processing whose purpose no RoPA record carries.
  const personalFields = classifiedFields.filter((f) => f.category);
  const ropaPurposes = new Set(activities.map((a) => a.purposeTagId).filter(Boolean) as string[]);
  const reclassified = classifiedFields.filter((f) => f.driftFlag);
  const unregistered = personalFields.filter((f) => !f.purposeTagId || !ropaPurposes.has(f.purposeTagId));
  const driftIds = new Set<string>([...reclassified.map((f) => f.id), ...unregistered.map((f) => f.id)]);
  const driftTotal = driftIds.size;

  // --- Data Principal linkage -----------------------------------------------
  // A classified personal-data field is "linked" once its category has been
  // located to at least one identified Data Principal. Heuristic by category
  // until the field-level linkage in Data Inventory is built.
  const linkedCategories = new Set<string>();
  for (const l of locations) for (const c of decodeList(l.dataCategoriesJson)) linkedCategories.add(c);
  const linkedFields = personalFields.filter((f) => f.category && linkedCategories.has(f.category)).length;
  const unlinkedFields = personalFields.length - linkedFields;
  const identifiedPrincipals = new Set(locations.map((l) => l.principalId)).size;
  const staleLocations = locations.filter((l) => l.stale).length;
  const linkedPct = personalFields.length ? Math.round((linkedFields / personalFields.length) * 100) : 0;

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
  if (driftTotal)
    alerts.push({
      severity: "yellow",
      text: `${driftTotal} field${driftTotal === 1 ? "" : "s"} drift from the RoPA register`,
      href: "/discovery/ropa",
      cta: "Open ROPA",
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

      {/* The two dashboard widgets called for by the navigation structure. */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
        <Card
          title={
            <span className="row" style={{ gap: 6 }}>
              RoPA drift &amp; violations
              <InfoTip align="left" text="Reality (what DLP classified) checked against the register (what Processing Activities claim). A gap means the RoPA is out of date, not just that a scan changed." />
            </span>
          }
          actions={<Link href="/discovery/ropa" className="btn xs ghost">Open ROPA →</Link>}
        >
          <div className="row" style={{ gap: 20, alignItems: "baseline" }}>
            <div>
              <div className="stat-value" style={{ fontSize: 30, color: driftTotal ? "var(--yellow)" : "var(--green)" }}>{driftTotal}</div>
              <div className="cell-sub">field{driftTotal === 1 ? "" : "s"} drift from the register</div>
            </div>
          </div>
          <div className="stack" style={{ gap: 4, marginTop: 10 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="cell-sub">Reclassified since last scan</span>
              <span className="cell-primary">{reclassified.length}</span>
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="cell-sub">Processing not in any RoPA record</span>
              <span className="cell-primary">{unregistered.length}</span>
            </div>
          </div>
          {driftTotal === 0 && <p className="cell-sub" style={{ margin: "10px 0 0" }}>The register matches what was scanned.</p>}
        </Card>

        <Card
          title={
            <span className="row" style={{ gap: 6 }}>
              Data Principal linkage
              <InfoTip align="left" text="A classified personal-data field is linked once its data has been located to an identified Data Principal. The field-level linkage lives in Data Inventory." />
            </span>
          }
          actions={<Link href="/discovery/inventory" className="btn xs ghost">Open Data inventory →</Link>}
        >
          <div className="row" style={{ gap: 24, alignItems: "baseline" }}>
            <div>
              <div className="stat-value" style={{ fontSize: 30, color: "var(--green)" }}>{linkedFields}</div>
              <div className="cell-sub">linked</div>
            </div>
            <div>
              <div className="stat-value" style={{ fontSize: 30, color: unlinkedFields ? "var(--yellow)" : undefined }}>{unlinkedFields}</div>
              <div className="cell-sub">unlinked</div>
            </div>
          </div>
          <div className="linkbar" style={{ marginTop: 12 }}>
            <div className="linkbar-fill" style={{ width: `${linkedPct}%` }} />
          </div>
          <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
            <span className="cell-sub">{identifiedPrincipals} identified principal{identifiedPrincipals === 1 ? "" : "s"} mapped</span>
            {staleLocations > 0 && <span className="cell-sub">{staleLocations} location{staleLocations === 1 ? "" : "s"} stale</span>}
          </div>
        </Card>
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
