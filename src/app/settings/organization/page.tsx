import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { OrgProfileForm, type EntityProfile } from "@/components/settings/OrgProfileForm";
import { OrgBrandingForm, type EntityBranding, type BrandingValue } from "@/components/settings/OrgBrandingForm";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "profile", label: "Profile" },
  { key: "branding", label: "Branding" },
] as const;
type Tab = (typeof TABS)[number]["key"];

/**
 * SETTINGS → ORGANIZATION. Two tabs: Profile (org details that surface on
 * Data-Principal-facing correspondence) and Branding (logo / primary color /
 * favicon applied to Notices and the Preference Centre, with a live preview and a
 * hard WCAG-contrast gate). Per-entity overrides are opt-in; absence inherits the
 * org default. Distinct from Identity & Access → Governance Setup.
 */
export default async function OrganizationSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab: Tab = params.tab === "branding" ? "branding" : "profile";

  const [org, entities, brandingRows] = await Promise.all([
    db.orgSettings.findUnique({ where: { id: "org" } }),
    db.entity.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, legalName: true } }),
    db.organizationBranding.findMany(),
  ]);

  const orgDefaultRow = brandingRows.find((r) => !r.entityId) ?? null;
  const orgDefault: BrandingValue = {
    logoUrl: orgDefaultRow?.logoUrl ?? null,
    primaryColor: orgDefaultRow?.primaryColor ?? null,
    faviconUrl: orgDefaultRow?.faviconUrl ?? null,
  };
  const orgName = org?.displayName || org?.legalName || org?.name || "Your Organization";

  const entityProfiles: EntityProfile[] = entities.map((e) => ({ id: e.id, name: e.name, legalName: e.legalName }));
  const byEntity = new Map(brandingRows.filter((r) => r.entityId).map((r) => [r.entityId!, r]));
  const entityBranding: EntityBranding[] = entities.map((e) => {
    const row = byEntity.get(e.id);
    return { id: e.id, name: e.name, branding: row ? { logoUrl: row.logoUrl, primaryColor: row.primaryColor, faviconUrl: row.faviconUrl } : null };
  });

  return (
    <Shell active="/settings/organization" title="Organization">
      <PageHead
        title="Organization"
        titleTip="Your organization's profile and the branding applied to consent notices and the preference centre. Separate from Identity & Access → Governance Setup, which routes approvals."
      />

      <nav className="stepper" style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <Link key={t.key} href={`/settings/organization?tab=${t.key}`} className={`step${t.key === tab ? " active" : ""}`}>
            <span className="step-label">{t.label}</span>
          </Link>
        ))}
      </nav>

      {tab === "profile" ? (
        <OrgProfileForm
          initial={{
            legalName: org?.legalName ?? org?.name ?? "",
            displayName: org?.displayName ?? "",
            industry: org?.industry ?? "",
            address: org?.address ?? "",
            contactEmail: org?.contactEmail ?? "",
          }}
          entities={entityProfiles}
        />
      ) : (
        <OrgBrandingForm orgName={orgName} initial={orgDefault} entities={entityBranding} />
      )}
    </Shell>
  );
}
