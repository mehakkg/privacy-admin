import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { Card, InfoTip, PageHead, Pill, Stat, formatDate } from "@/components/ui";
import { TriageBulkBar } from "@/components/discoveryActions";
import type { PillTone } from "@/components/ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const TABS = [
  { key: "low_confidence", label: "Low-confidence" },
  { key: "new_pii", label: "New PII" },
  { key: "rot", label: "ROT candidates" },
  { key: "duplicate", label: "Duplicates" },
  { key: "quarantine", label: "Quarantined" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const PRIORITY_TONE: Record<string, PillTone> = {
  high: "red",
  medium: "yellow",
  low: "gray",
};

const CROSSREF_LABEL: Record<string, string> = {
  low_confidence: "Low-confidence",
  new_pii: "New PII",
  rot: "ROT",
  duplicate: "Duplicates",
  quarantine: "Quarantined",
};

/**
 * SCREEN 2 — Triage Queue.
 *
 * Tabbed by type, never a single feed. Different item types need different
 * judgements and carry different urgency; merging them produces a list long
 * enough to ignore and undifferentiated enough to be useless.
 *
 * An item that qualifies for two categories appears ONCE, in its primary tab,
 * with a cross-reference badge. Duplicating the row would make the counts lie.
 */
export default async function TriagePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string; entity?: string }>;
}) {
  const params = await searchParams;
  const tab: TabKey = (TABS.map((t) => t.key) as string[]).includes(params.tab ?? "")
    ? (params.tab as TabKey)
    : "low_confidence";
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

      <div className="stat-row">
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

      <Card title={`${TABS.find((t) => t.key === tab)?.label} (${total})`}>
        {items.length === 0 ? (
          <div className="empty">
            <p style={{ margin: "0 0 10px" }}>Nothing open in this category.</p>
            <Link href="/discovery/inventory" className="btn sm">
              Browse the inventory
            </Link>
          </div>
        ) : (
          <>
            <div className="table-wrap" style={{ marginBottom: 14 }}>
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Source</th>
                    <th>Priority</th>
                    <th>Raised</th>
                    <th>Also in</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="cell-stack">
                          <span className="mono cell-primary">{labelFor(item)}</span>
                          {item.note && <span className="cell-sub">{item.note}</span>}
                          {item.field?.driftFlag && <Pill tone="orange">Drift</Pill>}
                        </div>
                      </td>
                      <td className="cell-sub">{item.field?.source.name ?? "—"}</td>
                      <td>
                        <Pill tone={PRIORITY_TONE[item.priority] ?? "gray"}>{item.priority}</Pill>
                      </td>
                      <td className="cell-sub">{formatDate(item.createdAt)}</td>
                      <td>
                        {item.crossRefType ? (
                          <span className="row" style={{ gap: 5 }}>
                            <Link
                              href={`/discovery/triage?tab=${item.crossRefType}`}
                              className="btn xs ghost"
                            >
                              {CROSSREF_LABEL[item.crossRefType]}
                            </Link>
                            <InfoTip
                              align="left"
                              text="This record also qualifies for another category. It is listed once, here, so the counts stay honest — this links to the other view."
                            />
                          </span>
                        ) : (
                          <span className="cell-sub">—</span>
                        )}
                      </td>
                      <td>
                        {tab === "duplicate" && item.duplicatePairId && (
                          <Link href={`/discovery/duplicates?pair=${item.duplicatePairId}`} className="btn xs">
                            Resolve
                          </Link>
                        )}
                        {tab === "rot" && (
                          <Link href="/discovery/rot" className="btn xs">
                            Resolve
                          </Link>
                        )}
                        {(tab === "low_confidence" || tab === "new_pii") && (
                          <Link href="/discovery/review" className="btn xs">
                            Review
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <TriageBulkBar items={items.map((i) => ({ id: i.id, label: labelFor(i) }))} />

            {pages > 1 && (
              <div className="row" style={{ marginTop: 12, gap: 8 }}>
                <span className="cell-sub">
                  Page {page} of {pages}
                </span>
                {page > 1 && (
                  <Link href={`/discovery/triage?tab=${tab}&page=${page - 1}`} className="btn sm">
                    Previous
                  </Link>
                )}
                {page < pages && (
                  <Link href={`/discovery/triage?tab=${tab}&page=${page + 1}`} className="btn sm">
                    Next
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </Card>
    </Shell>
  );
}
