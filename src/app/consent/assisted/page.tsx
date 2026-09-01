import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { Card, PageHead, Pill, Stat, formatDate } from "@/components/ui";
import { BranchCaptureForm, RetrySyncButton } from "@/components/assistedConsent";
import { CHANNEL_ORIGIN_LABEL } from "@/lib/domain";

export const dynamic = "force-dynamic";

const SYNC_TONE: Record<string, "green" | "yellow" | "red"> = {
  synced: "green",
  pending: "yellow",
  failed: "red",
};

/**
 * ASSISTED COLLECTION.
 *
 * Branch capture is a plain form, not a wizard. Sync status is a filtered
 * table, not a dedicated "Offline Sync Manager". And there is no separate
 * Central Record screen: assisted consent is the same ConsentRecord model with
 * a channel-origin tag, exactly as Requests treats branch submissions as a tag
 * on one list rather than a parallel data model.
 */
export default async function AssistedCollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ sync?: string; q?: string }>;
}) {
  const params = await searchParams;
  const term = (params.q ?? "").trim();

  const [assisted, purposes, all] = await Promise.all([
    db.consentRecord.findMany({
      where: {
        channelOrigin: "branch",
        ...(params.sync ? { syncStatus: params.sync } : {}),
        ...(term ? { subjectRef: { contains: term } } : {}),
      },
      include: { purposeTag: true },
      orderBy: { collectedAt: "desc" },
    }),
    db.purposeTag.findMany({ where: { status: "approved" }, orderBy: { name: "asc" } }),
    db.consentRecord.findMany({ where: { channelOrigin: "branch" }, select: { syncStatus: true } }),
  ]);

  const pending = all.filter((r) => r.syncStatus === "pending").length;
  const failed = all.filter((r) => r.syncStatus === "failed").length;

  return (
    <Shell active="/consent" title="Consent & Notices / Assisted collection">
      <PageHead
        title="Assisted collection"
        titleTip="Consent captured in person at a branch or over the phone. It joins the same consent records as digital consent, tagged by channel — not a separate data model."
      />

      <div className="grid-2">
        <Card title="Branch consent capture">
          <BranchCaptureForm purposes={purposes.map((p) => ({ id: p.id, name: p.name }))} />
        </Card>

        <Card title="Sync status">
          <div className="stat-row" style={{ marginBottom: 12 }}>
            <Stat label="Pending" value={pending} tone={pending ? "yellow" : undefined} />
            <Stat label="Failed" value={failed} tone={failed ? "red" : undefined} />
            <Stat label="Total" value={all.length} />
          </div>

          <CompactFilterBar
            basePath="/consent/assisted"
            searchPlaceholder="Search customer ref…"
            facets={[
              {
                key: "sync",
                label: "Sync",
                options: [
                  { value: "pending", label: "Pending" },
                  { value: "synced", label: "Synced" },
                  { value: "failed", label: "Failed" },
                ],
              },
            ]}
          />

          <div className="table-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Purpose</th>
                  <th>Captured</th>
                  <th>Sync</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {assisted.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="cell-stack">
                        <span className="mono cell-primary">{r.subjectRef}</span>
                        <span className="cell-sub">{r.idVerification ?? ""}</span>
                      </div>
                    </td>
                    <td className="cell-sub">{r.purposeTag?.name ?? "—"}</td>
                    <td className="cell-sub">{formatDate(r.collectedAt)}</td>
                    <td>
                      <Pill tone={SYNC_TONE[r.syncStatus] ?? "gray"}>{r.syncStatus}</Pill>
                    </td>
                    <td>
                      {r.syncStatus === "failed" && <RetrySyncButton recordId={r.id} />}
                    </td>
                  </tr>
                ))}
                {assisted.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty">No assisted consent in this view.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="cell-sub" style={{ marginTop: 10 }}>
            These records also appear on the Consent platform&apos;s Verification
            tab with a Branch channel tag — one unified list, not a parallel one.
          </p>
        </Card>
      </div>
    </Shell>
  );
}
