import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { EntityMappingWorkspace, type UserRow, type EntityOpt } from "@/components/entity/EntityMappingWorkspace";

export const dynamic = "force-dynamic";

/** SCREEN 6 — User-to-Entity Bulk Mapping. Extends the entity-scope model with a
 *  bulk mode + dual-scope validation: a user already scoped to another entity is
 *  excluded from the silent bulk action and flagged for individual review. */
export default async function EntityMappingPage() {
  const [entities, mappings, assignments] = await Promise.all([
    db.entity.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.entityUserMapping.findMany({ include: { entity: { select: { name: true } } } }),
    db.roleAssignment.findMany({ where: { status: "active", entityId: { not: null } }, include: { entity: { select: { name: true } } } }),
  ]);
  const entityOpts: EntityOpt[] = entities.map((e) => ({ id: e.id, name: e.name }));

  // Build the candidate user pool: each distinct userName with a current entity
  // (from an active assignment, else an existing mapping).
  const current = new Map<string, string | null>();
  for (const m of mappings) if (!current.has(m.userName)) current.set(m.userName, m.entity?.name ?? null);
  for (const a of assignments) current.set(a.userName, a.entity?.name ?? current.get(a.userName) ?? null);
  const users: UserRow[] = [...current.entries()].map(([name, currentEntity]) => ({ name, currentEntity })).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Shell active="/access/entity-mapping" title="Identity & Access / User-to-entity mapping">
      <PageHead title="User-to-entity mapping" titleTip="Bulk-map users to their entity scope, extending the Assignment scope model. Any user with active assignments under a different entity is excluded from the bulk action and flagged for individual review — no silent reassignment, no silent dual scope." />
      <EntityMappingWorkspace entities={entityOpts} users={users} />
    </Shell>
  );
}
