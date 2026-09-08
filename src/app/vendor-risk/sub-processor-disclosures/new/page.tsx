import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { Notice, PageHead } from "@/components/ui";
import { DisclosureWizard } from "@/components/disclosureWizard";

export const dynamic = "force-dynamic";

/** SCREEN 3.2 — Sub-Processor Disclosure Flow (Data Processor-side). */
export default async function NewDisclosurePage() {
  const vendors = await db.vendor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

  return (
    <Shell active="/vendor-risk/sub-processor-disclosures" title="Vendor Risk / New disclosure">
      <PageHead
        crumbs={[{ label: "Sub-processor disclosures", href: "/vendor-risk/sub-processor-disclosures" }, { label: "New" }]}
        title="Disclose a sub-processor engagement"
        titleTip="The processor-side flow. Register the sub-processor, attach compliance documents, and submit — which places the engagement on hold until the Fiduciary approves."
      />
      <div style={{ marginBottom: 12 }}>
        <Notice tone="info" title="Data Processor view">
          In production this is a scoped guest surface the vendor logs into. Submitting never activates the engagement — only a Legal/DPO approval can.
        </Notice>
      </div>
      <DisclosureWizard vendors={vendors} />
    </Shell>
  );
}
