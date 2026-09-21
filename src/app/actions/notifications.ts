"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import type { ActionResult } from "@/app/actions/requests";
import { isMutable, CATEGORY_ORDER } from "@/lib/notifications";

/** Save one category's preference for the acting role. dpo_approval_needed and
 *  breach_clock can never be muted — enforced HERE, not just hidden in the UI. */
export async function savePreferenceAction(category: string, channels: string[], muted: boolean): Promise<ActionResult> {
  const { role } = await getSession();
  if (!(CATEGORY_ORDER as readonly string[]).includes(category)) return { ok: false, error: "Unknown category.", errorKind: "ValidationError" };
  if (muted && !isMutable(category)) {
    return { ok: false, error: "This notification is required and cannot be muted — it's tied to a statutory or governance deadline.", errorKind: "PolicyError" };
  }
  const channelsJson = JSON.stringify(channels.filter((c) => c === "in_app" || c === "email"));
  try {
    await db.notificationPreference.upsert({
      where: { role_category: { role, category } },
      update: { channelsJson, muted },
      create: { role, category, channelsJson, muted },
    });
    revalidatePath("/notifications/channels", "layout");
    return { ok: true };
  } catch (error) { const e = error as Error; return { ok: false, error: e.message, errorKind: e.name }; }
}

export async function markAllReadAction(): Promise<ActionResult> {
  const { role } = await getSession();
  try {
    await db.notification.updateMany({ where: { targetRole: role, readAt: null }, data: { readAt: new Date() } });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) { const e = error as Error; return { ok: false, error: e.message, errorKind: e.name }; }
}

export async function markReadAction(id: string): Promise<ActionResult> {
  const { role } = await getSession();
  try {
    await db.notification.updateMany({ where: { id, targetRole: role, readAt: null }, data: { readAt: new Date() } });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) { const e = error as Error; return { ok: false, error: e.message, errorKind: e.name }; }
}
