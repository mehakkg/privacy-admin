import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import {
  Card,
  InfoTip,
  KeyValue,
  Notice,
  PageHead,
  Pill,
  Stat,
  formatDate,
  formatDateTime,
} from "@/components/ui";
import { RunScanButton, ScanConfigForm } from "@/components/discoveryActions";
import {
  COVERAGE_LABEL,
  COVERAGE_TONE,
  coverageOf,
  readStages,
} from "@/lib/engines/discovery";

export const dynamic = "force-dynamic";

const TABS = ["overview", "config", "history", "progress"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  overview: "Overview",
  config: "Scan Config",
  history: "Scan History",
  progress: "Live Progress",
};

/**
 * SCREEN 4 — Source Detail. The anchor entity for a connected source.
 *
 * Four tabs, all reachable without leaving the page. Scan Config is read-only
 * until the DPO approves the scope — and says so, rather than presenting a
 * disabled form with no explanation.
 */
export default async function SourceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? "")
    ? (rawTab as Tab)
    : "overview";

  const source = await db.discoverySource.findUnique({
    where: { id },
    include: {
      fields: true,
      scanRuns: { orderBy: { startedAt: "desc" }, take: 25 },
    },
  });
  if (!source) notFound();

  const coverage = coverageOf(source);
  const runs = source.scanRuns;
  const activeRun = runs.find((r) => r.status === "running") ?? null;
  const lastRun = runs[0] ?? null;
  const isLarge = source.kind === "file_share" || source.kind === "database";

  return (
    <Shell active="/discovery" title={`Discovery / ${source.name}`}>
      <PageHead
        crumbs={[
          { label: "Data Discovery", href: "/discovery" },
          { label: source.name },
        ]}
        title={source.name}
        titleTip="A connected source: where it is, whether the DPO has approved scanning it, and every scan ever run against it."
        subtitle={
          <span className="row" style={{ gap: 8 }}>
            <Pill tone={COVERAGE_TONE[coverage]}>{COVERAGE_LABEL[coverage]}</Pill>
            <span className="cell-sub">
              {source.kind.replace("_", " ")} · {source.fields.length} fields
            </span>
          </span>
        }
        actions={
          <RunScanButton
            sourceId={source.id}
            approved={source.dpoApprovedForScanning}
            sourceName={source.name}
          />
        }
      />

      <nav className="stepper">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/discovery/sources/${id}?tab=${t}`}
            className={`step${t === tab ? " active" : ""}`}
          >
            <span className="step-label">{TAB_LABEL[t]}</span>
            {t === "history" && runs.length > 0 && (
              <span className="step-sub">{runs.length} runs</span>
            )}
            {t === "progress" && activeRun && <span className="step-sub">running</span>}
          </Link>
        ))}
      </nav>

      {!source.dpoApprovedForScanning && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="policy" title="Awaiting governance approval">
            Discovery scope for this source has not been approved by the DPO.
            Deciding what personal data the organisation looks at is a governance
            decision, not a technical one, so scanning and scan configuration stay
            unavailable until it is approved.
          </Notice>
        </div>
      )}

      {tab === "overview" && (
        <div className="stack">
          <div className="stat-row">
            <Stat label="Fields discovered" value={source.fields.length} />
            <Stat
              label="Needs review"
              value={source.fields.filter((f) => f.reviewState === "pending" && f.confidence === "needs_review").length}
            />
            <Stat label="Scan runs" value={runs.length} />
            <Stat
              label="Coverage"
              value={COVERAGE_LABEL[coverage]}
              tone={
                coverage === "current" ? "green" : coverage === "stale" ? "yellow" : "red"
              }
            />
          </div>

          <Card title="Connection">
            <KeyValue
              rows={[
                [
                  "Connection state",
                  <Pill
                    key="c"
                    tone={source.connectionState === "connected" ? "green" : source.connectionState === "failed" ? "red" : "gray"}
                  >
                    {source.connectionState.replace("_", " ")}
                  </Pill>,
                ],
                [
                  "Approved for scanning",
                  source.dpoApprovedForScanning ? (
                    <Pill key="a" tone="green">Yes — DPO approved</Pill>
                  ) : (
                    <Pill key="a" tone="purple">Not yet</Pill>
                  ),
                ],
                ["Last scanned", formatDateTime(source.lastScanned)],
                ["Schedule", source.scanSchedule.replace("_", " ")],
                ["Depth", source.scanDepth],
              ]}
            />

            {source.connectionState === "failed" && source.failureDetail && (
              <div style={{ marginTop: 12 }}>
                <Notice tone="danger" title={`Connection failed — ${source.failureCode ?? "unknown"}`}>
                  <p style={{ margin: "0 0 6px" }}>{source.failureDetail}</p>
                  <p style={{ margin: 0 }}>
                    <strong>What to do next:</strong> {source.connectionHint ?? "Re-test the connection under Integrations."}
                  </p>
                </Notice>
              </div>
            )}
          </Card>

          {lastRun && (
            <Card title="Last scan">
              <KeyValue
                rows={[
                  [
                    "Result",
                    <Pill
                      key="r"
                      tone={lastRun.status === "completed" ? "green" : lastRun.status === "partial" ? "yellow" : "red"}
                    >
                      {lastRun.status}
                    </Pill>,
                  ],
                  ["Started", formatDateTime(lastRun.startedAt)],
                  ["Fields found", lastRun.fieldsFound],
                ]}
              />
            </Card>
          )}
        </div>
      )}

      {tab === "config" && (
        <Card title="Scan configuration">
          <ScanConfigForm
            sourceId={source.id}
            approved={source.dpoApprovedForScanning}
            schedule={source.scanSchedule}
            depth={source.scanDepth}
            offPeakWindow={source.offPeakWindow}
            isLarge={isLarge}
          />
        </Card>
      )}

      {tab === "history" && (
        <Card title={`Scan history (${runs.length})`}>
          {runs.length === 0 ? (
            <div className="empty">
              <p style={{ margin: "0 0 10px" }}>This source has never been scanned.</p>
              {source.dpoApprovedForScanning && (
                <RunScanButton
                  sourceId={source.id}
                  approved
                  sourceName={source.name}
                />
              )}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Result</th>
                    <th>Duration</th>
                    <th>Change vs previous</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run, i) => {
                    const prev = runs[i + 1];
                    const delta = prev ? run.fieldsFound - prev.fieldsFound : null;
                    const durationMs = run.completedAt
                      ? run.completedAt.getTime() - run.startedAt.getTime()
                      : null;
                    return (
                      <tr key={run.id}>
                        <td className="cell-sub">{formatDateTime(run.startedAt)}</td>
                        <td>
                          <Pill
                            tone={run.status === "completed" ? "green" : run.status === "partial" ? "yellow" : "red"}
                          >
                            {run.status}
                          </Pill>
                        </td>
                        <td className="cell-sub">
                          {durationMs === null ? "—" : `${Math.max(1, Math.round(durationMs / 1000))}s`}
                        </td>
                        <td>
                          {/* The delta, not a raw count — "412 fields" says
                              nothing without what it was before. */}
                          {delta === null ? (
                            <span className="cell-sub">first run</span>
                          ) : delta === 0 ? (
                            <span className="cell-sub">no change</span>
                          ) : (
                            <span
                              className="cell-sub"
                              style={{ color: delta > 0 ? "var(--blue)" : "var(--yellow)" }}
                            >
                              {delta > 0 ? "+" : ""}
                              {delta} fields
                            </span>
                          )}
                        </td>
                        <td>
                          {run.failureReason ? (
                            <span className="row" style={{ gap: 5 }}>
                              <Pill tone="red">{run.failureStage}</Pill>
                              <InfoTip
                                align="left"
                                text={
                                  <>
                                    <strong>What failed:</strong> the {run.failureStage} stage.
                                    <br />
                                    <strong>Why:</strong> {run.failureReason}
                                    <br />
                                    <strong>What to do next:</strong> {run.failureAction}
                                  </>
                                }
                              />
                            </span>
                          ) : (
                            <span className="cell-sub">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "progress" && (
        <Card title="Live progress">
          {!activeRun && !lastRun ? (
            <div className="empty">No scan has run yet.</div>
          ) : (
            (() => {
              const run = activeRun ?? lastRun!;
              const stages = readStages(run.stagesJson);
              return (
                <div className="stack">
                  {!activeRun && (
                    <Notice tone="info" title="No scan is running">
                      Showing the stages of the most recent run, finished{" "}
                      {formatDateTime(run.completedAt)}.
                    </Notice>
                  )}

                  <div className="stack" style={{ gap: 8 }}>
                    {stages.map((s) => (
                      <div key={s.stage} className="row" style={{ gap: 10 }}>
                        <Pill
                          tone={
                            s.state === "done"
                              ? "green"
                              : s.state === "failed"
                                ? "red"
                                : s.state === "running"
                                  ? "blue"
                                  : "gray"
                          }
                        >
                          {s.state}
                        </Pill>
                        <span style={{ fontWeight: 500, minWidth: 110 }}>{s.stage}</span>
                        {s.detail && <span className="cell-sub">{s.detail}</span>}
                      </div>
                    ))}
                  </div>

                  {run.failureReason && (
                    <Notice tone="danger" title={`Stopped at the ${run.failureStage} stage`}>
                      <p style={{ margin: "0 0 6px" }}>
                        <strong>Why:</strong> {run.failureReason}
                      </p>
                      <p style={{ margin: 0 }}>
                        <strong>What to do next:</strong> {run.failureAction}
                      </p>
                      <p className="cell-sub" style={{ margin: "8px 0 0" }}>
                        This failure is kept in Scan History — it does not
                        disappear when the run ends.
                      </p>
                    </Notice>
                  )}
                </div>
              );
            })()
          )}
        </Card>
      )}
    </Shell>
  );
}
