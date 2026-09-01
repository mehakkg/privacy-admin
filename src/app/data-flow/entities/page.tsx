import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { PageHead } from "@/components/ui";
import {
  EntitiesTable,
  UserMappingTable,
  type EntityRow,
  type MappingRow,
} from "@/components/entityConfig";
import { decodeObject, decodeList } from "@/lib/codec/json";

export const dynamic = "force-dynamic";

export default async function EntitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; entity?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab === "mapping" ? "mapping" : "entities";

  const [entities, mappings] = await Promise.all([
    db.entity.findMany({ include: { _count: { select: { userMappings: true } } }, orderBy: { name: "asc" } }),
    db.entityUserMapping.findMany({ include: { entity: true } }),
  ]);

  const nameById = new Map(entities.map((e) => [e.id, e.name]));

  const entityRows: EntityRow[] = entities.map((e) => ({
    id: e.id,
    name: e.name,
    kind: e.kind,
    parentName: e.hierarchyParentId ? (nameById.get(e.hierarchyParentId) ?? null) : null,
    sdfStatus: e.sdfStatus,
    sdfHistory: decodeObject<{ status: string; note: string; at: string }[]>(e.sdfHistoryJson) ?? [],
    mergerPending: e.mergerPending,
    usersMapped: e._count.userMappings,
  }));

  let mappingRows: MappingRow[] = mappings.map((m) => ({
    id: m.id,
    userName: m.userName,
    entityName: m.entity.name,
    accessScope: m.accessScope,
    additionalEntities: decodeList(m.additionalEntitiesJson).map((id) => nameById.get(id) ?? id),
    justification: m.justification,
  }));

  const term = (params.q ?? "").trim().toLowerCase();
  if (term) mappingRows = mappingRows.filter((m) => m.userName.toLowerCase().includes(term));
  if (params.entity) {
    const name = nameById.get(params.entity);
    mappingRows = mappingRows.filter((m) => m.entityName === name);
  }

  return (
    <Shell active="/data-flow" title="Data Flow / Entities">
      <PageHead
        title="Entity configuration"
        titleTip="Define the business units and legal entities in your organisation. Entity is then a filter dimension on Data Inventory, Requests and elsewhere — not a parallel set of screens."
      />

      <nav className="stepper">
        <Link href="/data-flow/entities" className={`step${tab === "entities" ? " active" : ""}`}>
          <span className="step-label">Entities</span>
        </Link>
        <Link href="/data-flow/entities?tab=mapping" className={`step${tab === "mapping" ? " active" : ""}`}>
          <span className="step-label">User Mapping</span>
        </Link>
      </nav>

      {tab === "entities" ? (
        <EntitiesTable
          rows={entityRows}
          parents={entities.map((e) => ({ id: e.id, name: e.name }))}
        />
      ) : (
        <>
          <CompactFilterBar
            basePath="/data-flow/entities"
            searchKey="q"
            searchPlaceholder="Search users…"
            facets={[
              {
                key: "entity",
                label: "Entity",
                options: entities.map((e) => ({ value: e.id, label: e.name })),
              },
            ]}
          />
          <UserMappingTable
            rows={mappingRows}
            entities={entities.map((e) => ({ id: e.id, name: e.name }))}
          />
        </>
      )}
    </Shell>
  );
}
