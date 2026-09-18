import { db } from "@/lib/db";
import { PageHead, Stat, formatDate } from "@/components/ui";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { DriftDashboard, type DriftView } from "@/components/access/driftDashboard";
import { decodeList } from "@/lib/codec/json";

export const dynamic = "force-dynamic";

/** SCREEN 6 — Drift Dashboard. Assignments whose current capabilities deviate
 *  from their approved baseline, critical-first. */
export default async function DriftPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string; resolution?: string; q?: string }>;
}) {
  const params = await searchParams;
  const term = (params.q ?? "").trim().toLowerCase();

  const records = await db.driftRecord.findMany({
    include: { assignment: { include: { role: true } } },
    orderBy: { detectedAt: "desc" },
  });

  let rows: DriftView[] = records.map((r) => ({
    id: r.id,
    roleName: r.assignment.role.name,
    userName: r.assignment.userName,
    severity: r.severity,
    resolution: r.resolution,
    detectedAt: formatDate(r.detectedAt),
    traceable: r.traceable,
    changeTrace: r.changeTrace,
    baseline: decodeList(r.baselineSnapshotJson),
    current: decodeList(r.currentSnapshotJson),
    selfApproved: r.selfApproved,
  }));

  // Default sort: critical first, then most recent.
  const rank = (s: string) => (s === "critical" ? 0 : 1);
  rows.sort((a, b) => rank(a.severity) - rank(b.severity));

  const unresolved = rows.filter((r) => r.resolution === "unresolved");
  const critical = unresolved.filter((r) => r.severity === "critical").length;

  if (params.severity) rows = rows.filter((r) => r.severity === params.severity);
  if (params.resolution) rows = rows.filter((r) => r.resolution === params.resolution);
  if (term) rows = rows.filter((r) => r.roleName.toLowerCase().includes(term) || r.userName.toLowerCase().includes(term));

  return (
    <div className="stack">
      <PageHead
        title="Drift"
        titleTip="Accounts whose current capabilities have deviated from their approved baseline, ranked by severity. The weekly diff runs automatically; every drift ends in a recorded decision."
      />

      <div className="stat-row">
        <Stat label="Open drift" value={unresolved.length} tone={unresolved.length ? "red" : undefined} />
        <Stat label="Critical" value={critical} tone={critical ? "red" : undefined} />
        <Stat label="Resolved" value={rows.length - unresolved.length} tone="green" />
      </div>

      <CompactFilterBar
        basePath="/access/drift"
        facets={[
          { key: "severity", label: "Severity", options: [{ value: "critical", label: "Critical" }, { value: "minor", label: "Minor" }] },
          { key: "resolution", label: "Status", options: [{ value: "unresolved", label: "Unresolved" }, { value: "corrected", label: "Corrected" }, { value: "retroactively_approved", label: "Retro-approved" }] },
        ]}
      />

      <DriftDashboard rows={rows} lastScan={formatDate(new Date())} />
    </div>
  );
}
