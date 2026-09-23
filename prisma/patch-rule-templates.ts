/**
 * Protection Rule Library templates — idempotent. Seeds the Baseline PII and
 * DPDP-Specific tiers (Custom has no templates — it's compose-from-scratch).
 * DPDP-Specific templates carry a statutory citation; Baseline PII do not.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEMPLATES = [
  // Baseline PII (no citation)
  { tier: "baseline_pii", name: "PAN / KYC masking", piiCategory: "kyc", defaultMethod: "masking", suggestedScope: "All customer-facing views", strictness: "high", definition: "Mask KYC identifiers (PAN, Aadhaar) in all non-privileged reads.", statutoryCitation: null, sortOrder: 1 },
  { tier: "baseline_pii", name: "Contact data encryption", piiCategory: "contact", defaultMethod: "encryption", suggestedScope: "All systems, at rest", strictness: "high", definition: "Encrypt phone and email at rest across all connected systems.", statutoryCitation: null, sortOrder: 2 },
  { tier: "baseline_pii", name: "Financial data tokenization", piiCategory: "financial", defaultMethod: "tokenization", suggestedScope: "Payment & billing systems", strictness: "high", definition: "Tokenize card and account numbers so raw values never persist.", statutoryCitation: null, sortOrder: 3 },
  // DPDP-Specific (with citation)
  { tier: "dpdp_specific", name: "Children's data restriction", piiCategory: "identity", defaultMethod: "masking", suggestedScope: "Records flagged as minor", strictness: "high", definition: "Restrict and mask personal data of data principals under 18, with no behavioural tracking.", statutoryCitation: "DPDP Act 2023, s.9 (children's data)", sortOrder: 1 },
  { tier: "dpdp_specific", name: "Breach-scope encryption", piiCategory: "kyc", defaultMethod: "encryption", suggestedScope: "Systems within a breach's scope", strictness: "high", definition: "Encrypt personal data in systems within an active breach's scope, as a technical safeguard.", statutoryCitation: "DPDP Act 2023, s.8(5) (reasonable security safeguards)", sortOrder: 2 },
  { tier: "dpdp_specific", name: "Post-retention DLP", piiCategory: "behavioural", defaultMethod: "tokenization", suggestedScope: "Stores past their retention window", strictness: "medium", definition: "Prevent egress of personal data held past its purpose's retention period.", statutoryCitation: "DPDP Rules 2025, Rule 8 (erasure on expiry)", sortOrder: 3 },
];

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-rule-templates: no DATABASE_URL, skipping."); return; }
  if ((await prisma.protectionRuleTemplate.count()) > 0) { console.log("patch-rule-templates: templates already seeded, skipping."); return; }
  for (const t of TEMPLATES) await prisma.protectionRuleTemplate.create({ data: t });
  console.log(`patch-rule-templates: seeded ${TEMPLATES.length} templates.`);
}

main().catch((e) => console.error("patch-rule-templates failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
