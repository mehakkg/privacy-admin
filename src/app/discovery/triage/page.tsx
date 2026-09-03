import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, Stat, formatDate } from "@/components/ui";
import { TriageReview } from "@/components/triageReview";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const TABS = [
  { key: "new_pii", label: "New PII" },
  { key: "quarantine", label: "Quarantined" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * SCREEN 2 — Triage Queue.
 *
 * Tabbed by type, never a single feed. Different item types need different
 * judgements and carry different urgency; merging them produces a list long
 * enough to ignore and undifferentiated enough to be useless.
 *
 * Triage surfaces only what genuinely has no other home: newly discovered PII
 * and quarantined items. Low-confidence classifications are NOT here — they are
 * classification decisions, and Classification Review is their single owner.
 * Duplicates and ROT likewise have their own dedicated screens. Each removal
 * closes the same sidebar-vs-tabs duplication already fixed for Requests and
 * Escalations: one queue, surfaced once.
 */
export default async function TriagePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string; entity?: string }>;
}) {
  const params = await searchParams;
  const tab: TabKey = (TABS.map((t) => t.key) as string[]).includes(params.tab ?? "")
    ? (params.tab as TabKey)
    : "new_pii";
  const page = Math.max(1, Number(params.page) || 1);

  const counts = await db.triageItem.groupBy({
    by: ["type"],
    where: { status: "open" },
    _count: true,
  });
  const countOf = (t: string) => counts.find((c) => c.type === t)?._count ?? 0;

  const where = {
    status: "open",
    type: tab,
    ...(params.entity ? { field: { source: { entityId: params.entity } } } : {}),
  };

  const [total, items, entities] = await Promise.all([
    db.triageItem.count({ where }),
    db.triageItem.findMany({
      where,
      include: {
        field: { include: { source: true } },
        duplicatePair: { include: { fieldA: true, fieldB: true } },
      },
      // New PII is newest-first: a fresh discovery is the urgent one. Everything
      // else is oldest-unresolved-first, so nothing rots at the bottom.
      orderBy: tab === "new_pii" ? { createdAt: "desc" } : { createdAt: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.discoverySource.findMany({ select: { entityId: true }, distinct: ["entityId"] }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const entityList = entities.map((e) => e.entityId).filter(Boolean) as string[];

  const labelFor = (item: (typeof items)[number]) =>
    item.field?.fieldPath ??
    (item.duplicatePair
      ? `${item.duplicatePair.fieldA.fieldPath} ↔ ${item.duplicatePair.fieldB.fieldPath}`
      : item.id);

  return (
    <Shell active="/discovery" title="Discovery / Triage">
      <PageHead
        crumbs={[{ label: "Data Discovery", href: "/discovery" }, { label: "Triage" }]}
        title="Triage queue"
        titleTip="Everything discovery has surfaced that needs a decision. Separated by type, because approving a classification and deciding whether to delete stale data are different judgements."
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <Stat
            key={t.key}
            label={t.label}
            value={countOf(t.key)}
            tone={countOf(t.key) > 0 && (t.key === "new_pii" || t.key === "quarantine") ? "red" : undefined}
          />
        ))}
      </div>

      <div className="row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/discovery/triage?tab=${t.key}${params.entity ? `&entity=${params.entity}` : ""}`}
            className={`btn sm ${tab === t.key ? "primary" : "ghost"}`}
          >
            {t.label} ({countOf(t.key)})
          </Link>
        ))}
      </div>

      {entityList.length > 1 && (
        <div className="row" style={{ marginBottom: 12 }}>
          <span className="section-label" style={{ margin: 0 }}>Entity</span>
          <Link href={`/discovery/triage?tab=${tab}`} className={`btn xs ${!params.entity ? "primary" : "ghost"}`}>
            All
          </Link>
          {entityList.map((e) => (
            <Link
              key={e}
              href={`/discovery/triage?tab=${tab}&entity=${e}`}
              className={`btn xs ${params.entity === e ? "primary" : "ghost"}`}
            >
              {e}
            </Link>
          ))}
        </div>
      )}

      <TriageReview
        rows={items.map((item) => ({
          id: item.id,
          type: item.type,
          label: labelFor(item),
          sourceName: item.field?.source.name ?? null,
          priority: item.priority,
          raised: formatDate(item.createdAt),
          note: item.note,
          crossRefType: item.crossRefType,
          driftFlag: item.field?.driftFlag ?? false,
          field:
            item.field && (item.type === "low_confidence" || item.type === "new_pii" || item.type === "quarantine")
              ? {
                  id: item.field.id,
                  detectedType: item.field.detectedType,
                  maskedSample: item.field.maskedSample,
                  previousType: item.field.previousType,
                }
              : null,
          resolveHref:
            item.type === "duplicate" && item.duplicatePairId
              ? `/discovery/duplicates`
              : item.type === "rot"
                ? "/discovery/rot"
                : null,
        }))}
      />

      {pages > 1 && (
        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          <span className="cell-sub">
            Page {page} of {pages}
          </span>
          {page > 1 && (
            <Link href={`/discovery/triage?tab=&page=`} className="btn sm">
              Previous
            </Link>
          )}
          {page < pages && (
            <Link href={`/discovery/triage?tab=&page=`} className="btn sm">
              Next
            </Link>
          )}
        </div>
      )}
    </Shell>
  );
}
