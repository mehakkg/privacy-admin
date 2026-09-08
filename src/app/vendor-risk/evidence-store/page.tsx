import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { EvidenceStore, type VendorEvidence } from "@/components/evidenceStore";

export const dynamic = "force-dynamic";

const DAY = 86400000;
const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** SCREEN 3.6 — Evidence Package Store (per vendor / processor account). */
export default async function EvidenceStorePage() {
  const now = Date.now();
  const vendors = await db.vendor.findMany({
    orderBy: { name: "asc" },
    include: { documents: { orderBy: { uploadedAt: "desc" } } },
  });

  const data: VendorEvidence[] = vendors
    .filter((v) => v.documents.length > 0)
    .map((v) => ({
      vendorId: v.id,
      vendorName: v.name,
      docs: v.documents.map((d) => ({
        name: d.name,
        docType: d.docType,
        uploadedAt: fmt(d.uploadedAt)!,
        expiresAt: fmt(d.expiresAt),
        daysToExpiry: d.expiresAt ? Math.ceil((d.expiresAt.getTime() - now) / DAY) : null,
        fromDisclosure: Boolean(d.disclosureId),
      })),
    }));

  return (
    <Shell active="/vendor-risk/sub-processor-disclosures" title="Vendor Risk / Evidence store">
      <PageHead
        title="Evidence package store"
        titleTip="A standing, continuously-maintained library of each processor's compliance evidence, so a short-notice audit is answered from a maintained store rather than a scramble."
      />
      {data.length === 0 ? (
        <div className="empty"><p style={{ margin: 0 }}>No compliance documents on file yet. Documents attached to a disclosure appear here automatically.</p></div>
      ) : (
        <EvidenceStore vendors={data} />
      )}
    </Shell>
  );
}
