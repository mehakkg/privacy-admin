/**
 * Scenario 4 demo — idempotent. Seeds the DPO/CISO governance parameters (the
 * identity-match threshold and the CISO-approved integration schema) and
 * quarantines one high-risk finding so the quarantine + share-approval screen
 * has content.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CISO_APPROVED = ["email", "phone", "customer_id", "full_name", "consent_status", "marketing_opt_in", "country", "segment"];

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-scenario4: no DATABASE_URL, skipping."); return; }

  // Governance singleton — idempotent: only fill the CISO schema if still empty.
  const existing = await prisma.discoveryGovernance.findUnique({ where: { id: "singleton" } });
  if (!existing || existing.cisoApprovedFieldsJson === "[]") {
    await prisma.discoveryGovernance.upsert({
      where: { id: "singleton" },
      update: { identityMatchThreshold: 92, cisoApprovedFieldsJson: JSON.stringify(CISO_APPROVED) },
      create: { id: "singleton", identityMatchThreshold: 92, cisoApprovedFieldsJson: JSON.stringify(CISO_APPROVED) },
    });
  }

  // Quarantine one high-risk finding (if the discovery demo has one) so the gate
  // screen is demonstrable.
  if ((await prisma.classifiedField.count({ where: { quarantined: true } })) === 0) {
    const highRisk = await prisma.classifiedField.findFirst({ where: { sensitivityTier: "high", quarantined: false }, orderBy: { fieldPath: "asc" } });
    if (highRisk) await prisma.classifiedField.update({ where: { id: highRisk.id }, data: { quarantined: true } });
  }

  // Seed near-duplicate pairs (from existing classified fields, across different
  // sources) so the identity-resolution run flags them and the near-duplicate
  // review has content. Idempotent: only when there are none.
  if ((await prisma.duplicatePair.count()) === 0) {
    const fields = await prisma.classifiedField.findMany({ orderBy: { detectedType: "asc" }, take: 400 });
    const byType = new Map<string, typeof fields>();
    for (const f of fields) { const a = byType.get(f.detectedType) ?? []; a.push(f); byType.set(f.detectedType, a); }
    const pairsToMake: { a: string; b: string; score: number; reason: string }[] = [];
    for (const [type, list] of byType) {
      // Pair two fields of the same type from DIFFERENT sources.
      for (let i = 0; i < list.length && pairsToMake.length < 3; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (list[i].sourceId !== list[j].sourceId) {
            const score = pairsToMake.length === 0 ? 96 : pairsToMake.length === 1 ? 88 : 71;
            pairsToMake.push({ a: list[i].id, b: list[j].id, score, reason: `Matched on: ${type} (exact); field name ${score}% similarity` });
            break;
          }
        }
      }
      if (pairsToMake.length >= 3) break;
    }
    for (const p of pairsToMake) {
      await prisma.duplicatePair.create({ data: { fieldAId: p.a, fieldBId: p.b, similarityScore: p.score, matchReason: p.reason, resolution: "unresolved" } });
    }
    console.log(`patch-scenario4: seeded ${pairsToMake.length} duplicate pair(s).`);
  }

  console.log("patch-scenario4: governance + quarantine demo seeded.");
}

main().catch((e) => console.error("patch-scenario4 failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
