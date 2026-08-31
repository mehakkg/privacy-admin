import Link from "next/link";
import { Shell } from "@/components/Shell";
import {
  Card,
  Notice,
  PageHead,
  Pill,
  Stat,
  formatDateTime,
} from "@/components/ui";
import { searchAuditLog, verifyChain } from "@/lib/engines/audit";
import { decodeObject } from "@/lib/codec/json";
import { db } from "@/lib/db";
import { ROLE_LABEL, type ActorRole } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * SCREEN 11 — Unified Audit Log Viewer
 *
 * Every entry here was written automatically, inside the transaction of the
 * action it describes. Nothing on this screen can create an entry, and nothing
 * anywhere can amend or remove one.
 *
 * The chain indicator at the top is the point: "immutable" is a property that
 * can be checked, and this checks it on every page load rather than asserting it
 * in a tooltip.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    requestId?: string;
    action?: string;
    actorRole?: string;
    search?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const params = await searchParams;

  const [entries, chain, actions, request] = await Promise.all([
    searchAuditLog({
      requestId: params.requestId,
      action: params.action,
      actorRole: params.actorRole,
      search: params.search,
      from: params.from ? new Date(params.from) : undefined,
      to: params.to ? new Date(`${params.to}T23:59:59Z`) : undefined,
      take: 300,
    }),
    verifyChain(),
    db.auditLogEntry.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    }),
    params.requestId
      ? db.dataPrincipalRequest.findUnique({ where: { id: params.requestId } })
      : null,
  ]);

  const qs = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...patch })) {
      if (v) next.set(k, v);
    }
    const s = next.toString();
    return s ? `/audit?${s}` : "/audit";
  };

  return (
    <Shell active="/audit" title="Audit & Compliance">
      <PageHead
        crumbs={
          request
            ? [
                { label: "Requests", href: "/requests" },
                { label: request.referenceCode, href: `/requests/${request.id}` },
                { label: "Audit trail" },
              ]
            : undefined
        }
        title="Unified audit log"
        subtitle="Every execution, escalation and status change, written automatically and hash-chained. Entries cannot be edited or deleted, and survive the erasure of the data they describe."
      />

      <div style={{ marginBottom: 16 }}>
        <Notice
          tone={chain.ok ? "ok" : "danger"}
          title={
            chain.ok
              ? `Chain verified — ${chain.entriesChecked} entries intact`
              : `Chain broken at entry ${chain.brokenAtSeq}`
          }
        >
          {chain.ok
            ? "Each entry hashes to its recorded value and links to its predecessor, so any alteration or removal would show here."
            : chain.reason}
        </Notice>
      </div>

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Entries shown" value={entries.length} />
        <Stat label="Total in chain" value={chain.entriesChecked} />
        <Stat label="Distinct actions" value={actions.length} />
      </div>

      <Card title="Filter">
        <form className="row" method="get" action="/audit">
          {params.requestId && (
            <input type="hidden" name="requestId" value={params.requestId} />
          )}
          <input
            className="input"
            style={{ width: 260 }}
            name="search"
            placeholder="Identifier, actor, action or payload…"
            defaultValue={params.search ?? ""}
          />
          <select className="input" style={{ width: 220 }} name="action" defaultValue={params.action ?? ""}>
            <option value="">All event types</option>
            {actions.map((a) => (
              <option key={a.action} value={a.action}>
                {a.action}
              </option>
            ))}
          </select>
          <select className="input" style={{ width: 180 }} name="actorRole" defaultValue={params.actorRole ?? ""}>
            <option value="">All roles</option>
            {(["admin", "dpo", "ciso", "grievance_officer", "system"] as ActorRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <input className="input" style={{ width: 150 }} type="date" name="from" defaultValue={params.from ?? ""} />
          <input className="input" style={{ width: 150 }} type="date" name="to" defaultValue={params.to ?? ""} />
          <button className="btn primary" type="submit">
            Search
          </button>
          <Link className="btn ghost" href={qs({ search: undefined, action: undefined, actorRole: undefined, from: undefined, to: undefined })}>
            Clear
          </Link>
        </form>
      </Card>

      <div style={{ marginTop: 16 }} className="table-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <th style={{ width: 60 }}>Seq</th>
              <th style={{ width: 175 }}>Timestamp</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>Detail</th>
              <th style={{ width: 130 }}>Chain</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const payload = decodeObject<Record<string, unknown>>(entry.payloadJson);
              return (
                <tr key={entry.id}>
                  <td className="mono">{entry.seq}</td>
                  <td className="cell-sub">{formatDateTime(entry.timestamp)}</td>
                  <td>
                    <div className="cell-stack">
                      <span className="cell-primary">{entry.actorLabel}</span>
                      <span className="cell-sub">
                        {ROLE_LABEL[entry.actorRole as ActorRole] ?? entry.actorRole}
                      </span>
                    </div>
                  </td>
                  <td>
                    <Pill
                      tone={
                        entry.action.includes("failed")
                          ? "red"
                          : entry.action.includes("escalation") || entry.action.includes("override")
                            ? "purple"
                            : entry.action.includes("verified") || entry.action.includes("acknowledged")
                              ? "green"
                              : "gray"
                      }
                      dot={false}
                    >
                      {entry.action}
                    </Pill>
                  </td>
                  <td>
                    <div className="cell-stack">
                      <span>{entry.targetType}</span>
                      <span className="cell-sub mono">{entry.targetId.slice(0, 14)}…</span>
                    </div>
                  </td>
                  <td>
                    {payload && Object.keys(payload).length > 0 ? (
                      <details>
                        <summary className="cell-sub" style={{ cursor: "pointer" }}>
                          {Object.keys(payload).length} field(s)
                        </summary>
                        <pre className="code-block" style={{ marginTop: 6, maxWidth: 460 }}>
                          {JSON.stringify(payload, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="mono cell-sub" title={`hash ${entry.payloadHash}\nprev ${entry.prevHash}`}>
                    {entry.payloadHash.slice(0, 10)}…
                  </td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty">No entries match this search.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
