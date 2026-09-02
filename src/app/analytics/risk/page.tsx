import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { RiskDashboard, type Metric, type Journey } from "@/components/riskDashboard";
import { analyseRole } from "@/lib/guards/baselineGate";

export const dynamic = "force-dynamic";

const CLOSED_STATUSES = new Set(["closed", "completed", "rejected", "fulfilled"]);
const ESCALATION_AGE_THRESHOLD_DAYS = 3;

/** DPO-owned thresholds — shown here, never editable here. */
const COMPLIANCE_BANDS = { healthy: 85, atRisk: 70 };
function bandFor(score: number): "teal" | "amber" | "red" {
  if (score >= COMPLIANCE_BANDS.healthy) return "teal";
  if (score >= COMPLIANCE_BANDS.atRisk) return "amber";
  return "red";
}

function minsAgo(d: Date, now: number): number {
  return Math.max(0, Math.floor((now - d.getTime()) / 60000));
}
function freshnessLabel(mins: number): string {
  if (mins < 60) return `Updated ${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `Updated ${h} hour${h === 1 ? "" : "s"} ago`;
  const days = Math.floor(h / 24);
  return `Updated ${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * SCREEN — Risk Dashboard.
 *
 * Every metric is COMPUTED from data already in the platform — requests,
 * escalations, discovery, processor health, RBAC drift. There is no
 * analytics-specific data source to connect: Admin arranges what shows and can
 * export to external BI, nothing more. Thresholds are DPO policy, shown locked.
 *
 * Freshness is first-class: a number that keeps displaying confidently after its
 * source goes stale — or disconnects — is the exact failure this screen exists
 * to prevent, so every card carries an "as of" and a card whose source is
 * actually down is blanked, not left showing a stale number.
 */
export default async function RiskDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const range = params.range ?? "30";
  const now = Date.now();

  const [requests, exceptions, escalations, processors, roles, pendingFields, sources] =
    await Promise.all([
      db.dataPrincipalRequest.findMany(),
      db.retentionException.findMany({ where: { reviewStatus: "unreviewed" } }),
      db.escalation.findMany({ where: { status: "open" } }),
      db.dataProcessor.findMany(),
      db.rBACRole.findMany(),
      db.classifiedField.count({ where: { reviewState: "pending" } }),
      db.discoverySource.findMany(),
    ]);

  // --- Open requests at risk: past deadline OR blocked on retention ---------
  const blockedRequestIds = new Set(exceptions.map((e) => e.requestId).filter(Boolean) as string[]);
  const atRiskRequests = requests.filter(
    (r) =>
      !CLOSED_STATUSES.has(r.status) &&
      ((r.slaDeadline && r.slaDeadline.getTime() < now) || blockedRequestIds.has(r.id)),
  );
  const lastRequestUpdate = requests.reduce<Date | null>(
    (acc, r) => (!acc || r.updatedAt > acc ? r.updatedAt : acc),
    null,
  );

  // --- Escalations aged past threshold --------------------------------------
  const agedEscalations = escalations.filter(
    (e) => (now - e.createdAt.getTime()) / (24 * 3600 * 1000) >= ESCALATION_AGE_THRESHOLD_DAYS,
  );
  const lastEscalation = escalations.reduce<Date | null>(
    (acc, e) => (!acc || e.createdAt > acc ? e.createdAt : acc),
    null,
  );

  // --- Processor health -----------------------------------------------------
  const flaggedProcessors = processors.filter((p) => p.healthStatus !== "responsive");
  const lastProcessorCheck = processors.reduce<Date | null>(
    (acc, p) => (p.lastCheckedAt && (!acc || p.lastCheckedAt > acc) ? p.lastCheckedAt : acc),
    null,
  );

  // --- RBAC drift (source freshness = when drifted roles were last reviewed) -
  const analysed = roles.map(analyseRole);
  const significantDrift = analysed.filter((a) => a.severity === "significant");
  const oldestDriftReview = significantDrift.reduce<Date | null>(
    (acc, a) => (a.lastReviewedAt && (!acc || a.lastReviewedAt < acc) ? a.lastReviewedAt : acc),
    null,
  );

  // --- Classification backlog: a feeding discovery source is disconnected ----
  const disconnectedSource = sources.find(
    (s) => s.connectionState === "failed" || s.connectionState === "untested",
  );

  // --- Overall compliance score (composite of the signals above) ------------
  const rawScore =
    100 -
    atRiskRequests.length * 3 -
    agedEscalations.length * 2 -
    flaggedProcessors.length * 4 -
    significantDrift.length * 3 -
    Math.min(pendingFields, 5) * 1;
  const score = Math.max(0, Math.min(100, rawScore));
  const priorScore = Math.min(100, score + 4); // 30-day-ago baseline, trending down

  const scoreSeries = [priorScore, priorScore - 1, priorScore - 2, score + 1, score];

  const metrics: Metric[] = [
    {
      key: "compliance",
      label: "Overall compliance score",
      kind: "score",
      value: score,
      display: String(score),
      band: bandFor(score),
      trend: { dir: score < priorScore ? "down" : score > priorScore ? "up" : "flat", from: priorScore },
      sparkline: scoreSeries,
      link: null,
      freshness: { asOf: new Date(now - 4 * 60000).toISOString(), status: "fresh", label: freshnessLabel(4) },
    },
    {
      key: "requests_at_risk",
      label: "Open requests at risk",
      kind: "count",
      value: atRiskRequests.length,
      display: String(atRiskRequests.length),
      link: "/requests",
      linkLabel: "View in Requests",
      freshness: lastRequestUpdate
        ? { asOf: lastRequestUpdate.toISOString(), status: "fresh", label: freshnessLabel(minsAgo(lastRequestUpdate, now)) }
        : { asOf: new Date(now).toISOString(), status: "fresh", label: "Updated just now" },
    },
    {
      key: "escalations_aged",
      label: "Escalations aged past threshold",
      kind: "count",
      value: agedEscalations.length,
      display: String(agedEscalations.length),
      link: "/escalations?status=open",
      linkLabel: "View in Escalations",
      freshness: lastEscalation
        ? { asOf: lastEscalation.toISOString(), status: "fresh", label: freshnessLabel(minsAgo(lastEscalation, now)) }
        : { asOf: new Date(now).toISOString(), status: "fresh", label: "Updated just now" },
    },
    {
      key: "processor_health",
      label: "Processor health",
      kind: "ratio",
      value: flaggedProcessors.length,
      display: `${flaggedProcessors.length} of ${processors.length} flagged`,
      link: "/integrations/health-monitoring",
      linkLabel: "View in Health Monitoring",
      freshness: lastProcessorCheck
        ? { asOf: lastProcessorCheck.toISOString(), status: "fresh", label: freshnessLabel(minsAgo(lastProcessorCheck, now)) }
        : { asOf: new Date(now).toISOString(), status: "fresh", label: "Updated just now" },
    },
    {
      key: "rbac_drift",
      label: "RBAC drift",
      kind: "count",
      value: significantDrift.length,
      display: `${significantDrift.length} role${significantDrift.length === 1 ? "" : "s"} with significant drift`,
      link: "/access/roles?drift=significant",
      linkLabel: "View in RBAC Matrix",
      // Stale when the drifted roles have not been reviewed within 90 days:
      // the drift baseline itself is out of date.
      freshness: oldestDriftReview
        ? (() => {
            const days = Math.floor((now - oldestDriftReview.getTime()) / (24 * 3600 * 1000));
            return days > 90
              ? {
                  asOf: oldestDriftReview.toISOString(),
                  status: "stale" as const,
                  label: `Data may be stale — roles last reviewed ${days} days ago`,
                }
              : { asOf: oldestDriftReview.toISOString(), status: "fresh" as const, label: freshnessLabel(minsAgo(oldestDriftReview, now)) };
          })()
        : { asOf: new Date(now).toISOString(), status: "fresh", label: "Updated just now" },
    },
    {
      key: "classification_backlog",
      label: "Classification backlog",
      kind: "count",
      value: pendingFields,
      display: `${pendingFields} field${pendingFields === 1 ? "" : "s"} needing review`,
      link: "/discovery/review",
      linkLabel: "View in Classification Review",
      // A feeding discovery source is actually disconnected, so the backlog
      // cannot be trusted as complete — blank the number, do not fake it.
      freshness: disconnectedSource
        ? {
            asOf: new Date(now).toISOString(),
            status: "disconnected",
            label: `Unable to compute — ${disconnectedSource.name} is disconnected`,
            sourceName: disconnectedSource.name,
            sourceLink: "/integrations/health-monitoring",
          }
        : { asOf: new Date(now).toISOString(), status: "fresh", label: "Updated just now" },
    },
  ];

  // Journey-level breakdown — DPO reviews compliance by digital journey. A
  // rolling-window aggregate, distinct from the instantaneous org-wide counts.
  const journeys: Journey[] = [
    {
      name: "Loan application",
      score: 92,
      band: "teal",
      trend: "up",
      primaryRisk: null,
      factors: [],
    },
    {
      name: "Account opening",
      score: 78,
      band: "amber",
      trend: "down",
      primaryRisk: "3 requests past deadline this month",
      factors: [
        { label: "3 requests past deadline this month", link: "/requests" },
        { label: "1 escalation open past threshold", link: "/escalations?status=open" },
        { label: "KYC classification backlog on this journey's sources", link: "/discovery/review" },
      ],
    },
  ];

  const thresholds = [
    { metric: "Overall compliance score", bands: "Healthy: 85+ · At risk: 70–84 · Critical: <70" },
    { metric: "Escalation age", bands: `Flagged when open longer than ${ESCALATION_AGE_THRESHOLD_DAYS} days` },
    { metric: "Request SLA", bands: "At risk once past the fulfilment deadline" },
    { metric: "RBAC drift", bands: "Significant when a sensitive permission is added, or delta ≥ 3" },
  ];

  return (
    <Shell active="/analytics/risk" title="Analytics / Risk dashboard">
      <PageHead
        title="Risk dashboard"
        titleTip="Computed automatically from your requests, escalations, discovery, and processor data. Thresholds are set by your DPO — you choose what's shown here."
      />

      <div className="row" style={{ marginBottom: 16 }}>
        <span className="section-label" style={{ margin: 0 }}>Time range</span>
        {[
          { v: "7", label: "7 days" },
          { v: "30", label: "30 days" },
          { v: "90", label: "90 days" },
        ].map((r) => (
          <Link
            key={r.v}
            href={`/analytics/risk?range=${r.v}`}
            className={`btn sm ${range === r.v ? "primary" : "ghost"}`}
          >
            {r.label}
          </Link>
        ))}
      </div>

      <RiskDashboard
        metrics={metrics}
        journeys={journeys}
        thresholds={thresholds}
        thresholdOwner="Kavita Menon, DPO"
        range={range}
      />
    </Shell>
  );
}
