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
  // Seed classified fields across the existing sources if the discovery demo
  // data never landed on this DB, so the results/quarantine/duplicate screens
  // have content. Idempotent.
  if ((await prisma.classifiedField.count()) === 0) {
    const sources = await prisma.discoverySource.findMany({ orderBy: { name: "asc" }, take: 8 });
    if (sources.length > 0) {
      const specs = [
        { path: "customers.pan_number", type: "pan", tier: "high", conf: "high", sample: "AB••••1234F", rule: "PAN pattern (5 letters, 4 digits, 1 letter)" },
        { path: "kyc.aadhaar", type: "aadhaar", tier: "high", conf: "high", sample: "••••••••9012", rule: "Aadhaar pattern (12 digits, Verhoeff checksum)" },
        { path: "billing.card_number", type: "financial", tier: "high", conf: "high", sample: "••••••••••••4242", rule: "PAN card (Luhn-valid 16 digits)" },
        { path: "profiles.email", type: "email", tier: "medium", conf: "high", sample: "a•••@example.in", rule: "Email pattern (local@domain)" },
        { path: "profiles.phone", type: "phone", tier: "medium", conf: "high", sample: "+91 ••••• •5512", rule: "E.164 phone pattern" },
        { path: "profiles.full_name", type: "identity", tier: "medium", conf: "needs_review", sample: "A••• N•••", rule: "Name dictionary + column-name heuristic" },
        { path: "contacts.email", type: "email", tier: "medium", conf: "high", sample: "k•••@example.in", rule: "Email pattern (local@domain)" },
        { path: "prefs.country", type: "behavioural", tier: "low", conf: "high", sample: "IN", rule: "ISO country-code enum" },
        { path: "prefs.segment", type: "marketing", tier: "low", conf: "needs_review", sample: "high-value", rule: "Free-text marketing attribute" },
      ];
      for (let i = 0; i < specs.length; i++) {
        const s = specs[i];
        await prisma.classifiedField.create({
          data: { sourceId: sources[i % sources.length].id, fieldPath: s.path, detectedType: s.type, confidence: s.conf, maskedSample: s.sample, sensitivityTier: s.tier, matchedRule: s.rule, reviewState: "pending", quarantined: s.tier === "high" },
        });
      }
      console.log(`patch-scenario4: seeded ${specs.length} classified fields.`);
    }
  }

  // Auto-quarantine every high-risk finding on flag (idempotent). High risk is
  // isolated automatically — never dependent on a manual action.
  await prisma.classifiedField.updateMany({ where: { sensitivityTier: "high", quarantined: false }, data: { quarantined: true } });

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
