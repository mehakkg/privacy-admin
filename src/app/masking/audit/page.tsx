import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Card, Notice, PageHead, Pill, Stat, formatDateTime } from "@/components/ui";
import { EnforcementBanner } from "@/components/masking/EnforcementBanner";
import { searchMaskingConfigLog } from "@/lib/engines/masking";
import { verifyChain } from "@/lib/engines/audit";
import { decodeObject } from "@/lib/codec/json";
import { db } from "@/lib/db";
import { ROLE_LABEL, type ActorRole } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * SCREEN 5 — Config Change Audit Log.
 *
 * The exact Unified Audit Log Search, scoped to masking config actions
 * (masking_config_audit_log is a VIEW of the one immutable, hash-chained log —
 * not a second store). Every masking edit, unlock and field-creation was written
 * automatically, inside the transaction of the change it describes.
 */
export default async function MaskingAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; action?: string; actorRole?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;

  const [entries, chain, actions] = await Promise.all([
    searchMaskingConfigLog({
      search: params.search,
      action: params.action,
      actorRole: params.actorRole,
      from: params.from ? new Date(params.from) : undefined,
      to: params.to ? new Date(`${params.to}T23:59:59Z`) : undefined,
      take: 300,
    }),
    verifyChain(),
    db.auditLogEntry.findMany({
      where: { action: { contains: "masking." } },
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    }),
  ]);

  const qs = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) next.set(k, v);
    const s = next.toString();
    return s ? `/masking/audit?${s}` : "/masking/audit";
  };

  return (
    <Shell active="/masking/audit" title="Dynamic Data Masking">
      <PageHead
        title="Masking config change log"
        subtitle="Every masking edit, unlock and custom-field creation — who, when, and the before/after — written automatically and hash-chained. Entries cannot be edited or deleted."
      />
      <EnforcementBanner />

      <div style={{ marginBottom: 16 }}>
        <Notice
          tone={chain.ok ? "ok" : "danger"}
          title={chain.ok ? `Chain verified — ${chain.entriesChecked} entries intact` : `Chain broken at entry ${chain.brokenAtSeq}`}
        >
          {chain.ok
            ? "Each entry hashes to its recorded value and links to its predecessor, so any alteration or removal would show here."
            : chain.reason}
        </Notice>
      </div>

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Masking entries shown" value={entries.length} />
        <Stat label="Total in chain" value={chain.entriesChecked} />
        <Stat label="Masking event types" value={actions.length} />
      </div>

      <Card title="Filter">
        <form className="row" method="get" action="/masking/audit">
          <input className="input" style={{ width: 260 }} name="search" placeholder="Field code, actor, or payload…" defaultValue={params.search ?? ""} />
          <select className="input" style={{ width: 220 }} name="action" defaultValue={params.action ?? ""}>
            <option value="">All masking events</option>
            {actions.map((a) => <option key={a.action} value={a.action}>{a.action}</option>)}
          </select>
          <select className="input" style={{ width: 180 }} name="actorRole" defaultValue={params.actorRole ?? ""}>
            <option value="">All roles</option>
            {(["admin", "ciso", "dpo", "system"] as ActorRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          <input className="input" style={{ width: 150 }} type="date" name="from" defaultValue={params.from ?? ""} />
          <input className="input" style={{ width: 150 }} type="date" name="to" defaultValue={params.to ?? ""} />
          <button className="btn primary" type="submit">Search</button>
          <Link className="btn ghost" href={qs({ search: undefined, action: undefined, actorRole: undefined, from: undefined, to: undefined })}>Clear</Link>
        </form>
      </Card>

      <div style={{ marginTop: 16 }} className="table-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <th style={{ width: 60 }}>Seq</th>
              <th style={{ width: 175 }}>Timestamp</th>
              <th>Actor</th>
              <th>Event</th>
              <th>Field</th>
              <th>Before → after</th>
              <th style={{ width: 120 }}>Chain</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const payload = decodeObject<Record<string, unknown>>(entry.payloadJson) ?? {};
              const code = (payload.code as string) ?? entry.targetId;
              return (
                <tr key={entry.id}>
                  <td className="mono">{entry.seq}</td>
                  <td className="cell-sub">{formatDateTime(entry.timestamp)}</td>
                  <td>
                    <div className="cell-stack">
                      <span className="cell-primary">{entry.actorLabel}</span>
                      <span className="cell-sub">{ROLE_LABEL[entry.actorRole as ActorRole] ?? entry.actorRole}</span>
                    </div>
                  </td>
                  <td>
                    <Pill
                      tone={entry.action.includes("unlocked") ? "yellow" : entry.action.includes("created") ? "green" : "blue"}
                      dot={false}
                    >
                      {entry.action.replace("masking.", "")}
                    </Pill>
                  </td>
                  <td className="mono cell-sub">{code}</td>
                  <td>
                    {payload && Object.keys(payload).length > 0 ? (
                      <details>
                        <summary className="cell-sub" style={{ cursor: "pointer" }}>{Object.keys(payload).length} field(s)</summary>
                        <pre className="code-block" style={{ marginTop: 6, maxWidth: 460 }}>{JSON.stringify(payload, null, 2)}</pre>
                      </details>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="mono cell-sub" title={`hash ${entry.payloadHash}\nprev ${entry.prevHash}`}>{entry.payloadHash.slice(0, 10)}…</td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr><td colSpan={7}><div className="empty">No masking config changes match this search.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
