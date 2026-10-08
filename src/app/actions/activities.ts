"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export interface ActResult { ok: boolean; error?: string; id?: string }
const LIST = "/data-map/processing-activities";
function touch() { revalidatePath(LIST, "page"); }

/** Minimal draft create for the list's Add button (the full 2-step modal lands in M3). */
export async function createDraftActivityAction(name: string): Promise<ActResult> {
  const { actor } = await getSession();
  const n = name.trim();
  if (n.length < 3 || n.length > 80) return { ok: false, error: "Use a name of 3 to 80 characters." };
  const clash = await db.processingActivity.findFirst({ where: { activity: { equals: n }, lifecycleState: { not: "retired" } } });
  if (clash) return { ok: false, error: `An activity named ${n} already exists.` };
  const row = await db.processingActivity.create({ data: { activity: n, origin: "manual", lifecycleState: "draft", ownerName: actor.label, createdBy: actor.label, principalsJson: "[]" } });
  touch();
  return { ok: true, id: row.id };
}
