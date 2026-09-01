import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { PageHead, Pill, Stat, formatDate } from "@/components/ui";
import { NewNoticeButton } from "@/components/consentActions";
import { decodeList } from "@/lib/codec/json";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "green" | "yellow" | "gray"> = {
  published: "green",
  draft: "yellow",
  retired: "gray",
};

/**
 * NOTICES — list. A notice gets a full detail page (not a drawer) because it
 * has real depth: content, version history, language variants, preview and
 * publish settings. Same reasoning as why a Request gets a page and an
 * Escalation gets a drawer.
 */
export default async function NoticesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const term = (params.q ?? "").trim();

  const notices = await db.notice.findMany({
    where: {
      ...(params.status ? { status: params.status } : {}),
      ...(term ? { name: { contains: term } } : {}),
    },
    include: { _count: { select: { variants: true } } },
    orderBy: { updatedAt: "desc" },
  });

  const all = await db.notice.findMany({ select: { status: true } });
  const published = all.filter((n) => n.status === "published").length;
  const draft = all.filter((n) => n.status === "draft").length;

  return (
    <Shell active="/consent" title="Consent & Notices / Notices">
      <PageHead
        title="Notices"
        titleTip="Privacy notices Admin publishes. The approved substance is the DPO's; the implementation — regions, language variants, versioning — is Admin's."
        actions={<NewNoticeButton />}
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Notices" value={all.length} />
        <Stat label="Published" value={published} tone={published ? "green" : undefined} />
        <Stat label="Draft" value={draft} tone={draft ? "yellow" : undefined} />
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
        ]}
      />

      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <th>Notice</th>
              <th>Version</th>
              <th>Status</th>
              <th>Regions</th>
              <th>Languages</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {notices.map((n) => {
              const regions = decodeList(n.regionsJson);
              return (
                <tr key={n.id}>
                  <td>
                    <Link href={`/consent/notices/${n.id}`} className="row-link">
                      {n.name}
                    </Link>
                  </td>
                  <td className="mono cell-sub">{n.currentVersion}</td>
                  <td>
                    <Pill tone={STATUS_TONE[n.status] ?? "gray"}>{n.status}</Pill>
                  </td>
                  <td className="cell-sub">
                    {regions.length ? `${regions.length} region${regions.length === 1 ? "" : "s"}` : "—"}
                  </td>
                  <td className="cell-sub">{n._count.variants || 1}</td>
                  <td className="cell-sub">{formatDate(n.updatedAt)}</td>
                </tr>
              );
            })}
            {notices.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty">
                    <p style={{ margin: "0 0 10px" }}>No notices match this view.</p>
                    <NewNoticeButton />
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
