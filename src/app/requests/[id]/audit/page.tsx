import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, Notice, Stat, formatDateTime } from "@/components/ui";
import { verifyChain } from "@/lib/engines/audit";
import { decodeObject } from "@/lib/codec/json";
import { ROLE_LABEL, type ActorRole } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * TAB 6 — Audit Trail.
 *
 * Task 12 (Critical) was that no audit trail existed anywhere in the product.
 * This is the per-request view of it: every action taken on this request, in
 * order, with the chain-verification state shown rather than asserted.
 *
 * Nothing on this page can write. Entries appear because actions happened —
 * there is no "log this" control anywhere in the product.
 */
export default async function RequestAuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const request = await db.dataPrincipalRequest.findUnique({ where: { id } });
  if (!request) notFound();

  const [entries, chain] = await Promise.all([
    db.auditLogEntry.findMany({
      where: { OR: [{ requestId: id }, { targetId: id }] },
      orderBy: { seq: "asc" },
    }),
    verifyChain(),
  ]);

  const actors = [...new Set(entries.map((e) => e.actorLabel))];

  return (
    <div className="stack">
      <div className="stat-row">
        <Stat label="Entries on this request" value={entries.length} />
        <Stat label="Distinct actors" value={actors.length} />
        <Stat
          label="Chain integrity"
          value={chain.ok ? "Intact" : "Broken"}
          tone={chain.ok ? "green" : "red"}
        />
      </div>

      <Notice
        tone={chain.ok ? "info" : "danger"}
        title={
          chain.ok
            ? `Tamper-evident chain verified across all ${chain.entriesChecked} entries`
            : "Chain verification FAILED"
        }
      >
        {chain.ok ? (
          <>
            Each entry stores a SHA-256 hash over its own content including the
            previous entry&apos;s hash. Altering or removing any historical entry
            breaks every hash after it, so this is something the system can
            demonstrate rather than claim. Entries cannot be edited or deleted:
            the database client refuses those operations outright.
          </>
        ) : (
          chain.reason
        )}
      </Notice>

      <Card
        title="Actions on this request"
        actions={
          <Link href={`/audit?requestId=${id}`} className="btn sm">
            Open in full log search
          </Link>
        }
      >
        {entries.length === 0 ? (
          <div className="empty">
            No actions have been taken on this request yet. Entries appear here
            automatically as work happens.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>Seq</th>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const payload =
                    decodeObject<Record<string, unknown>>(entry.payloadJson) ?? {};
                  const summary = Object.entries(payload)
                    .filter(([, v]) => v !== null && v !== undefined && v !== "")
                    .slice(0, 3)
                    .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`)
                    .join(" · ");

                  return (
                    <tr key={entry.id}>
                      <td className="mono cell-sub">{entry.seq}</td>
                      <td className="cell-sub">{formatDateTime(entry.timestamp)}</td>
                      <td>
                        <div className="cell-stack">
                          <span>{entry.actorLabel}</span>
                          <span className="cell-sub">
                            {ROLE_LABEL[entry.actorRole as ActorRole] ?? entry.actorRole}
                          </span>
                        </div>
                      </td>
                      <td>
                        <code className="field-chip" style={{ margin: 0 }}>
                          {entry.action}
                        </code>
                      </td>
                      <td className="cell-sub">{entry.targetType}</td>
                      <td className="cell-sub">{summary || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {entries.length > 0 && (
        <Card title="Hash chain">
          <div className="table-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>Seq</th>
                  <th>Previous hash</th>
                  <th>This entry&apos;s hash</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="mono cell-sub">{entry.seq}</td>
                    <td className="mono cell-sub">{entry.prevHash.slice(0, 32)}…</td>
                    <td className="mono cell-sub">{entry.payloadHash.slice(0, 32)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cell-sub" style={{ marginTop: 10, marginBottom: 0 }}>
            Each row&apos;s previous hash is the row above it&apos;s hash. That
            linkage is what makes a silent edit detectable.
          </p>
        </Card>
      )}

      {!chain.ok && (
        <Notice tone="danger" title="What to do next">
          The chain broke at sequence {chain.brokenAtSeq ?? "unknown"}. Treat every
          entry after that point as unverified, preserve the database as it
          stands, and raise this with the DPO before taking further action on
          this request.
        </Notice>
      )}
    </div>
  );
}
