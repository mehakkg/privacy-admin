"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

/** Dev-only (?dev=1) toggles for the Processing Activities flags. */
export async function setPaConfigAction(patch: { multiEntity?: boolean; requireDpoReview?: boolean }): Promise<{ ok: boolean }> {
  const data: Record<string, boolean> = {};
  if (patch.multiEntity !== undefined) data.paMultiEntity = patch.multiEntity;
  if (patch.requireDpoReview !== undefined) data.paRequireDpoReview = patch.requireDpoReview;
  await db.integrationConfig.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
  revalidatePath("/", "layout");
  return { ok: true };
}
