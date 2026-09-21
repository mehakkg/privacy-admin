"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { audited } from "@/lib/engines/audit";
import type { TxClient } from "@/lib/tx";
import type { ActionResult } from "@/app/actions/requests";
import { meetsAAOnWhite, normalizeHex } from "@/lib/wcag";

const PATH = "/settings/organization";

function run(op: () => Promise<unknown>): Promise<ActionResult> {
  return (async () => {
    try { await op(); revalidatePath(PATH, "layout"); return { ok: true }; }
    catch (error) { const e = error as Error; return { ok: false, error: e.message, errorKind: e.name }; }
  })();
}

export interface OrgProfileInput {
  legalName: string; displayName: string; industry: string; address: string; contactEmail: string;
}

export async function saveOrgProfileAction(input: OrgProfileInput): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!input.legalName.trim()) return { ok: false, error: "Legal entity name can't be blank.", errorKind: "ValidationError" };
  return run(() =>
    audited(
      { actor, action: "org.profile_saved", targetType: "OrgSettings", targetId: "org", payload: {} },
      (tx: TxClient) => tx.orgSettings.upsert({
        where: { id: "org" },
        update: { legalName: input.legalName.trim(), displayName: input.displayName.trim() || null, industry: input.industry.trim() || null, address: input.address.trim() || null, contactEmail: input.contactEmail.trim() || null },
        create: { id: "org", legalName: input.legalName.trim(), displayName: input.displayName.trim() || null, industry: input.industry.trim() || null, address: input.address.trim() || null, contactEmail: input.contactEmail.trim() || null },
      }),
    ),
  );
}

/** Per-entity legal-name override (null clears it → inherits the org default). */
export async function setEntityLegalNameAction(entityId: string, legalName: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() =>
    audited(
      { actor, action: "org.entity_legal_name_set", targetType: "Entity", targetId: entityId, payload: { legalName: legalName.trim() || null } },
      (tx: TxClient) => tx.entity.update({ where: { id: entityId }, data: { legalName: legalName.trim() || null } }),
    ),
  );
}

export interface BrandingInput { logoUrl: string | null; primaryColor: string | null; faviconUrl: string | null }

/** Server-side WCAG gate — the hard block holds even if the UI is bypassed. */
function assertContrast(primaryColor: string | null) {
  if (primaryColor && normalizeHex(primaryColor) && !meetsAAOnWhite(primaryColor)) {
    throw Object.assign(new Error("This color combination doesn't meet WCAG AA contrast — text may be unreadable in notices."), { name: "ContrastError" });
  }
}

export async function saveBrandingAction(input: BrandingInput): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() =>
    audited(
      { actor, action: "org.branding_saved", targetType: "OrganizationBranding", targetId: "org", payload: { primaryColor: input.primaryColor } },
      async (tx: TxClient) => {
        assertContrast(input.primaryColor);
        return tx.organizationBranding.upsert({
          where: { id: "brand_org" },
          update: { logoUrl: input.logoUrl, primaryColor: input.primaryColor, faviconUrl: input.faviconUrl, updatedBy: actor.label },
          create: { id: "brand_org", entityId: null, logoUrl: input.logoUrl, primaryColor: input.primaryColor, faviconUrl: input.faviconUrl, updatedBy: actor.label },
        });
      },
    ),
  );
}

export async function saveEntityBrandingAction(entityId: string, input: BrandingInput): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() =>
    audited(
      { actor, action: "org.entity_branding_saved", targetType: "OrganizationBranding", targetId: entityId, payload: { primaryColor: input.primaryColor } },
      async (tx: TxClient) => {
        assertContrast(input.primaryColor);
        return tx.organizationBranding.upsert({
          where: { entityId },
          update: { logoUrl: input.logoUrl, primaryColor: input.primaryColor, faviconUrl: input.faviconUrl, updatedBy: actor.label },
          create: { entityId, logoUrl: input.logoUrl, primaryColor: input.primaryColor, faviconUrl: input.faviconUrl, updatedBy: actor.label },
        });
      },
    ),
  );
}

/** Remove a per-entity branding override → the entity inherits the org default. */
export async function removeEntityBrandingAction(entityId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() =>
    audited(
      { actor, action: "org.entity_branding_removed", targetType: "OrganizationBranding", targetId: entityId, payload: {} },
      (tx: TxClient) => tx.organizationBranding.deleteMany({ where: { entityId } }),
    ),
  );
}
