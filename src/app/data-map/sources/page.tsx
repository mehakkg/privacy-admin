import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { InfoTip, PageHead, Pill, Stat, formatDate } from "@/components/ui";
import { sourceStatus, SOURCE_STATUS_LABEL, SOURCE_STATUS_TONE, SOURCE_STATUS_TIP, SOURCE_KIND_LABEL } from "@/lib/sources";

export const dynamic = "force-dynamic";

/**
 * SOURCES — a connection/status registry, deliberately thin. It answers one
 * question: what's connected, and is it approved to be scanned. Detection,
 * scheduling and execution belong to DLP; the one governance decision native
 * here is scan-scope approval, kept prominent.
 */
export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; type?: string }>;
}) {
  const params = await searchParams;
  const term = (params.q ?? "").trim().toLowerCase();

  const sources = await db.discoverySource.findMany({
    include: { _count: { select: { fields: true } } },
    orderBy: { name: "asc" },
  });

  let rows = sources.map((s) => ({ s, status: sourceStatus(s) }));
  if (params.status) rows = rows.filter((r) => r.status === params.status);
  if (params.type) rows = rows.filter((r) => r.s.kind === params.type);
  if (term) rows = rows.filter((r) => r.s.name.toLowerCase().includes(term) || r.s.kind.includes(term));

  const awaiting = sources.filter((s) => sourceStatus(s) === "awaiting_approval").length;
  const failed = sources.filter((s) => sourceStatus(s) === "failed").length;

  return (
    <Shell active="/data-map/sources" title="Data Map / Sources">
      <PageHead
        title="Sources"
        titleTip="What's connected, and whether it's approved to be scanned. Connection status is read from DLP; the one decision this screen owns is DPO scope approval."
        actions={<Link href="/onboarding/sources" className="btn primary sm">+ Add source</Link>}
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Sources" value={sources.length} />
        <Stat label="Awaiting approval" value={awaiting} tone={awaiting ? "yellow" : undefined} />
        <Stat label="Last scan failed" value={failed} tone={failed ? "red" : undefined} />
      </div>

      <CompactFilterBar
        basePath="/data-map/sources"
        searchPlaceholder="Search sources…"
        facets={[
          { key: "status", label: "Status", options: [
            { value: "current", label: "Current" },
            { value: "never_scanned", label: "Never scanned" },
            { value: "awaiting_approval", label: "Awaiting approval" },
            { value: "failed", label: "Last scan failed" },
          ] },
          { key: "type", label: "Type", options: [
            { value: "database", label: "Database" },
            { value: "cloud_storage", label: "Cloud storage" },
            { value: "saas", label: "SaaS tool" },
            { value: "file_share", label: "File share" },
          ] },
        ]}
      />

      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr><th>Name</th><th>Type</th><th>Status</th><th>Last scanned <span className="cell-sub">(DLP)</span></th><th>Fields <span className="cell-sub">(DLP)</span></th></tr>
          </thead>
          <tbody>
            {rows.map(({ s, status }) => (
              <tr key={s.id}>
                <td><Link href={`/data-map/sources/${s.id}`} className="row-link">{s.name}</Link></td>
                <td className="cell-sub">{SOURCE_KIND_LABEL[s.kind] ?? s.kind}</td>
                <td>
                  <span className="row" style={{ gap: 5 }}>
                    <Pill tone={SOURCE_STATUS_TONE[status]}>{SOURCE_STATUS_LABEL[status]}</Pill>
                    <InfoTip align="left" text={SOURCE_STATUS_TIP[status]} />
                  </span>
                </td>
                <td className="cell-sub">{s.lastScanned ? formatDate(s.lastScanned) : "—"}</td>
                <td className="mono cell-sub">{s._count.fields}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5}><div className="empty">
                <p style={{ margin: "0 0 12px" }}>{sources.length === 0 ? "No sources connected yet." : "No source matches this view."}</p>
                <Link href="/onboarding/sources" className="btn primary sm">Add a source</Link>
              </div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
