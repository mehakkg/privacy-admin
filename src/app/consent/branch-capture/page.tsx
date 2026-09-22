import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, formatDateTime } from "@/components/ui";
import { BranchConsentCapture, type TemplateOpt, type PurposeOpt, type QueueItem, type SyncedRow } from "@/components/omnichannel/BranchConsentCapture";

export const dynamic = "force-dynamic";

const DEVICE_ID = "kiosk-01";

/** SCREENS 3 & 4 — Branch / BC-point consent capture (connected) and the
 *  offline-capable local queue with capture-time-preserving sync. */
export default async function BranchCapturePage() {
  const [templates, purposes, queue, synced] = await Promise.all([
    db.consentTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.purposeTag.findMany({ where: { status: "approved" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.offlineConsentQueue.findMany({ where: { deviceId: DEVICE_ID }, orderBy: { createdAt: "asc" } }),
    db.consentRecord.findMany({ where: { captureChannel: { not: null } }, orderBy: { collectedAt: "desc" }, take: 12 }),
  ]);

  const t: TemplateOpt[] = templates.map((x) => ({ id: x.id, name: x.name, productOrCampaign: x.productOrCampaign }));
  const p: PurposeOpt[] = purposes.map((x) => ({ id: x.id, name: x.name }));
  const q: QueueItem[] = queue.map((x) => ({ id: x.id, subjectRef: x.subjectRef, captureChannel: x.captureChannel, capturedAt: formatDateTime(x.capturedAt), syncStatus: x.syncStatus, retryCount: x.retryCount, lastError: x.lastError }));
  const s: SyncedRow[] = synced.map((x) => ({ id: x.id, subjectRef: x.subjectRef, captureChannel: x.captureChannel ?? "digital", collectedAt: formatDateTime(x.collectedAt), syncTimestamp: x.syncTimestamp ? formatDateTime(x.syncTimestamp) : null }));

  return (
    <Shell active="/consent/branch-capture" title="Consent / Branch & BC-point capture">
      <PageHead title="Branch / BC-point consent capture" titleTip="Capture consent at a branch or BC point using a shared template. Works connected (immediate write) or offline (locally queued, synced later with the original capture time preserved)." />
      <BranchConsentCapture templates={t} purposes={p} queue={q} synced={s} />
    </Shell>
  );
}
