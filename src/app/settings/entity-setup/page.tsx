import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { EntitySetupForm, type EntityRow } from "@/components/entity/EntitySetupForm";

export const dynamic = "force-dynamic";

/** SCREEN 5 — Entity Setup (acquisition). Create an acquired entity and bulk-
 *  import its user structure, with graceful manual fallback for unparsed rows. */
export default async function EntitySetupPage() {
  const entities = await db.entity.findMany({ include: { _count: { select: { userMappings: true } } }, orderBy: { name: "asc" } });
  const rows: EntityRow[] = entities.map((e) => ({ id: e.id, name: e.name, source: e.source, importStatus: e.importStatus, mappingCount: e._count.userMappings }));

  return (
    <Shell active="/settings/entity-setup" title="Settings / Entity setup">
      <PageHead title="Entity setup" titleTip="Set up a newly acquired organisation's entity record by importing its structure rather than manual entry, reusing Onboarding's Structured-path bulk importer. Partial imports fall back to manual entry for the unparsed remainder only." />
      <EntitySetupForm entities={rows} />
    </Shell>
  );
}
