import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { PageHead, Stat, formatDate } from "@/components/ui";
import { NewNoticeButton } from "@/components/consentActions";
import { NoticesTable, type NoticeRow } from "@/components/noticesTable";
import { decodeList } from "@/lib/codec/json";
import { DATA_CATEGORIES, DATA_CATEGORY_LABEL, type DataCategory } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * NOTICES — list. A notice gets a full detail page (not a drawer) because it
 * has real depth: content, version history, language variants, publish
 * settings. The list carries the same routine actions the detail page does —
 * Edit, history, duplicate, retire, delete — so common operations don't force a
 * full navigation.
 */
export default async function NoticesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; fiduciary?: string; category?: string; purpose?: string }>;
}) {
  const params = await searchParams;
  const term = (params.q ?? "").trim();

  const notices = await db.notice.findMany({
    where: {
      ...(params.status ? { status: params.status } : {}),
      ...(term ? { name: { contains: term } } : {}),
      ...(params.fiduciary ? { fiduciaryId: params.fiduciary } : {}),
      ...(params.category ? { dataCategory: params.category } : {}),
      ...(params.purpose ? { purposeTagId: params.purpose } : {}),
    },
    include: {
      _count: { select: { variants: true } },
      fiduciary: true,
      purposeTag: true,
      supersededBy: true,
      revisions: { orderBy: { savedAt: "desc" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const [all, fiduciaries, purposes] = await Promise.all([
    db.notice.findMany({ select: { status: true } }),
    db.entity.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.purposeTag.findMany({ where: { status: "approved" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const published = all.filter((n) => n.status === "published").length;
  const draft = all.filter((n) => n.status === "draft").length;
  const retired = all.filter((n) => n.status === "retired").length;

  const rows: NoticeRow[] = notices.map((n) => ({
    id: n.id,
    name: n.name,
    fiduciaryName: n.fiduciary?.name ?? null,
    dataCategoryLabel: n.dataCategory ? (DATA_CATEGORY_LABEL[n.dataCategory as DataCategory] ?? n.dataCategory) : null,
    purposeName: n.purposeTag?.name ?? null,
    version: n.currentVersion,
    status: n.status,
    approvalState: n.approvalState,
    regionCount: decodeList(n.regionsJson).length,
    languageCount: n._count.variants || 1,
    updated: formatDate(n.updatedAt),
    supersededByName: n.supersededBy?.name ?? null,
    history: n.revisions.map((r) => ({ version: r.version, note: r.note, savedBy: r.savedBy, savedAt: r.savedAt.toISOString() })),
  }));

  const selectedFiduciaryName = params.fiduciary
    ? fiduciaries.find((f) => f.id === params.fiduciary)?.name
    : undefined;

  const existing = notices.map((n) => ({ id: n.id, name: n.name }));

  return (
    <Shell active="/consent" title="Consent & Notices / Notices">
      <PageHead
        title="Notices"
        titleTip="Privacy notices Admin publishes. The approved substance is the DPO's; the implementation — regions, language variants, versioning — is Admin's. Publishing itself is DPO-gated."
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Notices" value={all.length} />
        <Stat label="Published" value={published} tone={published ? "green" : undefined} />
        <Stat label="Draft" value={draft} tone={draft ? "yellow" : undefined} />
        <Stat label="Retired" value={retired} />
      </div>

      <CompactFilterBar
        basePath="/consent/notices"
        searchPlaceholder="Search notices…"
        facets={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "draft", label: "Draft" },
              { value: "published", label: "Published" },
              { value: "retired", label: "Retired" },
            ],
          },
          {
            key: "fiduciary",
            label: "Fiduciary",
            options: fiduciaries.map((f) => ({ value: f.id, label: f.name })),
          },
          {
            key: "category",
            label: "Category",
            options: DATA_CATEGORIES.map((c) => ({ value: c, label: DATA_CATEGORY_LABEL[c] })),
          },
          {
            key: "purpose",
            label: "Purpose",
            options: purposes.map((p) => ({ value: p.id, label: p.name })),
          },
        ]}
        actions={<NewNoticeButton existing={existing} />}
      />

      {rows.length === 0 ? (
        <div className="empty">
          <p style={{ margin: "0 0 6px" }}>
            {selectedFiduciaryName
              ? `No notices yet for ${selectedFiduciaryName}.`
              : "No notices match this view."}
          </p>
          <p className="cell-sub" style={{ margin: "0 0 12px" }}>
            Every notice needs to exist before its linked consent flow can go live.
          </p>
          <NewNoticeButton existing={existing} />
        </div>
      ) : (
        <NoticesTable rows={rows} />
      )}
    </Shell>
  );
}
