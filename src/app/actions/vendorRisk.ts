"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { audited } from "@/lib/engines/audit";
import type { TxClient } from "@/lib/tx";
import type { ActionResult } from "@/app/actions/requests";

const RATINGS = new Set(["low", "medium", "high", "critical"]);

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
