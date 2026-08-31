import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import {
  Card,
  InfoTip,
  Notice,
  PageHead,
  Pill,
  Stat,
  formatDate,
} from "@/components/ui";
import {
  COVERAGE_LABEL,
  COVERAGE_TONE,
  STALE_AFTER_DAYS,
  coverageOf,
} from "@/lib/engines/discovery";

export const dynamic = "force-dynamic";

const TRIAGE_LABEL: Record<string, string> = {
  low_confidence: "Low-confidence classification",
  new_pii: "New PII",
  rot: "ROT candidate",
  duplicate: "Duplicate",
  quarantine: "Quarantined",
};

/**
 * SCREEN 1 — Discovery & Classification Overview.
 *
 * The home base. Discovery is continuous, so this is a standing view of where
 * coverage actually is, not a report from the last run.
 */
export default async function DiscoveryOverviewPage() {
  let sources: Awaited<ReturnType<typeof db.discoverySource.findMany>> = [];
  let fieldCount = 0;
  let needsReview = 0;
  let rotCount = 0;
  let topItems: { id: string; type: string; priority: string; label: string; createdAt: Date }[] = [];
  let loadFailed = false;
  const asOf = new Date();

  try {
    const [srcs, fields, review, rot, triage] = await Promise.all([
      db.discoverySource.findMany({ orderBy: { name: "asc" } }),
      db.classifiedField.count(),
      db.classifiedField.count({ where: { reviewState: "pending" } }),
      db.rOTCandidate.count({ where: { resolution: "unresolved" } }),
      db.triageItem.findMany({
        where: { status: "open" },
        include: { field: { include: { source: true } }, duplicatePair: true },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        take: 30,
      }),
    ]);
    sources = srcs;
    fieldCount = fields;
    needsReview = review;
    rotCount = rot;

    const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    topItems = triage
      .sort((a, b) => (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3))
      .slice(0, 3)
      .map((t) => ({
        id: t.id,
        type: t.type,
        priority: t.priority,
        createdAt: t.createdAt,
        label:
          t.field?.fieldPath ??
          (t.duplicatePair ? "Duplicate pair" : "Item") +
            (t.field?.source ? ` · ${t.field.source.name}` : ""),
      }));
  } catch {
    loadFailed = true;
  }

  const lastFullScan = sources
    .map((s) => s.lastScanned)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const byCoverage = sources.map((s) => ({ source: s, coverage: coverageOf(s) }));
  const neverScanned = byCoverage.filter((s) => s.coverage === "never_scanned");
  const stale = byCoverage.filter((s) => s.coverage === "stale");
  const awaiting = byCoverage.filter((s) => s.coverage === "awaiting_approval");

  // No sources at all is a setup state, not an empty dashboard.
  if (!loadFailed && sources.length === 0) {
    return (
      <Shell active="/discovery" title="Data Discovery">
        <PageHead
          title="Data Discovery & Classification"
          titleTip="Finds personal data across connected sources and keeps a standing inventory of it. Discovery is continuous, not a one-time scan."
        />
        <Card title="No sources connected">
          <div className="empty">
            <p style={{ margin: "0 0 12px" }}>
              Nothing can be discovered until at least one source is connected.
            </p>
            <Link href="/integrations" className="btn primary">
              Connect a source
            </Link>
          </div>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell active="/discovery" title="Data Discovery">
      <PageHead
        title="Data Discovery & Classification"
        titleTip="Finds personal data across connected sources and keeps a standing inventory of it. Discovery is continuous, not a one-time scan."
        actions={
          <Link href="/discovery/triage" className="btn primary sm">
            Open triage queue
          </Link>
        }
      />

      {loadFailed && (
        <Notice tone="warn" title="Live metrics could not be loaded">
          Showing the last values retrieved. The inventory itself is unaffected —
          only the counts on this page failed to refresh.
          <div className="cell-sub" style={{ marginTop: 4 }}>
            As of {formatDate(asOf)}
          </div>
        </Notice>
      )}

      <div className="stat-row">
        <Stat label="Sources scanned" value={`${byCoverage.filter((s) => s.coverage === "current" || s.coverage === "stale").length}/${sources.length}`} />
        <Stat label="Fields classified" value={fieldCount} />
        <Stat label="Needs review" value={needsReview} tone={needsReview ? "yellow" : undefined} />
        <Stat label="ROT candidates" value={rotCount} tone={rotCount ? "yellow" : undefined} />
        <Stat label="Last scan" value={lastFullScan ? formatDate(lastFullScan) : "Never"} />
      </div>

      {(neverScanned.length > 0 || awaiting.length > 0) && (
        <Notice tone="warn" title="Coverage gaps">
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {neverScanned.length > 0 && (
              <li>
                <strong>{neverScanned.length} approved source(s) have never been
                scanned</strong> — {neverScanned.map((s) => s.source.name).join(", ")}.
                A setup gap: nothing is known about what they hold.
              </li>
            )}
            {awaiting.length > 0 && (
              <li>
                <strong>{awaiting.length} source(s) await governance approval</strong> —{" "}
                {awaiting.map((s) => s.source.name).join(", ")}. The DPO decides
                scanning scope; Admin cannot proceed on these.
              </li>
            )}
            {stale.length > 0 && (
              <li>
                <strong>{stale.length} source(s) are stale</strong> (older than{" "}
                {STALE_AFTER_DAYS} days) — a maintenance gap, not a setup one.
              </li>
            )}
          </ul>
        </Notice>
      )}

      <div className="grid-2">
        <Card
          title={
            <span className="row">
              Source coverage
              <InfoTip
                align="left"
                text={`Never scanned and stale are separate states on purpose. Never scanned is a setup gap — nothing is known about the source at all. Stale means the inventory exists but is older than ${STALE_AFTER_DAYS} days. They need different follow-up.`}
              />
            </span>
          }
        >
          <div className="table-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Coverage</th>
                  <th>Last scanned</th>
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
                      <div className="cell-sub">{source.kind.replace("_", " ")}</div>
                    </td>
                    <td>
                      <Pill tone={COVERAGE_TONE[coverage]}>{COVERAGE_LABEL[coverage]}</Pill>
                    </td>
                    <td className="cell-sub">
                      {source.lastScanned ? formatDate(source.lastScanned) : "—"}
                    </td>
                    <td className="mono cell-sub">
                      <SourceFieldCount sourceId={source.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card
          title="Top priority"
          actions={
            <Link href="/discovery/triage" className="btn sm">
              View all
            </Link>
          }
        >
          {topItems.length === 0 ? (
            <div className="empty">
              <p style={{ margin: "0 0 10px" }}>Nothing is waiting on a decision.</p>
              <Link href="/discovery/inventory" className="btn sm">
                Browse the inventory
              </Link>
            </div>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {topItems.map((item) => (
                <div key={item.id} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                  <Pill tone={item.priority === "high" ? "red" : item.priority === "medium" ? "yellow" : "gray"}>
                    {item.priority}
                  </Pill>
                  <div className="cell-stack">
                    <span className="mono">{item.label}</span>
                    <span className="cell-sub">
                      {TRIAGE_LABEL[item.type] ?? item.type} · {formatDate(item.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Shell>
  );
}

async function SourceFieldCount({ sourceId }: { sourceId: string }) {
  const n = await db.classifiedField.count({ where: { sourceId } });
  return <>{n}</>;
}
