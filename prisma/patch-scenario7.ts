/**
 * Scenario 6 (protection rules + entity) demo — idempotent. Seeds a CISO rule
 * with an implemented scope and a pending exception (Screens 1–3), an acquired
 * entity with imported users, and a user whose existing entity mapping will make
 * a bulk map conflict (Screen 6).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-scenario7: no DATABASE_URL, skipping."); return; }

  // 1) Protection rule + scope + a pending exception.
  if ((await prisma.protectionRuleException.count()) === 0) {
    let rule = await prisma.protectionRule.findFirst({ where: { dataCategory: "kyc" } }) ?? await prisma.protectionRule.findFirst();
    if (!rule) {
      rule = await prisma.protectionRule.create({ data: { ruleName: "KYC Field Masking", dataCategory: "kyc", ruleType: "mask", strictness: "high", scope: "", definition: "KYC identifiers must be masked at rest and in all non-privileged reads.", approvedBy: "A. Khan (CISO)", approvedAt: new Date() } });
    }
    const systems = await prisma.connectedSystem.findMany({ take: 3, select: { id: true } });
    if (systems.length > 0) {
      await prisma.protectionRuleScope.upsert({ where: { ruleId: rule.id }, update: {}, create: { ruleId: rule.id, systemsJson: JSON.stringify(systems.map((s) => s.id)), updatedBy: "R. Iyer (Admin)" } });
    }
    await prisma.protectionRuleException.create({
      data: { ruleId: rule.id, process: "Nightly fraud-analytics batch on the reporting replica", narrowedScope: "Exclude the analytics replica from KYC masking", status: "requested", blockingClause: "KYC masking applied to the reporting replica", resolution: "pending" },
    });
    console.log("patch-scenario7: seeded protection rule + pending exception.");
  }

  // 2) Acquisition entity + imported users, and a conflicting native mapping.
  if ((await prisma.entity.count({ where: { source: "acquired" } })) === 0) {
    const nativeEntity = await prisma.entity.findFirst({ where: { source: "native" } }) ?? await prisma.entity.findFirst();
    const acquired = await prisma.entity.create({ data: { name: "Northgate Lending (acquired)", kind: "legal_entity", source: "acquired", importStatus: "bulk_imported", sdfStatus: "not_assessed" } });
    for (const u of ["Aarti Nair", "Rohan Mehta", "Sana Kapoor"]) {
      await prisma.entityUserMapping.create({ data: { userName: u, entityId: acquired.id, accessScope: "single", validatedNoDualScope: true } });
    }
    // Priya already belongs to the native entity → mapping her to the acquired
    // entity in bulk must be flagged, not silently reassigned.
    if (nativeEntity) {
      const existing = await prisma.entityUserMapping.findFirst({ where: { userName: "Priya Sharma" } });
      if (!existing) await prisma.entityUserMapping.create({ data: { userName: "Priya Sharma", entityId: nativeEntity.id, accessScope: "single", validatedNoDualScope: true } });
    }
    console.log("patch-scenario7: seeded acquired entity + users + conflict.");
  }

  console.log("patch-scenario7: done.");
}

main().catch((e) => console.error("patch-scenario7 failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
