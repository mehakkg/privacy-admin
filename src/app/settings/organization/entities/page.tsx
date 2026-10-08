import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { EntitiesManager, type EntityRow } from "@/components/activities/EntitiesManager";

export const dynamic = "force-dynamic";

/** SCREEN 11 — Settings › Organization › Entities (the former Fiduciaries). */
export default async function EntitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [entities, counts, cfg] = await Promise.all([
    db.entity.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, legalName: true } }),
    db.processingActivity.groupBy({ by: ["entityId"], _count: true }),
    db.integrationConfig.findUnique({ where: { id: "singleton" }, select: { paMultiEntity: true } }),
  ]);
  const usedBy = new Map(counts.map((c) => [c.entityId, c._count] as [string | null, number]));
  const rows: EntityRow[] = entities.map((e) => ({ id: e.id, name: e.name, legalName: e.legalName, usedBy: usedBy.get(e.id) ?? 0 }));
  return (
    <Shell active="/settings/organization/entities" title="Entities">
      <EntitiesManager rows={rows} multiEntity={cfg?.paMultiEntity ?? false} moved={sp.moved === "fiduciaries"} />
    </Shell>
  );
}
