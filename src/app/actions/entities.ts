"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

export interface EResult { ok: boolean; error?: string }

/** Add a legal entity (fiduciary). The DB Entity holds name + legalName; address,
 *  DPO and grievance officer would need schema columns (flagged). */
export async function addEntityAction(name: string, legalName: string): Promise<EResult> {
  const n = name.trim();
  if (!n) return { ok: false, error: "Name the entity." };
  await db.entity.create({ data: { name: n, legalName: legalName.trim() || null, kind: "legal_entity" } });
  revalidatePath("/settings/organization/entities", "page");
  revalidatePath("/data-map/processing-activities", "layout");
  return { ok: true };
}
