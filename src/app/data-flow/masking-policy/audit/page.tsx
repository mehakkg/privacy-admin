import Link from "next/link";
import { PageHead } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { AuditTrailTabs, type PolicyGroup, type FailsafeBurst } from "@/components/maskingpolicy/AuditTrailTabs";
import { verifyChain, searchAuditLog } from "@/lib/engines/audit";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const MP = "/data-flow/masking-policy";
const REASON: Record<string, string> = { NO_ACTIVE_POLICY: "No policy was active", SERVICE_UNREACHABLE: "The masking service couldn't be reached" };

/** F — Audit trail. Reuses the product's hash-chained audit log (verifyChain +
 *  searchAuditLog). Two tabs: Policy changes (grouped by version) and Fail-safe
 *  events (bursts collapsed). No second log UI. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const [chain, entries, attn, fields] = await Promise.all([
    verifyChain(),
    searchAuditLog({ action: "masking_policy", take: 200 }),
    db.mPNeedsAttention.findFirst({ where: { type: "fallback_events" } }),
    db.mPField.findMany({ take: 12, orderBy: { displayName: "asc" } }),
  ]);

  // Policy changes grouped by version (targetId).
  const byVersion = new Map<string, typeof entries>();
  for (const e of entries) { const k = e.targetId; if (!byVersion.has(k)) byVersion.set(k, []); byVersion.get(k)!.push(e); }
  const groups: PolicyGroup[] = [...byVersion.entries()].map(([ver, evs]) => {
    const first = evs[0];
    return {
      version: Number(ver) || 0,
      activatedAt: first ? new Date(first.timestamp).toISOString().slice(0, 16).replace("T", " ") : "",
      by: first?.actorLabel ?? "—",
      reason: null,
      changeCount: evs.length,
      events: evs.map((e) => ({ seq: e.seq, label: e.action.replace("masking_policy.", "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), at: new Date(e.timestamp).toISOString().slice(0, 16).replace("T", " "), fingerprint: e.payloadHash.slice(0, 16) + "…", prevFingerprint: e.prevHash.slice(0, 16) + "…" })),
    };
  }).sort((a, b) => b.version - a.version);

  // Fail-safe events — representative burst from the seeded demo count.
  const count = attn?.count ?? 0;
  const failsafe: FailsafeBurst[] = count > 0 ? [{ time: "Last 24h", what: REASON.NO_ACTIVE_POLICY, application: "ddm-sample-fiduciary-app", channel: "—", fields: fields.slice(0, Math.min(count, 12)).map((f) => ({ name: f.displayName, code: f.code })) }] : [];
  const failsafeSummary = count > 0 ? `${count} fail-safe events in the last 24 hours across 1 application.` : "No fail-safe events. Your applications have been applying your policy.";

  return (
    <Shell active="/data-flow/masking-policy" title="Audit trail">
      <PageHead
        title="Audit trail"
        subtitle="A tamper-evident record of every policy change and every time the fail-safe hid a field."
        actions={<Link href={MP} className="row-link">Masking policy</Link>}
      />
      <div style={{ maxWidth: 960 }}>
        <AuditTrailTabs
          groups={groups}
          failsafe={failsafe}
          failsafeSummary={failsafeSummary}
          integrity={{ ok: chain.ok, entriesChecked: chain.entriesChecked, checkedAt: new Date().toISOString().slice(0, 16).replace("T", " "), brokenAtSeq: chain.brokenAtSeq, reason: chain.reason }}
          initialTab={sp.tab}
        />
      </div>
    </Shell>
  );
}
