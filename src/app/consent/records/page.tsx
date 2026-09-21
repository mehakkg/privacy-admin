import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { PageHead, Stat, Pill, type PillTone, Notice, formatDate } from "@/components/ui";
import { CHANNEL_ORIGIN_LABEL } from "@/lib/domain";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, PillTone> = { granted: "green", withdrawn: "gray", expired: "yellow" };
const STATUS_LABEL: Record<string, string> = { granted: "Granted", withdrawn: "Withdrawn", expired: "Expired" };

/**
 * SCREEN — Consent records (the operational consent ledger).
 *
 * The per-Data-Principal record of consent given, withdrawn and expired — the
 * live state of every consent artifact, filterable by subject, purpose, channel
 * and status. This is distinct from Artifact integrity (which cryptographically
 * verifies a record hasn't changed): here you read WHAT the consent is; there you
 * prove it hasn't been tampered with. Each row links to its integrity spot-check.
 */
export default async function ConsentRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; channel?: string; purpose?: string; q?: string }>;
}) {
  const params = await searchParams;
  const term = (params.q ?? "").trim();

  const [records, purposes] = await Promise.all([
    db.consentRecord.findMany({
      where: {
        ...(params.status ? { status: params.status } : {}),
        ...(params.channel ? { channelOrigin: params.channel } : {}),
        ...(params.purpose ? { purposeTagId: params.purpose } : {}),
        ...(term ? { subjectRef: { contains: term } } : {}),
      },
      include: { purposeTag: { select: { name: true } } },
      orderBy: { collectedAt: "desc" },
      take: 500,
    }),
    db.purposeTag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // Stats are over the WHOLE ledger, not the current filter, so the totals stay
  // stable as you filter.
  const all = await db.consentRecord.groupBy({ by: ["status"], _count: { _all: true } });
  const countOf = (s: string) => all.find((g) => g.status === s)?._count._all ?? 0;
  const total = all.reduce((n, g) => n + g._count._all, 0);

  return (
    <Shell active="/consent/records" title="Consent & Notices / Consent records">
      <PageHead
        title="Consent records"
        titleTip="The operational ledger of consent given, withdrawn and expired per Data Principal — the live state of every consent artifact. To verify a record hasn't been altered, open its integrity spot-check."
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Total artifacts" value={total} />
        <Stat label="Granted" value={countOf("granted")} tone={countOf("granted") ? "green" : undefined} />
        <Stat label="Withdrawn" value={countOf("withdrawn")} />
        <Stat label="Expired" value={countOf("expired")} tone={countOf("expired") ? "yellow" : undefined} />
      </div>

      <CompactFilterBar
        basePath="/consent/records"
        searchPlaceholder="Search by subject reference…"
        facets={[
          { key: "status", label: "Status", options: ["granted", "withdrawn", "expired"].map((s) => ({ value: s, label: STATUS_LABEL[s] })) },
          { key: "channel", label: "Channel", options: Object.keys(CHANNEL_ORIGIN_LABEL).map((c) => ({ value: c, label: CHANNEL_ORIGIN_LABEL[c] })) },
          { key: "purpose", label: "Purpose", options: purposes.map((p) => ({ value: p.id, label: p.name })) },
        ]}
        actions={<Link href="/consent/integrity" className="btn sm">Artifact integrity →</Link>}
      />

      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Purpose</th>
              <th>Channel</th>
              <th>Status</th>
              <th>Collected</th>
              <th>Expires</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                <td><span className="mono cell-primary">{r.subjectRef}</span></td>
                <td>{r.purposeTag?.name ?? <span className="cell-sub">—</span>}</td>
                <td><span className="cell-sub">{CHANNEL_ORIGIN_LABEL[r.channelOrigin] ?? r.channelOrigin}</span></td>
                <td><Pill tone={STATUS_TONE[r.status] ?? "gray"} dot={false}>{STATUS_LABEL[r.status] ?? r.status}</Pill></td>
                <td><span className="cell-sub">{formatDate(r.collectedAt)}</span></td>
                <td><span className="cell-sub">{r.expiresAt ? formatDate(r.expiresAt) : "—"}</span></td>
                <td style={{ textAlign: "right" }}>
                  <Link href="/consent/integrity" className="row-link">Verify</Link>
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr><td colSpan={7}><div className="empty">No consent records match this filter.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14 }}>
        <Notice tone="info" title="Records vs integrity">
          This ledger shows the current state of each consent artifact. Artifacts are immutable and hash-verified at creation — to confirm a specific record hasn&apos;t been altered (and export a certificate), open <Link href="/consent/integrity">Artifact integrity</Link>.
        </Notice>
      </div>
    </Shell>
  );
}
