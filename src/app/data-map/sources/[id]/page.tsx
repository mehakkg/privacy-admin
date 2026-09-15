import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { Card, Chip, KeyValue, Notice, PageHead, Pill, formatDate, formatDateTime } from "@/components/ui";
import { sourceStatus, SOURCE_STATUS_LABEL, SOURCE_STATUS_TONE, SOURCE_KIND_LABEL } from "@/lib/sources";

export const dynamic = "force-dynamic";

const TABS = ["overview", "history"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { overview: "Overview", history: "Scan History" };

const CLOSED = new Set(["closed", "completed", "rejected", "fulfilled"]);

/**
 * SOURCE DETAIL — a lightweight 2-tab anchor entity. Overview surfaces the one
 * governance gate this product owns (scope approval); Scan History is a read-only
 * pass-through of DLP's runs — this product stores none of it, and shows an
 * explicit "unavailable" state rather than a stale cached copy.
 */
export default async function SourceDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? "") ? (rawTab as Tab) : "overview";

  const source = await db.discoverySource.findUnique({
    where: { id },
    include: { _count: { select: { fields: true } }, scanRuns: { orderBy: { startedAt: "desc" }, take: 25 }, connectedSystem: true },
  });
  if (!source) notFound();

  const status = sourceStatus(source);
  const approved = source.dpoApprovedForScanning;
  const runs = source.scanRuns;
  // Scan history is DLP's; we can't reach it when the source connection is down.
  const historyUnavailable = source.connectionState === "failed";

  // "Currently referenced by" — open requests whose execution targets this
  // source's system facet, so disconnecting isn't done blind.
  const referencedBy: { ref: string; status: string }[] = [];
  if (source.connectedSystemId) {
    const execs = await db.executionRecord.findMany({
      where: { systemId: source.connectedSystemId },
      include: { request: true },
      orderBy: { createdAt: "desc" },
    });
    const seen = new Set<string>();
    for (const e of execs) {
      if (!e.request || CLOSED.has(e.request.status) || seen.has(e.request.id)) continue;
      seen.add(e.request.id);
      referencedBy.push({ ref: e.request.referenceCode, status: e.request.status });
    }
  }

  return (
    <Shell active="/data-map/sources" title={`Sources / ${source.name}`}>
      <PageHead
        crumbs={[{ label: "Sources", href: "/data-map/sources" }, { label: source.name }]}
        title={source.name}
        subtitle={
          <span className="row" style={{ gap: 8 }}>
            <Pill tone={SOURCE_STATUS_TONE[status]}>{SOURCE_STATUS_LABEL[status]}</Pill>
            <Chip>{SOURCE_KIND_LABEL[source.kind] ?? source.kind}</Chip>
            <span className="cell-sub">{source._count.fields} fields (DLP)</span>
          </span>
        }
      />

      <nav className="stepper">
        {TABS.map((t) => (
          <Link key={t} href={`/data-map/sources/${id}?tab=${t}`} className={`step${t === tab ? " active" : ""}`}>
            <span className="step-label">{TAB_LABEL[t]}</span>
            {t === "history" && runs.length > 0 && <span className="step-sub">{runs.length} runs</span>}
          </Link>
        ))}
      </nav>

      {!approved && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="policy" title="Awaiting governance approval">
            <p style={{ margin: "0 0 8px" }}>
              Discovery scope for this source has not been approved by the DPO. Deciding what personal data the organisation looks at is a governance decision — scanning stays unavailable until it is approved.
            </p>
            <Link href="/escalations?status=open" className="btn sm">View the pending approval request →</Link>
          </Notice>
        </div>
      )}

      {tab === "overview" && (
        <div className="stack" style={{ gap: 16 }}>
          <Card title="Connection & scope">
            <KeyValue
              rows={[
                ["Connection state (DLP)", <Pill key="c" tone={source.connectionState === "connected" ? "green" : source.connectionState === "failed" ? "red" : "gray"}>{source.connectionState.replace("_", " ")}</Pill>],
                ["Approved for scanning", approved ? <Pill key="a" tone="green">Yes — DPO approved</Pill> : <Pill key="a" tone="purple">Awaiting approval</Pill>],
                ["Last scanned (DLP)", source.lastScanned ? formatDateTime(source.lastScanned) : "—"],
                ["Fields discovered (DLP)", source._count.fields],
              ]}
            />
            {source.connectionState === "failed" && source.failureDetail && (
              <div style={{ marginTop: 12 }}>
                <Notice tone="danger" title={`Connection failed — ${source.failureCode ?? "unknown"}`}>{source.failureDetail}</Notice>
              </div>
            )}
          </Card>

          <Card title={`Currently referenced by (${referencedBy.length})`}>
            {referencedBy.length === 0 ? (
              <p className="cell-sub" style={{ margin: 0 }}>No open requests reference this source. Disconnecting it now affects nothing in flight.</p>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                <p className="cell-sub" style={{ margin: "0 0 4px" }}>Disconnecting this source would affect these open requests:</p>
                {referencedBy.map((r) => (
                  <div key={r.ref} className="row" style={{ justifyContent: "space-between" }}>
                    <Link href="/requests" className="row-link mono">{r.ref}</Link>
                    <span className="cell-sub">{r.status.replace("_", " ")}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "history" && (
        <Card title="Scan history (from DLP)">
          {historyUnavailable ? (
            <Notice tone="warn" title="Unable to reach scan history">
              DLP&rsquo;s scan history for this source can&rsquo;t be reached right now. This product stores none of it locally, so rather than show a stale copy, nothing is displayed. Re-check the connection under Integrations.
            </Notice>
          ) : runs.length === 0 ? (
            <div className="empty"><p style={{ margin: 0 }}>DLP has no scan runs recorded for this source.</p></div>
          ) : (
            <div className="table-wrap">
              <table className="dtable">
                <thead><tr><th>Started</th><th>Result</th><th>Change vs previous</th></tr></thead>
                <tbody>
                  {runs.map((run, i) => {
                    const prev = runs[i + 1];
                    const delta = prev ? run.fieldsFound - prev.fieldsFound : null;
                    return (
                      <tr key={run.id}>
                        <td className="cell-sub">{formatDate(run.startedAt)}</td>
                        <td><Pill tone={run.status === "completed" ? "green" : run.status === "partial" ? "yellow" : "red"}>{run.status}</Pill></td>
                        <td className="cell-sub">
                          {delta === null ? "first run" : delta === 0 ? "no change" : <span style={{ color: delta > 0 ? "var(--blue)" : "var(--yellow)" }}>{delta > 0 ? "+" : ""}{delta} fields</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="cell-sub" style={{ marginTop: 10 }}>Read-only pass-through from DLP. Scheduling and execution live in DLP, not here.</p>
            </div>
          )}
        </Card>
      )}
    </Shell>
  );
}
