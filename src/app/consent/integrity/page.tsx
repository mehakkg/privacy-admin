import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, formatDateTime } from "@/components/ui";
import { ConsentIntegrity, type ArtifactRow } from "@/components/consent/ConsentIntegrity";

export const dynamic = "force-dynamic";

/**
 * Consent Artifact Integrity Dashboard — the verify/demonstrate layer over the
 * existing consent-artifact hashing. Confirms integrity in aggregate and lets
 * Admin spot-check and export proof for any single record.
 */
export default async function ConsentIntegrityPage() {
  const records = await db.consentRecord.findMany({
    include: {
      purposeTag: { select: { name: true } },
      verificationChecks: { orderBy: { checkedAt: "desc" }, take: 1 },
      changeAttempts: { orderBy: { attemptedAt: "asc" } },
    },
    orderBy: { collectedAt: "desc" },
    take: 200,
  });

  const [totalAttempts, lastCheck] = await Promise.all([
    db.changeAttempt.count(),
    db.verificationCheck.findFirst({ orderBy: { checkedAt: "desc" }, select: { checkedAt: true } }),
  ]);

  const rows: ArtifactRow[] = records.map((r) => ({
    id: r.id,
    subject: r.subjectRef,
    purpose: r.purposeTag?.name ?? "—",
    channel: r.channelOrigin,
    createdAt: formatDateTime(r.collectedAt),
    lastResult: r.verificationChecks[0]?.result ?? null,
    changeAttempts: r.changeAttempts.map((c) => ({ at: formatDateTime(c.attemptedAt), by: c.attemptedBy ?? "unknown", summary: c.attemptedChangeSummary })),
  }));

  // Integrity failures = artifacts whose most recent check came back mismatch.
  const failures = rows.filter((r) => r.lastResult === "mismatch").length;

  return (
    <Shell active="/consent/integrity" title="Consent & Notices / Artifact integrity">
      <PageHead
        title="Consent artifact integrity"
        titleTip="Each consent record is hashed and timestamped at creation. This dashboard verifies that integrity in aggregate and lets you spot-check and export proof for any single record."
      />
      <ConsentIntegrity
        rows={rows}
        total={rows.length}
        failures={failures}
        changeAttempts={totalAttempts}
        lastRun={lastCheck ? formatDateTime(lastCheck.checkedAt) : "—"}
      />
    </Shell>
  );
}
