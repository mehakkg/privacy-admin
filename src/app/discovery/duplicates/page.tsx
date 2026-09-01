import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import {
  Card,
  CompletionPill,
  ExecutionPill,
  InfoTip,
  KeyValue,
  Notice,
  PageHead,
  Pill,
  formatDate,
} from "@/components/ui";
import { DuplicateActions } from "@/components/discoveryActions";
import { computeMergeCompletion } from "@/lib/engines/discovery";

export const dynamic = "force-dynamic";

/**
 * SCREEN 6a — Duplicate resolution.
 *
 * Side-by-side comparison with the similarity score stated, and three peer
 * actions. "Keep both" is first and styled as the primary: a false-positive
 * match is a realistic failure, and merging two legitimately different records
 * is not practically reversible, so merge must not be the easy default.
 */
export default async function DuplicatesPage({
  searchParams,
}: {
  searchParams: Promise<{ pair?: string }>;
}) {
  const params = await searchParams;

  const pairs = await db.duplicatePair.findMany({
    include: {
      fieldA: { include: { source: true } },
      fieldB: { include: { source: true } },
    },
    orderBy: [{ resolution: "asc" }, { similarityScore: "desc" }],
  });

  const selected = pairs.find((p) => p.id === params.pair) ?? pairs.find((p) => p.resolution === "unresolved") ?? pairs[0];
  const merged = pairs.filter((p) => p.resolution === "merge");
  const completions = await Promise.all(merged.map((p) => computeMergeCompletion(p.id)));

  return (
    <Shell active="/discovery" title="Discovery / Duplicates">
      <PageHead
        crumbs={[
          { label: "Data Discovery", href: "/discovery" },
          { label: "Triage", href: "/discovery/triage?tab=duplicate" },
          { label: "Duplicates" },
        ]}
        title="Duplicate resolution"
        titleTip="Fields that look like the same data held twice. A high similarity score is evidence, not proof — two legitimately different records can look alike."
      />

      {completions.some((c) => c.state !== "verified") && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="warn" title="A merge has not fully propagated">
            A merge touches references in every connected system, and those
            confirm separately. Until each one does, the merge is partial — the
            same rule used for deletion elsewhere in the product.
          </Notice>
        </div>
      )}

      <div className="stack">
        <div className="grid-2">
          <div>
            <div className="row" style={{ marginBottom: 12 }}>
              <span className="section-label" style={{ margin: 0 }}>
                Candidate pairs ({pairs.length})
              </span>
            </div>
            <div className="table-wrap">
              <table className="dtable">
              <thead>
                <tr>
                  <th>Pair</th>
                  <th>Similarity</th>
                  <th>Resolution</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((p) => (
                  <tr
                    key={p.id}
                    style={selected?.id === p.id ? { background: "var(--bg-selected)" } : undefined}
                  >
                    <td>
                      <Link href={`/discovery/duplicates?pair=${p.id}`} className="row-link">
                        <span className="mono">{p.fieldA.fieldPath}</span>
                      </Link>
                      <div className="cell-sub mono">{p.fieldB.fieldPath}</div>
                    </td>
                    <td>
                      <Pill tone={p.similarityScore >= 90 ? "red" : p.similarityScore >= 75 ? "yellow" : "gray"}>
                        {p.similarityScore}%
                      </Pill>
                    </td>
                    <td>
                      {p.resolution === "unresolved" ? (
                        <Pill tone="yellow">Open</Pill>
                      ) : (
                        <Pill tone="green">{p.resolution.replace("_", " ")}</Pill>
                      )}
                    </td>
                  </tr>
                ))}
                </tbody>
              </table>
            </div>
          </div>

        {selected && (
          <Card
            title={
              <span className="row">
                Compare
                <Pill tone={selected.similarityScore >= 90 ? "red" : "yellow"}>
                  {selected.similarityScore}% similar
                </Pill>
                <InfoTip
                  align="left"
                  text="Similarity is computed from the values and field names. Below about 90% the match is worth treating with suspicion."
                />
              </span>
            }
          >
            <div className="grid-2">
              <div>
                <div className="section-label">A</div>
                <KeyValue
                  rows={[
                    ["Field", <span key="a" className="mono">{selected.fieldA.fieldPath}</span>],
                    ["Source", selected.fieldA.source.name],
                    ["Type", selected.fieldA.detectedType],
                    ["Sample", <span key="s" className="mono">{selected.fieldA.maskedSample}</span>],
                    ["Verified", formatDate(selected.fieldA.lastVerified)],
                  ]}
                />
              </div>
              <div>
                <div className="section-label">B</div>
                <KeyValue
                  rows={[
                    ["Field", <span key="b" className="mono">{selected.fieldB.fieldPath}</span>],
                    ["Source", selected.fieldB.source.name],
                    ["Type", selected.fieldB.detectedType],
                    ["Sample", <span key="s" className="mono">{selected.fieldB.maskedSample}</span>],
                    ["Verified", formatDate(selected.fieldB.lastVerified)],
                  ]}
                />
              </div>
            </div>

            {selected.resolution === "unresolved" ? (
              <div style={{ marginTop: 16 }}>
                <DuplicateActions
                  pairId={selected.id}
                  fieldA={{ id: selected.fieldAId, label: "A" }}
                  fieldB={{ id: selected.fieldBId, label: "B" }}
                />
              </div>
            ) : (
              <div style={{ marginTop: 16 }}>
                <Notice tone="ok" title={`Resolved — ${selected.resolution.replace("_", " ")}`}>
                  Decided {formatDate(selected.resolvedAt)}.
                </Notice>
              </div>
            )}
          </Card>
        )}
      </div>

      {merged.length > 0 && (
        <Card title="Merge propagation">
          {merged.map((pair, i) => {
            const completion = completions[i];
            return (
              <div
                key={pair.id}
                style={{ borderTop: i > 0 ? "1px solid var(--border-soft)" : undefined, paddingTop: i > 0 ? 12 : 0, marginTop: i > 0 ? 12 : 0 }}
              >
                <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                  <span className="mono">{pair.fieldA.fieldPath}</span>
                  <CompletionPill state={completion.state} hasFailures={completion.hasFailures} />
                  <span className="cell-sub">
                    {completion.totals.verified}/{completion.totals.systems} systems confirmed
                  </span>
                </div>
                <div className="table-wrap">
                  <table className="dtable">
                    <thead>
                      <tr>
                        <th>System</th>
                        <th>Status</th>
                        <th>References updated</th>
                        <th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completion.steps.map((s) => (
                        <tr key={s.id}>
                          <td className="cell-primary">{s.systemName}</td>
                          <td>
                            <ExecutionPill status={s.status as never} />
                          </td>
                          <td className="mono">{s.referencesUpdated}</td>
                          <td className="cell-sub">{s.failureDetail ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {completion.blockedBy.length > 0 && (
                  <ul className="cell-sub" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                    {completion.blockedBy.map((r, j) => (
                      <li key={j}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </Card>
      )}
      </div>
    </Shell>
  );
}
