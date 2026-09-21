import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, Stat } from "@/components/ui";
import { BreachIncidentsList, type IncidentRow } from "@/components/breach/BreachIncidentsList";
import { clock } from "@/lib/breach";

export const dynamic = "force-dynamic";

export default async function BreachIncidentsPage() {
  const [incidents, entities] = await Promise.all([
    db.breachIncident.findMany({ include: { entity: { select: { name: true } } }, orderBy: { detectedAt: "desc" } }),
    db.entity.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const rows: IncidentRow[] = incidents.map((i) => ({
    id: i.id, reference: i.reference, category: i.category, severity: i.severity, status: i.status,
    reportedVia: i.reportedVia, detectedAt: i.detectedAt.toISOString(), entityName: i.entity?.name ?? null, owner: i.owner,
  }));

  const open = incidents.filter((i) => i.status !== "closed");
  const overdue = open.filter((i) => !["board_notified", "remediation", "closed"].includes(i.status) && clock(i.detectedAt.toISOString()).band === "breached").length;
  const critical = open.filter((i) => i.severity === "critical").length;

  return (
    <Shell active="/breach/incidents" title="Breach Management / Incidents">
      <PageHead title="Incidents" titleTip="Personal-data breach intake through Board notification and remediation. The 72-hour clock (DPDP s.8(6)) starts at detection and is surfaced from the breach_clock notification category." />
      <div className="stat-row">
        <Stat label="Open incidents" value={open.length} tone={open.length ? "yellow" : undefined} />
        <Stat label="Critical" value={critical} tone={critical ? "red" : undefined} />
        <Stat label="Past 72h, not notified" value={overdue} tone={overdue ? "red" : undefined} />
      </div>
      <BreachIncidentsList rows={rows} entities={entities} />
    </Shell>
  );
}
