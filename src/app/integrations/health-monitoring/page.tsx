import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { Notice, PageHead, Stat, formatDate } from "@/components/ui";
import { HealthTable, type HealthRow, type HealthCheckEntry } from "@/components/healthMonitoring";

export const dynamic = "force-dynamic";

const ESCALATE_THRESHOLD_HOURS = 48;
const CLOSED_STATUSES = new Set(["closed", "completed", "rejected", "fulfilled"]);

function decodeHistory(json: string): HealthCheckEntry[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as HealthCheckEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * SCREEN 3 — Health Monitoring.
 *
 * The one place both registries are seen together: it exists specifically
 * because that combined health view lives nowhere else. Health is checked
 * continuously so a dead connection surfaces BEFORE it becomes the reason a
 * statutory deadline was missed — the persistent-issue banner is that early
 * warning, shown only when an in-flight request's deadline is genuinely at risk.
 */
export default async function HealthMonitoringPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string }>;
}) {
  const params = await searchParams;
  const term = (params.q ?? "").trim().toLowerCase();
  const now = new Date();

  const [systems, processors] = await Promise.all([
    db.connectedSystem.findMany({ orderBy: { name: "asc" } }),
    db.dataProcessor.findMany({
      include: { executions: { include: { request: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const systemRows: HealthRow[] = systems.map((s) => {
    const history = decodeHistory(s.healthHistoryJson);
    const statusKey: HealthRow["statusKey"] =
      s.connectionStatus === "degraded"
        ? "degraded"
        : s.connectionStatus === "down"
          ? "unreachable"
          : "healthy";
    const lastOk = history.find((h) => h.ok)?.at ?? s.lastVerifiedAt?.toISOString() ?? null;
    const lastFail = history.find((h) => !h.ok);
    return {
      id: s.id,
      kind: "system",
      name: s.name,
      statusKey,
      lastSuccessfulCheck: lastOk,
      issue: statusKey !== "healthy" ? (lastFail?.detail ?? "Connection is not healthy.") : null,
      history,
      unreachableHours: null,
      canEscalate: statusKey === "unreachable",
    };
  });

  const processorRows: HealthRow[] = processors.map((p) => {
    const history = decodeHistory(p.healthHistoryJson);
    const statusKey: HealthRow["statusKey"] =
      p.healthStatus === "degraded" ? "degraded" : p.healthStatus === "unreachable" ? "unreachable" : "healthy";
    const unreachableHours = p.unreachableSinceAt
      ? Math.floor((now.getTime() - p.unreachableSinceAt.getTime()) / (60 * 60 * 1000))
      : null;
    const lastOk = history.find((h) => h.ok)?.at ?? p.lastCheckedAt?.toISOString() ?? null;
    const lastFail = history.find((h) => !h.ok);
    return {
      id: p.id,
      kind: "processor",
      name: p.name,
      statusKey,
      lastSuccessfulCheck: lastOk,
      issue: statusKey !== "healthy" ? (lastFail?.detail ?? "Processor is not responding.") : null,
      history,
      unreachableHours,
      canEscalate: unreachableHours !== null && unreachableHours >= ESCALATE_THRESHOLD_HOURS,
    };
  });

  let rows = [...systemRows, ...processorRows];
  if (params.type === "system") rows = rows.filter((r) => r.kind === "system");
  if (params.type === "processor") rows = rows.filter((r) => r.kind === "processor");
  if (params.status) rows = rows.filter((r) => r.statusKey === params.status);
  if (term) rows = rows.filter((r) => r.name.toLowerCase().includes(term));

  const systemsHealthy = systemRows.filter((r) => r.statusKey === "healthy").length;
  const systemsDegraded = systemRows.filter((r) => r.statusKey !== "healthy").length;
  const processorsResponsive = processorRows.filter((r) => r.statusKey === "healthy").length;
  const processorsOverdue = processorRows.filter((r) => r.statusKey !== "healthy").length;

  // Persistent-issue banner: an unreachable processor past the threshold that an
  // OPEN request actually depends on — not a general alert for any hiccup.
  let banner: { name: string; hours: number; ref: string; deadline: Date | null } | null = null;
  for (const p of processors) {
    if (p.healthStatus !== "unreachable" || !p.unreachableSinceAt) continue;
    const hours = Math.floor((now.getTime() - p.unreachableSinceAt.getTime()) / (60 * 60 * 1000));
    if (hours < ESCALATE_THRESHOLD_HOURS) continue;
    const dependent = p.executions.find(
      (e) => e.request && !CLOSED_STATUSES.has(e.request.status),
    );
    if (!dependent?.request) continue;
    banner = { name: p.name, hours, ref: dependent.request.referenceCode, deadline: dependent.request.slaDeadline };
    break;
  }

  return (
    <Shell active="/integrations/health-monitoring" title="Integrations / Health monitoring">
      <PageHead
        title="Health monitoring"
        titleTip="Continuous health across connected systems and data processors, so a dead connection surfaces before it becomes the reason a deadline was missed."
      />

      {banner && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="danger" title="A processor outage is putting a request deadline at risk">
            <p style={{ margin: "0 0 8px" }}>
              <strong>{banner.name}</strong> has been unreachable for {banner.hours} hours.
              1 open request depends on this processor
              {banner.deadline && <> and its deadline is {formatDate(banner.deadline)}</>}.
            </p>
            <Link href="/requests" className="btn sm">
              Open {banner.ref} →
            </Link>
          </Notice>
        </div>
      )}

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Systems healthy" value={systemsHealthy} />
        <Stat label="Systems degraded" value={systemsDegraded} tone={systemsDegraded ? "yellow" : undefined} />
        <Stat label="Processors responsive" value={processorsResponsive} />
        <Stat label="Processors overdue" value={processorsOverdue} tone={processorsOverdue ? "red" : undefined} />
      </div>

      <CompactFilterBar
        basePath="/integrations/health-monitoring"
        searchKey="q"
        searchPlaceholder="Search systems and processors…"
        facets={[
          {
            key: "type",
            label: "Type",
            options: [
              { value: "system", label: "System" },
              { value: "processor", label: "Processor" },
            ],
          },
          {
            key: "status",
            label: "Status",
            options: [
              { value: "healthy", label: "Healthy" },
              { value: "degraded", label: "Degraded" },
              { value: "unreachable", label: "Unreachable" },
            ],
          },
        ]}
      />

      <HealthTable rows={rows} />
    </Shell>
  );
}
