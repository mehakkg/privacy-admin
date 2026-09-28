/**
 * Dynamic Data Masking demo — idempotent. Seeds four templates (BASELINE, two
 * associated regional templates DPDP + RBI, and the tenant layer) and a set of
 * fields whose rules produce every state the console must demonstrate:
 *
 *   EMAIL              → resolves via BASELINE only
 *   MOBILE_NUMBER      → resolves via a regional template (DPDP beats BASELINE)
 *   PAN                → resolves via the tenant's own rule (beats DPDP + BASELINE)
 *   SEGMENT_CODE       → genuine ambiguity (DPDP + RBI tie, no tenant tie-breaker)
 *   AADHAAR            → system-regulated lock (SUPER_ADMIN, permanent)
 *   LOAN_ACCOUNT_NUMBER→ tenant self-locked (reversible)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-masking: no DATABASE_URL, skipping."); return; }
  if ((await prisma.maskingTemplate.count()) > 0) { console.log("patch-masking: already seeded, skipping."); return; }

  const [baseline, dpdp, rbi, tenant] = await Promise.all([
    prisma.maskingTemplate.create({ data: { key: "BASELINE", name: "BASELINE", tier: "baseline", precedence: 0, associated: true, ownedBy: "SUPER_ADMIN" } }),
    prisma.maskingTemplate.create({ data: { key: "DPDP", name: "DPDP", tier: "regional", precedence: 10, associated: true, ownedBy: "SUPER_ADMIN" } }),
    prisma.maskingTemplate.create({ data: { key: "RBI", name: "RBI", tier: "regional", precedence: 10, associated: true, ownedBy: "SUPER_ADMIN" } }),
    prisma.maskingTemplate.create({ data: { key: "TENANT", name: "Tenant Rule", tier: "tenant", precedence: 20, associated: true, ownedBy: "TENANT" } }),
  ]);

  const FIELDS = [
    { code: "EMAIL", name: "Email address", sampleValue: "john.roy@acme.com" },
    { code: "MOBILE_NUMBER", name: "Mobile number", sampleValue: "9876543210" },
    { code: "PAN", name: "PAN", sampleValue: "ABCDE1234F" },
    { code: "SEGMENT_CODE", name: "Customer segment code", sampleValue: "SGMT-0007" },
    { code: "AADHAAR", name: "Aadhaar number", sampleValue: "234512347890" },
    { code: "LOAN_ACCOUNT_NUMBER", name: "Loan account number", sampleValue: "000123456789" },
  ];
  for (const f of FIELDS) await prisma.maskingField.create({ data: f });

  const rule = (templateId: string, fieldCode: string, fieldName: string, method: string, extra: Record<string, unknown> = {}) =>
    prisma.maskingRule.create({ data: { templateId, fieldCode, fieldName, method, ...extra } });

  await Promise.all([
    // EMAIL — BASELINE only.
    rule(baseline.id, "EMAIL", "Email address", "email"),

    // MOBILE_NUMBER — BASELINE (loses) vs DPDP (wins).
    rule(baseline.id, "MOBILE_NUMBER", "Mobile number", "first2last2"),
    rule(dpdp.id, "MOBILE_NUMBER", "Mobile number", "last4", { statutoryCitation: "DPDP Act 2023, s.8 (data minimisation)" }),

    // PAN — BASELINE + DPDP (lose) vs TENANT own rule (wins, editable).
    rule(baseline.id, "PAN", "PAN", "last4x"),
    rule(dpdp.id, "PAN", "PAN", "alpha_x", { statutoryCitation: "DPDP Act 2023, s.8 (data minimisation)" }),
    rule(tenant.id, "PAN", "PAN", "alpha_x", { editable: true }),

    // SEGMENT_CODE — DPDP + RBI both claim it, no tenant rule → ambiguity.
    rule(dpdp.id, "SEGMENT_CODE", "Customer segment code", "last4"),
    rule(rbi.id, "SEGMENT_CODE", "Customer segment code", "fullmask"),

    // AADHAAR — system-regulated floor, permanent lock, no unlock.
    rule(baseline.id, "AADHAAR", "Aadhaar number", "last4", {
      regulated: true, lockType: "system_regulated", editable: false,
      statutoryCitation: "Aadhaar Act 2016, s.29 r/w DPDP Act 2023, s.8(5)",
    }),

    // LOAN_ACCOUNT_NUMBER — tenant's own, self-locked (reversible).
    rule(tenant.id, "LOAN_ACCOUNT_NUMBER", "Loan account number", "last4", {
      editable: true, regulated: true, lockType: "self_locked",
      lockedBy: "Risk Ops (your team)", lockedAt: new Date("2026-03-12"),
    }),
  ]);

  console.log("patch-masking: seeded 4 templates, 6 fields, 10 rules.");
}

main().catch((e) => console.error("patch-masking failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
