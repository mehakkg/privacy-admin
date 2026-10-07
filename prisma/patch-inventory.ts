/**
 * Data inventory rebuild (idempotent, every deploy).
 *
 * 1. Remaps ClassifiedField.sensitivityTier from the old high/medium/low to the
 *    DLP's labels (Restricted | Confidential | Internal | Public), and marks
 *    still-pending fields "Not classified" so the Classify gap is demoable.
 * 2. Backfills the field↔purpose join table from each field's existing primary
 *    purposeTagId, so a field can now carry several purposes.
 *
 * Only touches rows that still hold an old value / have no link yet, so a
 * demo-edited state survives redeploys.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const REGULATED = /PAN|AADHAAR|PASSPORT|CARD|ACCOUNT|SSN|VOTER|LICENSE|UAN|ABHA/i;

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-inventory: no DATABASE_URL, skipping."); return; }

  // 1. Sensitivity vocabulary → DLP labels (old values only).
  const remap: Record<string, string> = { high: "Confidential", medium: "Internal", low: "Public" };
  for (const [oldv, label] of Object.entries(remap)) {
    await prisma.classifiedField.updateMany({ where: { sensitivityTier: oldv }, data: { sensitivityTier: label } });
  }
  // Promote regulated identifiers to Restricted (from Confidential, idempotent).
  const confidential = await prisma.classifiedField.findMany({ where: { sensitivityTier: "Confidential" }, select: { id: true, fieldPath: true, detectedType: true, overriddenType: true } });
  for (const f of confidential) {
    if (REGULATED.test(`${f.fieldPath} ${f.overriddenType ?? f.detectedType}`)) {
      await prisma.classifiedField.updateMany({ where: { id: f.id }, data: { sensitivityTier: "Restricted" } });
    }
  }
  // Pending (never reviewed) fields read as "Not classified" until classified in DLP.
  await prisma.classifiedField.updateMany({ where: { reviewState: "pending", sensitivityTier: { in: ["Confidential", "Internal", "Public"] } }, data: { sensitivityTier: "Not classified" } });

  // 2. Backfill the field↔purpose join from the existing primary purpose.
  const withPrimary = await prisma.classifiedField.findMany({ where: { purposeTagId: { not: null } }, select: { id: true, purposeTagId: true } });
  let linked = 0;
  for (const f of withPrimary) {
    const exists = await prisma.inventoryFieldPurpose.findUnique({ where: { fieldId_purposeTagId: { fieldId: f.id, purposeTagId: f.purposeTagId! } } });
    if (!exists) { await prisma.inventoryFieldPurpose.create({ data: { fieldId: f.id, purposeTagId: f.purposeTagId! } }); linked++; }
  }

  console.log(`patch-inventory: sensitivity remapped to DLP labels; ${linked} purpose links backfilled.`);
}

main().catch((e) => console.error("patch-inventory failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
