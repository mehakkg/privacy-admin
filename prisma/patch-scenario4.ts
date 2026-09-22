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

  const existing = await prisma.discoveryGovernance.findUnique({ where: { id: "singleton" } });
  if (existing && existing.cisoApprovedFieldsJson !== "[]") { console.log("patch-scenario4: governance already seeded, skipping."); return; }

  await prisma.discoveryGovernance.upsert({
    where: { id: "singleton" },
    update: { identityMatchThreshold: 92, cisoApprovedFieldsJson: JSON.stringify(CISO_APPROVED) },
    create: { id: "singleton", identityMatchThreshold: 92, cisoApprovedFieldsJson: JSON.stringify(CISO_APPROVED) },
  });

  // Quarantine one high-risk finding (if the discovery demo has one) so the gate
  // screen is demonstrable.
  const highRisk = await prisma.classifiedField.findFirst({ where: { sensitivityTier: "high", quarantined: false }, orderBy: { fieldPath: "asc" } });
  if (highRisk) await prisma.classifiedField.update({ where: { id: highRisk.id }, data: { quarantined: true } });

  console.log("patch-scenario4: governance + quarantine demo seeded.");
}

main().catch((e) => console.error("patch-scenario4 failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
