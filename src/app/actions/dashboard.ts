"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentRole } from "@/lib/session";
import { LIBRARY } from "@/lib/dashboard/widgets";
import type { ActionResult } from "@/app/actions/requests";

export interface SavedWidget { id: string; size: "compact" | "full" }

const VALID_IDS = new Set(LIBRARY.map((w) => w.id));

/**
 * Persist the current role's My Dashboard layout. Keyed by ROLE (from the
 * session, never from the client) so a DPO and an Admin keep different layouts —
 * per-role, not per-person, matching every other configuration in this product.
 * Tier-1 widget ids are rejected: they are pinned on Operations and are not
 * customization candidates, so they can never enter a saved layout.
 */
export async function saveDashboardLayoutAction(widgets: SavedWidget[]): Promise<ActionResult> {
  const role = await getCurrentRole();
  const cleaned = widgets
    .filter((w) => VALID_IDS.has(w.id))
    .map((w) => ({ id: w.id, size: w.size === "full" ? "full" : "compact" }));
  try {
    await db.dashboardLayout.upsert({
      where: { role },
      create: { role, widgetsJson: JSON.stringify(cleaned) },
      update: { widgetsJson: JSON.stringify(cleaned) },
    });
    revalidatePath("/dashboard", "layout");
    return { ok: true };
  } catch (error) {
    const e = error as Error;
    return { ok: false, error: e.message, errorKind: e.name };
  }
}
