import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentRole } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { Notice, PageHead, Stat } from "@/components/ui";
import { DisclosuresQueue, type DisclosureRow } from "@/components/disclosuresQueue";
import { decodeList } from "@/lib/codec/json";

export const dynamic = "force-dynamic";

const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** SCREEN 3.1 — Sub-Processor Disclosures Queue. Registered relationships and
 *  detector-flagged suspicions in one place, visually distinguishable. */
export default async function DisclosuresPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; vendor?: string }>;
}) {
  const params = await searchParams;
  const [role, disclosures, vendors] = await Promise.all([
    getCurrentRole(),
    db.subProcessorDisclosure.findMany({ include: { primaryVendor: true, documents: true }, orderBy: { createdAt: "desc" } }),
    db.vendor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  let rows: DisclosureRow[] = disclosures.map((d) => ({
    id: d.id,
    primaryVendor: d.primaryVendor.name,
    subProcessorName: d.subProcessorName,
    scope: d.scope,
    piiTypes: decodeList(d.piiTypesJson),
    status: d.status,
    reason: d.reason,
    disclosedAt: fmt(d.disclosedAt),
    docCount: d.documents.length,
    docs: d.documents.map((x) => ({ name: x.name, docType: x.docType, expiresAt: fmt(x.expiresAt) })),
    detected: d.detected,
    flagStatus: d.flagStatus,
    rejectedReason: d.rejectedReason,
  }));

  if (params.status) rows = rows.filter((r) => r.status === params.status);
  if (params.vendor) rows = rows.filter((r) => r.primaryVendor === params.vendor);

  const held = disclosures.filter((d) => d.status === "held_pending_approval").length;
  const flagged = disclosures.filter((d) => d.status === "flagged" && d.flagStatus !== "resolved").length;

  return (
    <Shell active="/vendor-risk/sub-processor-disclosures" title="Vendor Risk / Sub-processor disclosures">
      <PageHead
        title="Sub-processor disclosures"
        titleTip="Where a contracted vendor brings in its own subcontractor. The disclosure-and-approval chain makes an undisclosed transfer detectable after the fact, and preventable before it happens."
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Disclosures" value={disclosures.length} />
        <Stat label="Held — awaiting approval" value={held} tone={held ? "yellow" : undefined} />
        <Stat label="Undisclosed — flagged" value={flagged} tone={flagged ? "red" : undefined} />
      </div>

      {flagged > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Notice tone="danger" title="Undisclosed transfers detected">
            {flagged} data transfer{flagged === 1 ? "" : "s"} match no registered vendor or approved disclosure.{" "}
            <Link href="/vendor-risk/sub-processor-disclosures/flagged" className="row-link">Review flagged transfers →</Link>
          </Notice>
        </div>
      )}

      <CompactFilterBar
        basePath="/vendor-risk/sub-processor-disclosures"
        searchKey="q"
        searchPlaceholder="Search…"
        facets={[
          { key: "status", label: "Status", options: [
            { value: "pending_disclosure", label: "Pending disclosure" },
            { value: "held_pending_approval", label: "Held pending approval" },
            { value: "active", label: "Active" },
            { value: "flagged", label: "Undisclosed — flagged" },
          ] },
          { key: "vendor", label: "Primary vendor", options: vendors.map((v) => ({ value: v.name, label: v.name })) },
        ]}
        actions={<Link href="/vendor-risk/sub-processor-disclosures/new" className="btn primary sm">+ New disclosure</Link>}
      />

      <DisclosuresQueue rows={rows} role={role} />

      <p className="cell-sub" style={{ marginTop: 12 }}>
        Processors maintain their compliance evidence in the <Link href="/vendor-risk/evidence-store" className="row-link">Evidence store</Link>.
      </p>
    </Shell>
  );
}
