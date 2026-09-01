import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import {
  InfoTip,
  PageHead,
  Pill,
  Stat,
  formatDate,
} from "@/components/ui";
import type { PillTone } from "@/components/ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const SENSITIVITY_TONE: Record<string, PillTone> = {
  high: "red",
  medium: "yellow",
  low: "gray",
};

const SYNC_TONE: Record<string, PillTone> = {
  synced: "green",
  pending: "yellow",
  failed: "red",
  not_configured: "gray",
};

const SYNC_LABEL: Record<string, string> = {
  synced: "Synced",
  pending: "Pending",
  failed: "Failed",
  not_configured: "Not set up",
};

/**
 * SCREEN 3 — Data Inventory. The source of truth.
 *
 * Entity is a filter column, not a separate inventory per business unit —
 * splitting it would make an org-wide view impossible, which is the thing an
 * inventory is for.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    source?: string;
    category?: string;
    sensitivity?: string;
    purpose?: string;
    subject?: string;
    entity?: string;
    q?: string;
    untagged?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  // Purpose is multi-select, so it arrives comma-separated.
  const purposeIds = (params.purpose ?? "").split(",").filter(Boolean);
  const term = (params.q ?? "").trim();

  const where = {
    ...(params.source ? { sourceId: params.source } : {}),
    ...(params.category ? { category: params.category } : {}),
    ...(params.sensitivity ? { sensitivityTier: params.sensitivity } : {}),
    ...(purposeIds.length ? { purposeTagId: { in: purposeIds } } : {}),
    ...(params.subject ? { dataSubjectType: params.subject } : {}),
    ...(params.entity ? { source: { entityId: params.entity } } : {}),
    // `untagged` wins over a purpose selection: asking for both is
    // contradictory, and the toggle is the more explicit intent.
    ...(params.untagged === "1" ? { purposeTagId: null } : {}),
    ...(term
      ? {
          OR: [
            { fieldPath: { contains: term } },
            { detectedType: { contains: term } },
            { overriddenType: { contains: term } },
          ],
        }
      : {}),
  };

  const [total, fields, sources, purposes, untaggedCount] = await Promise.all([
    db.classifiedField.count({ where }),
    db.classifiedField.findMany({
      where,
      include: { source: true, purposeTag: true },
      orderBy: [{ sourceId: "asc" }, { fieldPath: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.discoverySource.findMany({ orderBy: { name: "asc" } }),
    db.purposeTag.findMany({ where: { status: "approved" }, orderBy: { name: "asc" } }),
    db.classifiedField.count({ where: { purposeTagId: null } }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const entities = [...new Set(sources.map((s) => s.entityId).filter(Boolean))] as string[];

  const qs = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { ...params, ...patch, page: undefined };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, String(v));
    return `/discovery/inventory${next.toString() ? `?${next}` : ""}`;
  };

  return (
    <Shell active="/discovery" title="Discovery / Inventory">
      <PageHead
        crumbs={[{ label: "Data Discovery", href: "/discovery" }, { label: "Inventory" }]}
        title="Data Inventory"
        titleTip="Every classified field across every connected source. This is the standing record a DPB inquiry would be answered from."
        actions={
          <Link href={`/api/discovery/export${params.source ? `?source=${params.source}` : ""}`} className="btn sm">
            Export CSV
          </Link>
        }
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Fields in view" value={total} />
        <Stat label="Sources" value={sources.length} />
        <Stat
          label="No purpose tag"
          value={untaggedCount}
          tone={untaggedCount ? "yellow" : undefined}
        />
      </div>

      {/* Compact banner: the reason an untagged field matters moved to the
          tooltip on the toggle, so this states the fact and nothing more. */}
      {untaggedCount > 0 && (
        <div className="notice warn compact" style={{ marginBottom: 12 }}>
          <span>
            <strong>{untaggedCount}</strong> field{untaggedCount === 1 ? "" : "s"} have
            no purpose tag.
          </span>
        </div>
      )}

      <CompactFilterBar
        basePath="/discovery/inventory"
        searchPlaceholder="Search fields…"
        facets={[
          { key: "source", label: "Source", options: sources.map((s) => ({ value: s.id, label: s.name })) },
          {
            key: "category",
            label: "Category",
            options: [
              "identity", "contact", "kyc", "financial",
              "transaction", "marketing", "behavioural", "support",
            ].map((c) => ({ value: c, label: c })),
          },
          {
            key: "sensitivity",
            label: "Sensitivity",
            options: ["high", "medium", "low"].map((c) => ({ value: c, label: c })),
          },
          {
            key: "purpose",
            label: "Purpose",
            // Multi-select: a field can legitimately serve more than one purpose.
            multi: true,
            options: purposes.map((p) => ({ value: p.id, label: p.name })),
          },
        ]}
        moreFacets={[
          {
            key: "subject",
            label: "Data subject",
            options: ["customer", "employee", "vendor", "minor"].map((c) => ({ value: c, label: c })),
          },
          ...(entities.length > 0
            ? [{ key: "entity", label: "Entity", options: entities.map((e) => ({ value: e, label: e })) }]
            : []),
        ]}
        toggle={{
          key: "untagged",
          label: "Untagged only",
          tip: "An untagged field has no lawful purpose recorded for holding it. Untagged rows are flagged in the table rather than left blank, because a blank cell reads as nothing to do here.",
        }}
      />

      <div className="row" style={{ marginBottom: 12 }}>
        <span className="cell-sub">
          {total} field{total === 1 ? "" : "s"}
        </span>
      </div>

      <div className="table-wrap" style={{ overflowX: "auto" }}>
          <table className="dtable">
            <thead>
              <tr>
                <th>Field</th>
                <th>Source</th>
                <th>Category</th>
                <th>Sensitivity</th>
                <th>Purpose</th>
                <th>Subject</th>
                <th>Verified</th>
                <th>Catalog</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f.id}>
                  <td>
                    <div className="cell-stack">
                      <span className="mono cell-primary">{f.fieldPath}</span>
                      <span className="cell-sub">
                        {f.overriddenType ?? f.detectedType}
                        {f.driftFlag && (
                          <>
                            {" "}
                            <Pill tone="orange">Drift</Pill>
                          </>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="cell-sub">{f.source.name}</td>
                  <td className="cell-sub">{f.category ?? "—"}</td>
                  <td>
                    <Pill tone={SENSITIVITY_TONE[f.sensitivityTier] ?? "gray"}>
                      {f.sensitivityTier}
                    </Pill>
                  </td>
                  <td>
                    {f.purposeTag ? (
                      <span className="cell-sub">{f.purposeTag.name}</span>
                    ) : (
                      // Flagged, never blank.
                      <span className="row" style={{ gap: 5 }}>
                        <Pill tone="yellow">Untagged</Pill>
                        <InfoTip
                          align="left"
                          text="No lawful purpose has been recorded for this field. Assign one in Classification Review, or raise it with the DPO if no approved purpose fits."
                        />
                      </span>
                    )}
                  </td>
                  <td className="cell-sub">{f.dataSubjectType ?? "—"}</td>
                  <td className="cell-sub">{formatDate(f.lastVerified)}</td>
                  <td>
                    <Pill tone={SYNC_TONE[f.catalogSyncStatus] ?? "gray"}>
                      {SYNC_LABEL[f.catalogSyncStatus] ?? f.catalogSyncStatus}
                    </Pill>
                  </td>
                </tr>
              ))}
              {fields.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="empty">
                      <p style={{ margin: "0 0 10px" }}>No fields match these filters.</p>
                      <Link href="/discovery/inventory" className="btn sm">
                        Clear filters
                      </Link>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      {pages > 1 && (
        <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <span className="cell-sub">
              Page {page} of {pages} · {total} fields
            </span>
            {page > 1 && (
              <Link href={`${qs({})}${qs({}).includes("?") ? "&" : "?"}page=${page - 1}`} className="btn sm">
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={`${qs({})}${qs({}).includes("?") ? "&" : "?"}page=${page + 1}`} className="btn sm">
                Next
              </Link>
            )}
        </div>
      )}
    </Shell>
  );
}

