"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { audited } from "@/lib/engines/audit";
import type { TxClient } from "@/lib/tx";
import type { ActionResult } from "@/app/actions/requests";

const RATINGS = new Set(["low", "medium", "high", "critical"]);
const MAPPING_EDITORS = new Set(["legal", "dpo"]);

/**
 * Add a Purpose → PII mapping to a vendor. Only Legal/DPO may edit these — they
 * are what the /tprm mind-map and the undisclosed-transfer detector read from,
 * so the people who own that relationship must be able to maintain it, not just
 * inherit seeded rows. Follows the provision/revoke-portal-access pattern.
 */
export async function addPurposeMappingAction(
  vendorId: string,
  purposeTagId: string,
  piiTypes: string[],
  activityName?: string,
): Promise<ActionResult> {
  const { actor, role } = await getSession();
  if (!MAPPING_EDITORS.has(role)) return { ok: false, error: "Only Legal or the DPO can edit purpose mappings.", errorKind: "ForbiddenError" };
  if (!purposeTagId) return { ok: false, error: "Pick a purpose.", errorKind: "ValidationError" };
  if (!piiTypes.length) return { ok: false, error: "Select at least one PII type.", errorKind: "ValidationError" };
  try {
    await audited(
      { actor, action: "vendor.purpose_mapping_added", targetType: "Vendor", targetId: vendorId, payload: { purposeTagId, piiTypes, activityName } },
      async (tx: TxClient) => {
        const pt = await tx.purposeTag.findUnique({ where: { id: purposeTagId } });
        return tx.vendorPurposeMapping.create({
          data: { vendorId, purposeTagId, purposeName: pt?.name ?? "Purpose", piiTypesJson: JSON.stringify(piiTypes), activityName: activityName?.trim() || null },
        });
      },
    );
    revalidatePath("/vendor-risk/register", "layout");
    return { ok: true };
  } catch (error) {
    const e = error as Error;
    return { ok: false, error: e.message, errorKind: e.name };
  }
}

/** Remove a purpose mapping. Legal/DPO only, and never a policy-locked row (one
 *  tied to an approved PurposeTag) — that guard holds server-side too. */
export async function removePurposeMappingAction(mappingId: string): Promise<ActionResult> {
  const { actor, role } = await getSession();
  if (!MAPPING_EDITORS.has(role)) return { ok: false, error: "Only Legal or the DPO can edit purpose mappings.", errorKind: "ForbiddenError" };
  try {
    await audited(
      { actor, action: "vendor.purpose_mapping_removed", targetType: "VendorPurposeMapping", targetId: mappingId, payload: {} },
      async (tx: TxClient) => {
        const m = await tx.vendorPurposeMapping.findUniqueOrThrow({ where: { id: mappingId } });
        if (m.purposeTagId) throw Object.assign(new Error("This mapping is policy-locked and can't be removed here."), { name: "ForbiddenError" });
        return tx.vendorPurposeMapping.delete({ where: { id: mappingId } });
      },
    );
    revalidatePath("/vendor-risk/register", "layout");
    return { ok: true };
  } catch (error) {
    const e = error as Error;
    return { ok: false, error: e.message, errorKind: e.name };
  }
}

/**
 * Override a vendor's risk rating. A human owns the rating — so every change off
 * the system baseline is logged with who / from / to / why (an audit entry AND a
 * row in the vendor's own override history), the same evidentiary standard as
 * every other governance object here. A reason is required, never optional.
 */
export async function overrideVendorRiskAction(
  vendorId: string,
  newRating: string,
  reason: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!RATINGS.has(newRating)) return { ok: false, error: "Invalid rating.", errorKind: "ValidationError" };
  if (!reason.trim()) return { ok: false, error: "A reason is required for a risk override.", errorKind: "ValidationError" };
  try {
    await audited(
      {
        actor,
        action: "vendor.risk_overridden",
        targetType: "Vendor",
        targetId: vendorId,
        payload: { newRating, reason: reason.trim() },
      },
      async (tx: TxClient) => {
        const v = await tx.vendor.findUniqueOrThrow({ where: { id: vendorId } });
        if (v.riskRating === newRating) {
          throw Object.assign(new Error("That is already the current rating."), { name: "StateError" });
        }
        const history = JSON.parse(v.riskOverrideHistoryJson || "[]");
        history.unshift({ from: v.riskRating, to: newRating, by: actor.label, reason: reason.trim(), at: new Date().toISOString() });
        return tx.vendor.update({
          where: { id: vendorId },
          data: { riskRating: newRating, riskOverrideHistoryJson: JSON.stringify(history), lastReviewedAt: new Date() },
        });
      },
    );
    revalidatePath("/vendor-risk/register", "layout");
    return { ok: true };
  } catch (error) {
    const e = error as Error;
    return { ok: false, error: e.message, errorKind: e.name };
  }
}
