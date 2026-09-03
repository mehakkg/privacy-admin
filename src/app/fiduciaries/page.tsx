import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { Notice, PageHead } from "@/components/ui";
import {
  EntitiesTable,
  UserMappingTable,
  type EntityRow,
  type MappingRow,
} from "@/components/entityConfig";
import { decodeObject, decodeList } from "@/lib/codec/json";

export const dynamic = "force-dynamic";

/**
 * FIDUCIARIES — the promoted Entity Configuration.
 *
 * Confirmed against production, a Fiduciary record is a superset of what Entity
 * Configuration did: general info, contact, address, an SDF flag, and Linked
 * Users with direct Add-Fiduciary / Add-Grievance-Officer / Add-DPO actions. It
 * is promoted to a top-level CONFIGURE section and leads it, because the
 * dependency chain is Fiduciary → Processing Activity → DPIA: the record has to
 * exist first, structurally.
 *
 * The current Entities / User Mapping tabs are kept working; the full
 * PAM-fidelity screen is intentionally NOT built yet — see the banner. It is
 * blocked on one real decision: whether a Fiduciary is a business unit of one
 * organisation (the current "entity as a filter" model) or a separate tenant,
 * which would need a hard data boundary around every already-built screen, not
 * just a default filter.
 */
export default async function FiduciariesPage({
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
    <Shell active="/fiduciaries" title="Fiduciaries">
      <PageHead
        title="Fiduciaries"
        titleTip="The organisations (or business units) whose data this platform governs. A Fiduciary record is the structural root: Processing Activities and DPIAs scope to it, so it has to exist first."
      />

      <div style={{ marginBottom: 12 }}>
        <Notice tone="info" title="Promoted from Entity Configuration — full version pending one decision">
          <p style={{ margin: "0 0 6px" }}>
            The Entities and User Mapping tabs below are the working core. The full
            PAM-fidelity screen — Domain / Registration&nbsp;# / Website / Contact
            emails / Status columns, and Linked Users with direct{" "}
            <em>Add Fiduciary</em>, <em>Add Grievance Officer</em>, <em>Add DPO</em>{" "}
            actions on the record — is intentionally not built yet.
          </p>
          <p style={{ margin: 0 }}>
            It is blocked on whether a Fiduciary is a business unit of one
            organisation (today&apos;s &ldquo;entity as a filter&rdquo; model) or a separate
            tenant. A separate tenant needs a hard data boundary around every
            already-built screen — a materially bigger change than a rename — so
            the placeholder stays minimal until that is settled.
          </p>
        </Notice>
      </div>

      <nav className="stepper">
        <Link href="/fiduciaries" className={`step${tab === "entities" ? " active" : ""}`}>
          <span className="step-label">Entities</span>
        </Link>
        <Link href="/fiduciaries?tab=mapping" className={`step${tab === "mapping" ? " active" : ""}`}>
          <span className="step-label">Linked users</span>
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
            basePath="/fiduciaries"
            searchKey="q"
            searchPlaceholder="Search users…"
            facets={[
              {
                key: "entity",
                label: "Fiduciary",
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
