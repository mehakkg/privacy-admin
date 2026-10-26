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

/** Edit a fiduciary. Only name, legalName and sdfStatus have DB columns; the
 *  other registration fields (CIN, office, contacts) are fixture-backed and don't
 *  persist in this prototype. Audit logging would attach here automatically. */
export async function editFiduciaryAction(
  id: string,
  patch: { name?: string; legalName?: string | null; sdfStatus?: "not_assessed" | "sdf" },
): Promise<EResult> {
  const data: { name?: string; legalName?: string | null; sdfStatus?: string } = {};
  if (patch.name !== undefined) { const n = patch.name.trim(); if (!n) return { ok: false, error: "Name the fiduciary." }; data.name = n; }
  if (patch.legalName !== undefined) data.legalName = patch.legalName?.trim() || null;
  if (patch.sdfStatus !== undefined) data.sdfStatus = patch.sdfStatus;
  await db.entity.update({ where: { id }, data });
  revalidatePath("/settings/organization", "page");
  revalidatePath("/data-map/processing-activities", "layout");
  return { ok: true };
}
