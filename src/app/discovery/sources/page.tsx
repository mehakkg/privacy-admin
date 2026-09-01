import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, Pill, Stat, formatDate } from "@/components/ui";
import { SourceSearch } from "@/components/sourceSearch";
import { COVERAGE_LABEL, COVERAGE_TONE, coverageOf } from "@/lib/engines/discovery";

export const dynamic = "force-dynamic";

/**
 * SOURCES — the entry point for this section.
 *
 * Admin's first action here is connecting data, not reviewing data that does
 * not exist yet. Everything under Review & Classify is downstream of at least
 * one source existing, so this sits above all of it.
 *
 * Search only, no filter bar: this list is a handful of rows in any realistic
 * org. A filter bar here would be scaffolding for a problem that does not
 * arise.
 */
export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const sources = await db.discoverySource.findMany({
    include: { _count: { select: { fields: true } } },
    orderBy: { name: "asc" },
  });

  const term = (q ?? "").trim().toLowerCase();
  const shown = term
    ? sources.filter(
        (s) =>
          s.name.toLowerCase().includes(term) ||
          s.kind.toLowerCase().includes(term),
      )
    : sources;

  const byCoverage = shown.map((s) => ({ source: s, coverage: coverageOf(s) }));
  const awaiting = sources.filter((s) => !s.dpoApprovedForScanning).length;
  const neverScanned = sources.filter(
    (s) => s.dpoApprovedForScanning && !s.lastScanned,
  ).length;

  return (
    <Shell active="/discovery" title="Discovery / Sources">
      <PageHead
        crumbs={[{ label: "Data Discovery", href: "/discovery" }, { label: "Sources" }]}
        title="Sources"
        titleTip="Where personal data lives. Connecting a source only establishes that we can reach it — scanning it is a separate step, and needs DPO approval of the scope."
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Sources" value={sources.length} />
        <Stat
          label="Awaiting approval"
          value={awaiting}
          tone={awaiting ? "yellow" : undefined}
        />
        <Stat
          label="Never scanned"
          value={neverScanned}
          tone={neverScanned ? "red" : undefined}
        />
      </div>

      <SourceSearch
        initial={q ?? ""}
        actions={
          <Link href="/onboarding/sources" className="btn primary sm">
            Add source
          </Link>
        }
      />

      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th>Last synced</th>
              <th>Fields</th>
            </tr>
          </thead>
          <tbody>
            {byCoverage.map(({ source, coverage }) => (
              <tr key={source.id}>
                <td>
                  <Link href={`/discovery/sources/${source.id}`} className="row-link">
                    {source.name}
                  </Link>
                  {source.requiresManualVerification && (
                    <div className="cell-sub">Manual verification</div>
                  )}
                </td>
                <td className="cell-sub">{source.kind.replace("_", " ")}</td>
                <td>
                  <Pill tone={COVERAGE_TONE[coverage]}>{COVERAGE_LABEL[coverage]}</Pill>
                </td>
                <td className="cell-sub">
                  {source.lastScanned ? formatDate(source.lastScanned) : "—"}
                </td>
                <td className="mono cell-sub">{source._count.fields}</td>
              </tr>
            ))}
            {byCoverage.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty">
                    <p style={{ margin: "0 0 12px" }}>
                      {sources.length === 0
                        ? "No sources connected yet. Nothing can be discovered until at least one exists."
                        : `No source matches “${q}”.`}
                    </p>
                    <Link
                      href={sources.length === 0 ? "/onboarding/sources" : "/discovery/sources"}
                      className="btn primary sm"
                    >
                      {sources.length === 0 ? "Add a source" : "Clear search"}
                    </Link>
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
