/**
 * ROPA suggestions demo — idempotent. The suggestion engine groups APPROVED
 * ClassifiedFields by (source, purpose, subject); with none approved, it produced
 * zero suggestions. This promotes a few existing fields to approved (with a
 * subject type and a deliberate confidence spread) and creates the matching
 * pending suggestions, so the Suggested rows + confidence + coverage are
 * demonstrable AND survive a Refresh (they're backed by real approved fields).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const keyFieldIds = (ids: string[]) => JSON.stringify([...ids].sort());

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-ropa-suggestions: no DATABASE_URL, skipping."); return; }

  if ((await prisma.ropaSuggestion.count({ where: { status: "pending" } })) > 0) {
    console.log("patch-ropa-suggestions: pending suggestions already exist, skipping.");
    return;
  }

  const approvedPurpose = await prisma.purposeTag.findFirst({ where: { status: "approved" }, orderBy: { name: "asc" } });
  const sources = await prisma.discoverySource.findMany({
    where: { fields: { some: {} } },
    include: { fields: { take: 4, orderBy: { fieldPath: "asc" } } },
    orderBy: { name: "asc" },
    take: 3,
  });
  if (sources.length === 0) { console.log("patch-ropa-suggestions: no sources with fields, skipping."); return; }

  let created = 0;
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    if (src.fields.length === 0) continue;
    // Group 2 (index 1) gets a real purpose + lower confidence; the rest stay
    // unassigned (a valid "needs DPO tagging" suggestion) with high confidence.
    const purposeTagId = i === 1 ? (approvedPurpose?.id ?? null) : null;
    const confidence = i === 1 ? "needs_review" : "high";
    const subject = "customer";
    const fieldIds = src.fields.map((f) => f.id);

    for (const id of fieldIds) {
      await prisma.classifiedField.update({ where: { id }, data: { reviewState: "approved", dataSubjectType: subject, confidence, purposeTagId } });
    }
    await prisma.ropaSuggestion.create({
      data: { sourceId: src.id, purposeTagId, dataSubjectType: subject, fieldIdsJson: keyFieldIds(fieldIds), status: "pending" },
    });
    created++;
  }
  console.log(`patch-ropa-suggestions: seeded ${created} pending suggestion(s).`);
}

main().catch((e) => console.error("patch-ropa-suggestions failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
