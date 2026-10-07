import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { Card, CompletionPill, ExecutionPill, Notice, PageHead, Stat, formatDate, formatDateTime } from "@/components/ui";
import { DuplicateReview, type DupRow } from "@/components/duplicateReview";
import { IdentityResolutionRunner } from "@/components/discovery/IdentityResolutionRunner";
import { computeMergeCompletion } from "@/lib/engines/discovery";
import { getDiscoveryGovernance } from "@/lib/engines/scenario4";
import { MovedNote } from "@/components/MovedNote";

export const dynamic = "force-dynamic";

/**
 * Identity matching (moved here from the old Review queue › Near-duplicates).
 * Near-duplicate resolution belongs with rights-request intake: the same two
 * records must be recognised as one person before a request is fulfilled. The
 * match runs at the DPO-approved threshold (read-only); flagged pairs are then
 * reviewed and merged below. Merge propagation is a standing record.
 */
export default async function IdentityMatchingPage({ searchParams }: { searchParams: Promise<{ moved?: string }> }) {
  const sp = await searchParams;
  const [{ identityMatchThreshold }, lastRun, pairs] = await Promise.all([
    getDiscoveryGovernance(),
    db.identityResolutionRun.findFirst({ where: { status: "complete" }, orderBy: { completedAt: "desc" } }),
    db.duplicatePair.findMany({
      include: { fieldA: { include: { source: true } }, fieldB: { include: { source: true } } },
      orderBy: [{ resolution: "asc" }, { similarityScore: "desc" }],
    }),
  ]);

  const side = (f: { id: string; fieldPath: string; detectedType: string; maskedSample: string; lastVerified: Date | null; source: { name: string } }) => ({
    id: f.id, fieldPath: f.fieldPath, sourceName: f.source.name, detectedType: f.detectedType, maskedSample: f.maskedSample,
    lastVerified: f.lastVerified ? formatDate(f.lastVerified) : null,
  });
  const rows: DupRow[] = pairs.map((p) => ({ id: p.id, similarityScore: p.similarityScore, resolution: p.resolution, matchReason: p.matchReason, a: side(p.fieldA), b: side(p.fieldB) }));

  const merged = pairs.filter((p) => p.resolution === "merge");
  const completions = await Promise.all(merged.map((p) => computeMergeCompletion(p.id)));
  const open = rows.filter((r) => r.resolution === "unresolved").length;

  return (
    <Shell active="/requests/identity-matching" title="Rights requests / Identity matching">
      <PageHead title="Identity matching" titleTip="Finds records that are likely the same person so a rights request resolves to one identity. Matching runs at the DPO-approved confidence threshold — displayed here, not editable by Admin." />
      <MovedNote moved={sp.moved} />

      <div style={{ marginBottom: 16 }}>
        <IdentityResolutionRunner threshold={identityMatchThreshold} lastRun={lastRun?.completedAt ? { at: formatDateTime(lastRun.completedAt), flagged: lastRun.pairsFlagged } : null} />
      </div>

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Open" value={open} tone={open ? "yellow" : undefined} />
        <Stat label="Resolved" value={rows.length - open} />
        <Stat label="Merges not propagated" value={completions.filter((c) => c.state !== "verified").length} tone={completions.some((c) => c.state !== "verified") ? "red" : undefined} />
      </div>

      {completions.some((c) => c.state !== "verified") && (
        <div style={{ marginBottom: 12 }}><div className="notice warn compact"><span>A merge has not fully propagated — references in some systems still point at both records.</span></div></div>
      )}

      <DuplicateReview rows={rows} />

      {merged.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Card title="Merge propagation">
            {merged.map((pair, i) => {
              const completion = completions[i];
              return (
                <div key={pair.id} style={{ borderTop: i > 0 ? "1px solid var(--border-soft)" : undefined, paddingTop: i > 0 ? 12 : 0, marginTop: i > 0 ? 12 : 0 }}>
                  <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                    <span className="mono">{pair.fieldA.fieldPath}</span>
                    <CompletionPill state={completion.state} hasFailures={completion.hasFailures} />
                    <span className="cell-sub">{completion.totals.verified}/{completion.totals.systems} systems confirmed</span>
                  </div>
                  <div className="table-wrap">
                    <table className="dtable">
                      <thead><tr><th>System</th><th>Status</th><th>References updated</th><th>Detail</th></tr></thead>
                      <tbody>
                        {completion.steps.map((s) => (
                          <tr key={s.id}><td className="cell-primary">{s.systemName}</td><td><ExecutionPill status={s.status as never} /></td><td className="mono">{s.referencesUpdated}</td><td className="cell-sub">{s.failureDetail ?? "—"}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </Card>
        </div>
      )}

      {open === 0 && rows.length === 0 && (
        <Notice tone="info" title="No near-duplicate candidates">Identity matching runs against records synced from the DLP. Run a match above to look for near-duplicates.</Notice>
      )}
    </Shell>
  );
}
