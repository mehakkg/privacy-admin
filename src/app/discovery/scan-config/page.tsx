import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { ScanConfigPicker, type PickerSource } from "@/components/discovery/ScanConfigPicker";
import { isLargeSource } from "@/lib/scenario4";

export const dynamic = "force-dynamic";

/** SCREEN 1 — Scan Configuration & Scheduling. Approved-only source picker
 *  (unapproved absent, not disabled) with a size-aware off-peak suggestion. */
export default async function ScanConfigPage() {
  const sources = await db.discoverySource.findMany({ where: { availableAsScanTarget: true }, orderBy: { name: "asc" } });
  const approved: PickerSource[] = sources
    .filter((s) => s.dpoApprovedForScanning)
    .map((s) => ({ id: s.id, name: s.name, kind: s.kind, large: isLargeSource(s.kind, s.estimatedDurationMinutes), schedule: s.scanSchedule, offPeak: s.offPeakWindow }));
  const unapproved = sources
    .filter((s) => !s.dpoApprovedForScanning)
    .map((s) => ({ name: s.name, reason: "Awaiting DPO scope approval — discovery scope belongs to the DPO, not Admin." }));

  return (
    <Shell active="/discovery/scan-config" title="Data Map / Scan configuration">
      <PageHead title="Scan configuration & scheduling" titleTip="Configure a discovery scan scoped only to DPO-approved sources, with a size-aware schedule suggestion for large legacy sources to avoid timeouts." />
      <ScanConfigPicker approved={approved} unapproved={unapproved} />
    </Shell>
  );
}
