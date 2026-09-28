/**
 * Dynamic Data Masking demo — Meridian Financial Services (NBFC), templates DPDP
 * + RBI. Idempotent: seeds only when the layered model is empty (MaskingLayerRule
 * count 0), first WIPING any rows left from the pre-redesign model so the natural
 * key (code) can be re-created cleanly. On later runs it only reconciles the
 * governed locks, so demo interactions survive.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const J = (o: unknown) => JSON.stringify(o ?? {});

async function reconcileLocks() {
  // Baseline and regional rules are governed — always locked. Nothing in the UI
  // can unlock them; this restores the invariant if data drifted.
  await prisma.maskingLayerRule.updateMany({ where: { layer: { in: ["baseline", "regional"] } }, data: { locked: true } });
  await prisma.maskingLayerRule.updateMany({ where: { layer: "tenant" }, data: { locked: false } });
}

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-masking: no DATABASE_URL, skipping."); return; }
  if ((await prisma.maskingLayerRule.count()) > 0) { await reconcileLocks(); console.log("patch-masking: already seeded; reconciled locks."); return; }

  // Clear anything from the old model so `code` (now the PK) is free.
  await prisma.maskingChannelRule.deleteMany({});
  await prisma.maskingUnmaskException.deleteMany({});
  await prisma.maskingChangeRequest.deleteMany({});
  await prisma.maskingLayerRule.deleteMany({});
  await prisma.maskingField.deleteMany({});

  const FIELDS = [
    { code: "AADHAAR", name: "Aadhaar number", sensitivity: "Sensitive", sampleValue: "234512347890" },
    { code: "PAN", name: "PAN", sensitivity: "Sensitive", sampleValue: "ABCDE1234F" },
    { code: "LOAN_ACCOUNT_NUMBER", name: "Loan account number", sensitivity: "Sensitive", sampleValue: "4002119988" },
    { code: "MOBILE_NUMBER", name: "Mobile number", sensitivity: "Personal", sampleValue: "9876543210" },
    { code: "EMAIL", name: "Email address", sensitivity: "Personal", sampleValue: "ritu@meridian.in" },
    { code: "WALLET_ID", name: "Wallet identifier", sensitivity: "Personal", sampleValue: "W-771203", createdBy: "R. Iyer" },
    { code: "DATE_OF_BIRTH", name: "Date of birth", sensitivity: "Personal", sampleValue: "1991-04-12" },
    { code: "SEGMENT_CODE", name: "Customer segment code", sensitivity: "Internal", sampleValue: "SEG-A12" },
  ];
  for (const f of FIELDS) await prisma.maskingField.create({ data: f });

  const layer = (fieldCode: string, layer: string, family: string, params: unknown, opts: { source?: string; citation?: string; locked?: boolean } = {}) =>
    prisma.maskingLayerRule.create({ data: { fieldCode, layer, family, paramsJson: J(params), source: opts.source ?? null, citation: opts.citation ?? null, locked: opts.locked ?? false } });
  const chan = (fieldCode: string, layer: string, channel: string, family: string, params: unknown = {}) =>
    prisma.maskingChannelRule.create({ data: { fieldCode, layer, channel, family, paramsJson: J(params) } });

  // AADHAAR — baseline, system-regulated.
  await layer("AADHAAR", "baseline", "partial", { revealLast: 4, maskChar: "*" }, { locked: true, citation: "Aadhaar Act 2016, s.29 r/w DPDP Act 2023, s.8(5)" });

  // PAN — RBI floor (reveals 6) beaten by a stricter tenant rule (reveals 4), with tenant channel overrides.
  await layer("PAN", "regional", "partial", { revealLast: 6, maskChar: "*" }, { source: "RBI", locked: true, citation: "RBI Master Direction — KYC" });
  await layer("PAN", "tenant", "partial", { revealLast: 4, maskChar: "*" });
  await chan("PAN", "tenant", "api", "tokenize", { vault: "default" });
  await chan("PAN", "tenant", "exports", "full", {});
  await chan("PAN", "tenant", "logs", "full", {});
  await chan("PAN", "tenant", "nonprod", "synthetic", { generator: "pan" });

  // LOAN_ACCOUNT_NUMBER — RBI-governed, with a pending change on the exports channel.
  await layer("LOAN_ACCOUNT_NUMBER", "regional", "tokenize", { vault: "default" }, { source: "RBI", locked: true, citation: "RBI Master Direction — KYC" });
  await chan("LOAN_ACCOUNT_NUMBER", "regional", "logs", "full", {});
  await chan("LOAN_ACCOUNT_NUMBER", "regional", "nonprod", "synthetic", { generator: "account" });

  // MOBILE_NUMBER — DPDP.
  await layer("MOBILE_NUMBER", "regional", "partial", { revealLast: 3, maskChar: "*" }, { source: "DPDP", locked: true, citation: "DPDP Act 2023, s.8 (data minimisation)" });

  // EMAIL — DPDP, with a logs override.
  await layer("EMAIL", "regional", "partial", { revealFirst: 1, preserveDomain: true, maskChar: "*" }, { source: "DPDP", locked: true, citation: "DPDP Act 2023, s.8 (data minimisation)" });
  await chan("EMAIL", "regional", "logs", "full", {});

  // Tenant-owned fields.
  await layer("WALLET_ID", "tenant", "hash", { algorithm: "SHA-256" });
  await layer("DATE_OF_BIRTH", "tenant", "generalize", { bucket: "age5" });
  // SEGMENT_CODE — no rule at any layer.

  // Pending change request on LOAN: exports tokenize → full redaction.
  await prisma.maskingChangeRequest.create({
    data: {
      fieldCode: "LOAN_ACCOUNT_NUMBER", kind: "rule_change", proposedBy: "R. Iyer",
      proposedAt: new Date("2026-09-28T05:39:00Z"),
      beforeJson: J([{ layer: "regional", channel: "exports", family: "tokenize", params: { vault: "default" } }]),
      afterJson: J([{ layer: "regional", channel: "exports", family: "full", params: {} }]),
      reason: "Collections agency exports should never carry a recoverable token.",
      status: "pending",
    },
  });

  // Standing approved unmask exception on PAN.
  await prisma.maskingUnmaskException.create({
    data: { fieldCode: "PAN", role: "Grievance Officer", purpose: "identity check on active grievance", durationMinutes: 15, expiresAt: new Date("2030-01-01T00:00:00Z"), createdBy: "R. Iyer", approvedBy: "Kavita Menon" },
  });

  console.log(`patch-masking: seeded ${FIELDS.length} fields, layered rules, 1 pending change, 1 exception.`);
}

main().catch((e) => console.error("patch-masking failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
