"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { audited } from "@/lib/engines/audit";
import type { TxClient } from "@/lib/tx";
import type { ActionResult } from "@/app/actions/requests";

function ok(paths: string[]): ActionResult { paths.forEach((p) => revalidatePath(p, "layout")); return { ok: true }; }
function fail(error: string, kind = "ValidationError"): ActionResult { return { ok: false, error, errorKind: kind }; }

/** Toggle the TPRM integration. Structural + governance-affecting, so it's
 *  audited (who, when, previous → new) like any other config change. */
export async function setTprmIntegrationAction(enabled: boolean): Promise<ActionResult> {
  const { actor } = await getSession();
  try {
    await audited(
      { actor, action: enabled ? "integration.tprm_enabled" : "integration.tprm_disabled", targetType: "IntegrationConfig", targetId: "singleton", payload: { enabled } },
      (tx: TxClient) =>
        tx.integrationConfig.upsert({
          where: { id: "singleton" },
          create: { id: "singleton", tprmEnabled: enabled, updatedBy: actor.label },
          update: { tprmEnabled: enabled, updatedBy: actor.label },
        }),
    );
    return ok(["/integrations/data-processors"]);
  } catch (e) { return fail((e as Error).message, (e as Error).name); }
}

/** Provision the single Data-Processor portal login for a Vendor (Screen 4b). */
export async function provisionPortalAccessAction(vendorId: string, contactName: string, email: string, scope: string[]): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!contactName.trim() || !email.trim()) return fail("Contact name and email are required.");
  try {
    await audited(
      { actor, action: "vendor.portal_provisioned", targetType: "Vendor", targetId: vendorId, payload: { email: email.trim(), scope } },
      async (tx: TxClient) => {
        const existing = await tx.vendorPortalAccess.findUnique({ where: { vendorId } });
        if (existing) throw Object.assign(new Error("This vendor already has portal access. Manage it instead of creating a second login."), { name: "StateError" });
        return tx.vendorPortalAccess.create({ data: { vendorId, contactName: contactName.trim(), email: email.trim(), scopeJson: JSON.stringify(scope), provisionedBy: actor.label } });
      },
    );
    return ok(["/vendor-risk/register"]);
  } catch (e) { return fail((e as Error).message, (e as Error).name); }
}

export async function revokePortalAccessAction(vendorId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try {
    await audited(
      { actor, action: "vendor.portal_revoked", targetType: "Vendor", targetId: vendorId, payload: {} },
      (tx: TxClient) => tx.vendorPortalAccess.deleteMany({ where: { vendorId } }),
    );
    return ok(["/vendor-risk/register"]);
  } catch (e) { return fail((e as Error).message, (e as Error).name); }
}

/**
 * SCREEN 2 — import a Privacy Processor record from a TPRM Vendor. Only valid
 * when the integration is on and a Vendor is selected. Vendor-owned fields are
 * pulled from the Vendor (never re-entered); only the processing-activity-
 * specific detail is captured here. The Vendor ID is the link stored back.
 */
export async function importProcessorFromVendorAction(
  vendorId: string,
  input: { name: string; processorScope: string; retentionTerms: string },
): Promise<ActionResult> {
  const { actor } = await getSession();
  const config = await db.integrationConfig.findUnique({ where: { id: "singleton" } });
  if (!config?.tprmEnabled) return fail("TPRM integration is off — enable it to import processors.", "StateError");
  if (!vendorId) return fail("Select a TPRM vendor to import.");
  try {
    await audited(
      { actor, action: "processor.imported_from_tprm", targetType: "DataProcessor", targetId: vendorId, payload: { vendorId, name: input.name } },
      async (tx: TxClient) => {
        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: vendorId } });
        return tx.dataProcessor.create({
          data: {
            name: input.name.trim() || vendor.name,
            vendorId,
            // Vendor-owned fields are set from the pull, as a reference snapshot;
            // the detail view shows the live TPRM panel, not these.
            dpaId: `tprm:${vendorId}:${Date.now().toString(36)}`,
            dpaScopeJson: "[]",
            contactChannel: "portal",
            dpaStatus: vendor.dpaStatus === "active" ? "active" : "draft",
            riskClassification: vendor.riskRating,
            // Genuinely Privacy-owned, processing-specific:
            processorScope: input.processorScope.trim() || null,
            retentionTerms: input.retentionTerms.trim() || null,
          },
        });
      },
    );
    return ok(["/integrations/data-processors"]);
  } catch (e) { return fail((e as Error).message, (e as Error).name); }
}
