import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { PageHead, Stat } from "@/components/ui";
import { sourceHealth } from "@/lib/sources";
import { SourcesView, type SourceRow } from "@/components/datamap/SourcesView";

export const dynamic = "force-dynamic";

/**
 * SOURCES — a connection/health glance registry. Connection health is read from
 * the SAME derived status the notification system uses (a Failed/Stale source is
 * never indistinguishable from a healthy one), and an acquired-entity source is
 * tagged distinctly from a native one.
 */
export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; type?: string; origin?: string }>;
}) {
  const params = await searchParams;
  const term = (params.q ?? "").trim().toLowerCase();
  const now = new Date();

  const [sources, entities] = await Promise.all([
    db.discoverySource.findMany({ include: { _count: { select: { fields: true } } }, orderBy: { name: "asc" } }),
    db.entity.findMany({ select: { id: true, name: true, source: true } }),
  ]);
  const entityById = new Map(entities.map((e) => [e.id, e]));

  let rows: SourceRow[] = sources.map((s) => {
    const ent = s.entityId ? entityById.get(s.entityId) : null;
    const origin = (ent?.source === "acquired" ? "acquired" : "native") as "native" | "acquired";
    return {
      id: s.id, name: s.name, kind: s.kind, health: sourceHealth(s, now),
      lastSync: s.lastScanned ? s.lastScanned.toISOString() : null, fields: s._count.fields,
      origin, entityName: ent?.name ?? null, approved: s.dpoApprovedForScanning,
    };
  });

  if (params.status) rows = rows.filter((r) => r.health === params.status);
  if (params.type) rows = rows.filter((r) => r.kind === params.type);
  if (params.origin) rows = rows.filter((r) => r.origin === params.origin);
  if (term) rows = rows.filter((r) => r.name.toLowerCase().includes(term) || r.kind.includes(term));

  const failed = rows.filter((r) => r.health === "failed").length;
  const stale = rows.filter((r) => r.health === "stale").length;

  return (
    <Shell active="/data-map/sources" title="Data Map / Sources">
      <PageHead
        title="Sources"
        titleTip="Every connected source with its connection health, volume and origin at a glance — a stale or failed source is flagged, not something you discover by accident."
        actions={<Link href="/onboarding/sources" className="btn primary sm">+ Add source</Link>}
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Sources" value={sources.length} />
        <Stat label="Stale" value={stale} tone={stale ? "yellow" : undefined} />
        <Stat label="Failed" value={failed} tone={failed ? "red" : undefined} />
      </div>

      <CompactFilterBar
        basePath="/data-map/sources"
        searchPlaceholder="Search sources…"
        facets={[
          { key: "status", label: "Status", options: [
            { value: "healthy", label: "Healthy" },
            { value: "stale", label: "Stale" },
            { value: "failed", label: "Failed" },
            { value: "awaiting_approval", label: "Awaiting approval" },
            { value: "never_scanned", label: "Never scanned" },
          ] },
          { key: "type", label: "Type", options: [
            { value: "database", label: "Database" },
            { value: "cloud_storage", label: "Cloud storage" },
            { value: "saas", label: "SaaS tool" },
            { value: "file_share", label: "File share" },
          ] },
          { key: "origin", label: "Origin", options: [
            { value: "native", label: "Native" },
            { value: "acquired", label: "Acquired" },
          ] },
        ]}
      />

      <SourcesView rows={rows} />
    </Shell>
  );
}
