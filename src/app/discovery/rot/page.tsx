import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { Card, InfoTip, PageHead, Pill, Stat, formatDate } from "@/components/ui";
import { RotActions } from "@/components/discoveryActions";

export const dynamic = "force-dynamic";

/**
 * SCREEN 6b — ROT resolution.
 *
 * Redundant, obsolete or trivial data. Low business value plus a long-cold
 * last-accessed date is the case for removal, but it is a case rather than a
 * verdict — so every disposition takes a reason, and "retain" is as available
 * as "delete".
 */
export default async function RotPage() {
  const candidates = await db.rOTCandidate.findMany({
    include: { field: { include: { source: true } } },
    orderBy: [{ resolution: "asc" }, { businessValueScore: "asc" }],
  });

  const open = candidates.filter((c) => c.resolution === "unresolved");

  return (
    <Shell active="/discovery" title="Discovery / ROT">
      <PageHead
        crumbs={[
          { label: "Data Discovery", href: "/discovery" },
          { label: "Triage", href: "/discovery/triage?tab=rot" },
          { label: "ROT" },
        ]}
        title="Redundant, obsolete, trivial"
        titleTip="Data with little business value that is still held. Keeping personal data longer than it is needed for its purpose is itself a compliance exposure, not just a storage cost."
      />

      <div className="stat-row">
        <Stat label="Open" value={open.length} tone={open.length ? "yellow" : undefined} />
        <Stat label="Resolved" value={candidates.length - open.length} />
      </div>

      <Card title={`Candidates (${candidates.length})`}>
        {candidates.length === 0 ? (
          <div className="empty">
            <p style={{ margin: "0 0 10px" }}>Nothing flagged as redundant.</p>
            <Link href="/discovery/inventory" className="btn sm">
              Browse the inventory
            </Link>
          </div>
        ) : (
          <div className="table-wrap" style={{ overflowX: "auto" }}>
            <table className="dtable">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Source</th>
                  <th>
                    <span className="row" style={{ gap: 5 }}>
                      Value
                      <InfoTip
                        align="left"
                        text="Business-value score, 0-100, from how often the data is read, whether anything depends on it, and whether it duplicates something else."
                      />
                    </span>
                  </th>
                  <th>Last accessed</th>
                  <th>Why flagged</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.id}>
                    <td className="mono cell-primary">{c.field.fieldPath}</td>
                    <td className="cell-sub">{c.field.source.name}</td>
                    <td>
                      <Pill tone={c.businessValueScore < 20 ? "red" : c.businessValueScore < 50 ? "yellow" : "gray"}>
                        {c.businessValueScore}
                      </Pill>
                    </td>
                    <td className="cell-sub">{formatDate(c.lastAccessed)}</td>
                    <td className="cell-sub" style={{ maxWidth: 280 }}>
                      {c.reason}
                    </td>
                    <td>
                      {c.resolution === "unresolved" ? (
                        <RotActions candidateId={c.id} />
                      ) : (
                        <div className="cell-stack">
                          <Pill tone={c.resolution === "delete" ? "red" : c.resolution === "quarantine" ? "yellow" : "green"}>
                            {c.resolution}
                          </Pill>
                          <span className="cell-sub">{c.resolutionReason}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Shell>
  );
}
