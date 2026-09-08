import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { FlaggedList, type FlaggedRow } from "@/components/flaggedList";

export const dynamic = "force-dynamic";

const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** SCREEN 3.4 — Undisclosed-Transfer Detection (DPO). */
export default async function FlaggedPage() {
  const flagged = await db.subProcessorDisclosure.findMany({
    where: { detected: true },
    include: { primaryVendor: true },
    orderBy: { firstDetectedAt: "desc" },
  });

  const rows: FlaggedRow[] = flagged.map((d) => ({
    id: d.id,
    primaryVendor: d.primaryVendor.name,
    suspected: d.subProcessorName,
    firstDetected: fmt(d.firstDetectedAt),
    flagStatus: d.flagStatus ?? "under_investigation",
  }));

  return (
    <Shell active="/vendor-risk/sub-processor-disclosures" title="Vendor Risk / Flagged transfers">
      <PageHead
        crumbs={[{ label: "Sub-processor disclosures", href: "/vendor-risk/sub-processor-disclosures" }, { label: "Flagged transfers" }]}
        title="Undisclosed-transfer detection"
        titleTip="Data moving to a party declared in no DPA or disclosure — typically a vendor quietly using its own subcontractor. Detected off the live flow map, not by reading contracts."
      />
      <FlaggedList rows={rows} />
    </Shell>
  );
}
