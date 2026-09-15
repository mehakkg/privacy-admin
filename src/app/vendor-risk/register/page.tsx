import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { PageHead, Stat } from "@/components/ui";
import { VendorRegister, type VendorDetail } from "@/components/vendorRegister";
import { getCurrentRole } from "@/lib/session";
import { decodeList } from "@/lib/codec/json";

export const dynamic = "force-dynamic";

const DAY = 86400000;

function fmt(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/**
 * SCREEN 1 — Vendor Register (+ DPA Registry view). The single source of truth
 * for every vendor: category, human-owned risk rating, the purposes and PII they
 * are cleared to touch, and where their DPA sits. The DPA Registry is the same
 * data sorted by expiry proximity, for scanning all agreements at once.
 */
export default async function VendorRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; risk?: string; category?: string; dpa?: string; purpose?: string }>;
}) {
  const params = await searchParams;
  const view = params.view === "dpa" ? "dpa" : "vendors";
  const now = Date.now();

  const [vendors, approvedPurposes, role] = await Promise.all([
    db.vendor.findMany({
      include: {
        purposeMappings: { include: { purposeTag: true } },
        processors: { select: { id: true, name: true, processorScope: true } },
        portalAccess: true,
      },
      orderBy: { name: "asc" },
    }),
    db.purposeTag.findMany({ where: { status: "approved" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getCurrentRole(),
  ]);

  let details: VendorDetail[] = vendors.map((v) => {
    const piiSet = new Set<string>();
    for (const m of v.purposeMappings) for (const t of decodeList(m.piiTypesJson)) piiSet.add(t);
    const daysToExpiry = v.dpaExpiresAt ? Math.ceil((v.dpaExpiresAt.getTime() - now) / DAY) : null;
    return {
      id: v.id,
      name: v.name,
      category: v.category,
      riskRating: v.riskRating,
      riskBaseline: v.riskBaseline,
      ownerName: v.ownerName,
      onboardedAt: fmt(v.onboardedAt),
      lastReviewed: fmt(v.lastReviewedAt),
      purposesCount: v.purposeMappings.length,
      piiCount: piiSet.size,
      dpa: {
        name: v.dpaName, scope: v.dpaScope, signedAt: fmt(v.dpaSignedAt), expiresAt: fmt(v.dpaExpiresAt),
        status: v.dpaStatus, daysToExpiry, docLink: v.dpaDocLink,
      },
      mappings: v.purposeMappings.map((m) => ({
        id: m.id,
        purposeName: m.purposeTag?.name ?? m.purposeName,
        locked: Boolean(m.purposeTagId),
        piiTypes: decodeList(m.piiTypesJson),
        activityName: m.activityName,
      })),
      overrideHistory: (JSON.parse(v.riskOverrideHistoryJson || "[]") as VendorDetail["overrideHistory"]),
      linkedProcessors: v.processors.map((p) => ({ id: p.id, name: p.name, activity: p.processorScope })),
      portal: v.portalAccess ? { contactName: v.portalAccess.contactName, email: v.portalAccess.email, provisionedAt: fmt(v.portalAccess.provisionedAt) ?? "—" } : null,
    };
  });

  // Filters (server-side, via the Compact Filter Bar).
  const derivedDpa = (v: VendorDetail) => {
    const s = v.dpa.status;
    if (s === "not_on_file") return "not_on_file";
    if (v.dpa.daysToExpiry !== null && v.dpa.daysToExpiry < 0) return "expired";
    if (s === "active" && v.dpa.daysToExpiry !== null && v.dpa.daysToExpiry < 30) return "expiring";
    return "active";
  };
  const term = (params.q ?? "").trim().toLowerCase();
  if (term) details = details.filter((v) => v.name.toLowerCase().includes(term));
  if (params.risk) details = details.filter((v) => v.riskRating === params.risk);
  if (params.category) details = details.filter((v) => v.category === params.category);
  if (params.dpa) details = details.filter((v) => derivedDpa(v) === params.dpa);
  if (params.purpose) details = details.filter((v) => v.mappings.some((m) => m.purposeName === params.purpose));

  if (view === "dpa") {
    details = details
      .filter((v) => v.dpa.status !== "not_on_file")
      .sort((a, b) => (a.dpa.daysToExpiry ?? 1e9) - (b.dpa.daysToExpiry ?? 1e9));
  }

  const categories = [...new Set(vendors.map((v) => v.category))].sort();
  const purposeNames = [...new Set(vendors.flatMap((v) => v.purposeMappings.map((m) => m.purposeTag?.name ?? m.purposeName)))].sort();
  const expiringSoon = details.filter((v) => v.dpa.status === "active" && v.dpa.daysToExpiry !== null && v.dpa.daysToExpiry < 30).length;
  const critical = vendors.filter((v) => v.riskRating === "critical").length;

  return (
    <Shell active="/vendor-risk/register" title="Vendor Risk / Vendor register">
      <PageHead
        title="Vendor register"
        titleTip="Every vendor who touches personal data on the Fiduciary's behalf — category, human-owned risk rating, the purposes and PII they're cleared for, and their DPA. Replaces the spreadsheet-and-Drive-folder."
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Vendors" value={vendors.length} />
        <Stat label="Critical risk" value={critical} tone={critical ? "red" : undefined} />
        <Stat label="DPA expiring < 30d" value={expiringSoon} tone={expiringSoon ? "yellow" : undefined} />
        <Stat label="No DPA on file" value={vendors.filter((v) => v.dpaStatus === "not_on_file").length} />
      </div>

      <nav className="stepper" style={{ marginBottom: 16 }}>
        <Link href="/vendor-risk/register" className={`step${view === "vendors" ? " active" : ""}`}><span className="step-label">Vendors</span></Link>
        <Link href="/vendor-risk/register?view=dpa" className={`step${view === "dpa" ? " active" : ""}`}><span className="step-label">DPA registry</span></Link>
      </nav>

      {view === "vendors" && (
        <CompactFilterBar
          basePath="/vendor-risk/register"
          searchPlaceholder="Search vendors…"
          facets={[
            { key: "risk", label: "Risk rating", options: [
              { value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }, { value: "critical", label: "Critical" },
            ] },
            { key: "category", label: "Category", options: categories.map((c) => ({ value: c, label: c })) },
            { key: "dpa", label: "DPA status", options: [
              { value: "active", label: "Active" }, { value: "expiring", label: "Expiring" }, { value: "expired", label: "Expired" }, { value: "not_on_file", label: "Not on file" },
            ] },
            { key: "purpose", label: "Purpose", options: purposeNames.map((p) => ({ value: p, label: p })) },
          ]}
        />
      )}

      <VendorRegister vendors={details} view={view} purposes={approvedPurposes} role={role} />
    </Shell>
  );
}
