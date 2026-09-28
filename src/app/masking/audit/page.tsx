import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Card, Notice, PageHead, Pill, Stat, formatDateTime, type PillTone } from "@/components/ui";
import { EnforcementNotice } from "@/components/masking/EnforcementNotice";
import { searchMaskingConfigLog } from "@/lib/engines/masking";
import { verifyChain } from "@/lib/engines/audit";
import { decodeObject } from "@/lib/codec/json";
import { db } from "@/lib/db";
import { ROLE_LABEL, type ActorRole } from "@/lib/domain";

export const dynamic = "force-dynamic";

/** Event pill colour by family (creation=success, proposals=warn, approvals=success, rejections=danger, edits=accent). */
function eventTone(action: string): PillTone {
  const a = action.replace("masking.", "");
  if (a === "field_created" || a === "change_approved" || a === "exception_added") return "green";
  if (a === "change_rejected") return "red";
  if (a === "change_proposed") return "yellow";
  if (a === "rule_unlocked") return "red";
  if (a === "exception_expired") return "gray";
  return "blue"; // rule_edited, channel_override_added
}

/**
 * SCREEN 3 — Config change log. The unified, hash-chained audit search scoped to
 * masking config events. Supports ?field= pre-filter. rule_unlocked survives for
 * historical entries but no UI path produces it any more.
 */
export default async function MaskingAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ field?: string; search?: string; action?: string; actorRole?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const field = params.field?.toUpperCase();

  const [entries, chain, actions] = await Promise.all([
    searchMaskingConfigLog({
      targetId: field,
      search: params.search,
      action: params.action,
      actorRole: params.actorRole,
      from: params.from ? new Date(params.from) : undefined,
      to: params.to ? new Date(`${params.to}T23:59:59Z`) : undefined,
      take: 300,
    }),
    verifyChain(),
    db.auditLogEntry.findMany({ where: { action: { contains: "masking." } }, distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
  ]);

  const qs = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) next.set(k, v);
    const s = next.toString();
    return s ? `/masking/audit?${s}` : "/masking/audit";
  };

  return (
    <Shell active="/masking/audit" title="Change log">
      <PageHead
        crumbs={field ? [{ label: "Masking policy", href: "/masking" }, { label: field, href: `/masking?field=${field}` }, { label: "Change log" }] : undefined}
        title="Masking config change log"
        subtitle={field ? `Changes to ${field} — who, when, and the before/after.` : "Every masking change — who, when, and the before/after. Written automatically and hash-chained; entries cannot be edited or deleted."}
      />
      <EnforcementNotice />

      <div style={{ marginBottom: 16 }}>
        <Notice tone={chain.ok ? "ok" : "danger"} title={chain.ok ? `Chain verified — ${chain.entriesChecked} entries intact` : `Chain broken at entry ${chain.brokenAtSeq}`}>
          {chain.ok ? "Each entry hashes to its recorded value and links to its predecessor, so any alteration or removal would show here." : chain.reason}
        </Notice>
      </div>

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Entries shown" value={entries.length} />
        <Stat label="Total in chain" value={chain.entriesChecked} />
        <Stat label="Masking event types" value={actions.length} />
      </div>

      <Card title="Filter">
        <form className="row" method="get" action="/masking/audit">
          {field && <input type="hidden" name="field" value={field} />}
          <input className="input" style={{ width: 240 }} name="search" placeholder="Field code, actor, or payload…" defaultValue={params.search ?? ""} />
          <select className="input" style={{ width: 220 }} name="action" defaultValue={params.action ?? ""}>
            <option value="">All masking events</option>
            {actions.map((a) => <option key={a.action} value={a.action}>{a.action.replace("masking.", "")}</option>)}
          </select>
          <select className="input" style={{ width: 170 }} name="actorRole" defaultValue={params.actorRole ?? ""}>
            <option value="">All roles</option>
            {(["admin", "dpo", "ciso", "system"] as ActorRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          <input className="input" style={{ width: 140 }} type="date" name="from" defaultValue={params.from ?? ""} />
          <input className="input" style={{ width: 140 }} type="date" name="to" defaultValue={params.to ?? ""} />
          <button className="btn primary" type="submit">Search</button>
          <Link className="btn ghost" href={field ? `/masking/audit?field=${field}` : "/masking/audit"}>Clear</Link>
        </form>
      </Card>

      <div style={{ marginTop: 16 }} className="table-wrap">
        <table className="dtable">
          <thead><tr>
            <th style={{ width: 56 }}>Seq</th><th style={{ width: 170 }}>Timestamp</th><th>Actor</th><th>Event</th><th>Field</th><th>Before → after</th><th style={{ width: 110 }}>Chain</th>
          </tr></thead>
          <tbody>
            {entries.map((entry) => {
              const payload = decodeObject<Record<string, unknown>>(entry.payloadJson) ?? {};
              const code = (payload.code as string) ?? entry.targetId;
              return (
                <tr key={entry.id}>
                  <td className="mono">{entry.seq}</td>
                  <td className="cell-sub">{formatDateTime(entry.timestamp)}</td>
                  <td><div className="cell-stack"><span className="cell-primary">{entry.actorLabel}</span><span className="cell-sub">{ROLE_LABEL[entry.actorRole as ActorRole] ?? entry.actorRole}</span></div></td>
                  <td><Pill tone={eventTone(entry.action)} dot={false}>{entry.action.replace("masking.", "")}</Pill></td>
                  <td className="mono cell-sub">{code}</td>
                  <td>
                    {Object.keys(payload).length > 0 ? (
                      <details><summary className="cell-sub" style={{ cursor: "pointer" }}>view diff</summary><pre className="code-block" style={{ marginTop: 6, maxWidth: 460 }}>{JSON.stringify(payload, null, 2)}</pre></details>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td className="mono cell-sub" title={`hash ${entry.payloadHash}\nprev ${entry.prevHash}`}>{entry.payloadHash.slice(0, 10)}…</td>
                </tr>
              );
            })}
            {entries.length === 0 && <tr><td colSpan={7}><div className="empty">No masking changes match this search.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
