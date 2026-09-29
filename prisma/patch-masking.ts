/**
 * Data Protection demo — Meridian Financial Services. Idempotent: seeds only when
 * the layered model is empty, first WIPING any pre-redesign rows. On later runs it
 * reconciles the governed/system-regulated locks so demo interactions survive.
 *
 * Fixtures cover: AADHAAR (DPDP SYSTEM-regulated, xxxx-xxxx-9012), PAN (BASELINE
 * SYSTEM-regulated), MOBILE/EMAIL/LOAN (DPDP/RBI governed), PIN_CODE (tenant
 * override wins), SEGMENT_CODE (DPDP+RBI ambiguity), WALLET_ID (tenant self-lock),
 * DATE_OF_BIRTH (tenant editable), plus two rule groups (one in_sync of 6, one
 * diverged). Tiles reconcile: baseline+regional+tenant+attention === fields.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const J = (o: unknown) => JSON.stringify(o ?? {});

async function reconcileLocks() {
  await prisma.maskingLayerRule.updateMany({ where: { fieldCode: { in: ["AADHAAR", "PAN"] } }, data: { systemRegulated: true, locked: true } });
  await prisma.maskingLayerRule.updateMany({ where: { layer: "regional", fieldCode: { notIn: ["AADHAAR"] } }, data: { locked: true } });
  await prisma.maskingLayerRule.updateMany({ where: { fieldCode: "WALLET_ID", layer: "tenant" }, data: { locked: true } });
}

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-masking: no DATABASE_URL, skipping."); return; }
  // Guard on rule groups (a new-model marker): if present, the layered+groups
  // fixtures are already seeded, so only reconcile locks. Otherwise wipe any
  // pre-groups rows and seed the full fixture set once.
  if ((await prisma.maskingRuleGroup.count()) > 0) { await reconcileLocks(); console.log("patch-masking: already seeded; reconciled locks."); return; }

  await prisma.maskingChannelRule.deleteMany({});
  await prisma.maskingUnmaskException.deleteMany({});
  await prisma.maskingChangeRequest.deleteMany({});
  await prisma.maskingRuleGroup.deleteMany({});
  await prisma.maskingLayerRule.deleteMany({});
  await prisma.maskingField.deleteMany({});

  const FIELDS = [
    { code: "AADHAAR", name: "Aadhaar number", sensitivity: "Sensitive", sampleValue: "2345-1234-9012" },
    { code: "PAN", name: "PAN", sensitivity: "Sensitive", sampleValue: "ABCDE1234F" },
    { code: "MOBILE_NUMBER", name: "Mobile number", sensitivity: "Personal", sampleValue: "9876543210" },
    { code: "EMAIL", name: "Email address", sensitivity: "Personal", sampleValue: "ritu@meridian.in" },
    { code: "LOAN_ACCOUNT_NUMBER", name: "Loan account number", sensitivity: "Sensitive", sampleValue: "4002119988" },
    { code: "PIN_CODE", name: "PIN code", sensitivity: "Personal", sampleValue: "560001" },
    { code: "SEGMENT_CODE", name: "Customer segment code", sensitivity: "Internal", sampleValue: "SEG-A12" },
    { code: "WALLET_ID", name: "Wallet identifier", sensitivity: "Personal", sampleValue: "W-771203", createdBy: "R. Iyer" },
    { code: "DATE_OF_BIRTH", name: "Date of birth", sensitivity: "Personal", sampleValue: "1991-04-12" },
    { code: "SESSION_ID", name: "Session identifier", sensitivity: "Personal", sampleValue: "sess_8842abF1" },
    { code: "DEVICE_ID", name: "Device identifier", sensitivity: "Personal", sampleValue: "dev_00A1B2C3" },
    { code: "REFERRER_URL", name: "Referrer URL", sensitivity: "Internal", sampleValue: "https://ref.example/x" },
    { code: "IP_ADDRESS", name: "IP address", sensitivity: "Personal", sampleValue: "10.24.9.7" },
    { code: "USER_AGENT", name: "User agent", sensitivity: "Internal", sampleValue: "Mozilla/5.0" },
    { code: "GEO_CITY", name: "Geo city", sensitivity: "Internal", sampleValue: "Bengaluru" },
    { code: "EXPERIMENT_ID", name: "Experiment identifier", sensitivity: "Internal", sampleValue: "exp_4417" },
    { code: "ANALYTICS_COHORT", name: "Analytics cohort", sensitivity: "Internal", sampleValue: "cohort_A9" },
  ];
  for (const f of FIELDS) await prisma.maskingField.create({ data: f });

  const layer = (fieldCode: string, layer: string, family: string, params: unknown, opts: { source?: string; citation?: string; locked?: boolean; systemRegulated?: boolean } = {}) =>
    prisma.maskingLayerRule.create({ data: { fieldCode, layer, family, paramsJson: J(params), source: opts.source ?? null, citation: opts.citation ?? null, locked: opts.locked ?? false, systemRegulated: opts.systemRegulated ?? false } });
  const chan = (fieldCode: string, layer: string, channel: string, family: string, params: unknown = {}) =>
    prisma.maskingChannelRule.create({ data: { fieldCode, layer, channel, family, paramsJson: J(params) } });

  // AADHAAR — DPDP, SYSTEM-regulated (permanent floor). xxxx-xxxx-9012.
  await layer("AADHAAR", "regional", "partial", { revealLast: 4, maskChar: "x" }, { source: "DPDP", systemRegulated: true, locked: true, citation: "DPDP Act 2023 · Aadhaar Act 2016, s.29" });
  // PAN — BASELINE, SYSTEM-regulated.
  await layer("PAN", "baseline", "partial", { revealLast: 4, maskChar: "*" }, { systemRegulated: true, locked: true, citation: "Income-tax Act · RBI KYC" });
  // MOBILE / EMAIL — DPDP governed (proposals allowed).
  await layer("MOBILE_NUMBER", "regional", "partial", { revealLast: 3, maskChar: "*" }, { source: "DPDP", locked: true, citation: "DPDP Act 2023, s.8 (data minimisation)" });
  await layer("EMAIL", "regional", "partial", { revealFirst: 1, preserveDomain: true, maskChar: "*" }, { source: "DPDP", locked: true, citation: "DPDP Act 2023, s.8 (data minimisation)" });
  await chan("EMAIL", "regional", "logs", "full", {});
  // LOAN — RBI governed + overrides + pending change.
  await layer("LOAN_ACCOUNT_NUMBER", "regional", "tokenize", { vault: "default" }, { source: "RBI", locked: true, citation: "RBI Master Direction — KYC" });
  await chan("LOAN_ACCOUNT_NUMBER", "regional", "logs", "full", {});
  await chan("LOAN_ACCOUNT_NUMBER", "regional", "nonprod", "synthetic", { generator: "account" });
  // PIN_CODE — DPDP floor beaten by a stricter tenant rule (tenant-override win).
  await layer("PIN_CODE", "regional", "partial", { revealLast: 2, maskChar: "*" }, { source: "DPDP", locked: true, citation: "DPDP Act 2023, s.8" });
  await layer("PIN_CODE", "tenant", "full", {});
  // SEGMENT_CODE — DPDP + RBI both claim it → ambiguity, no tenant tie-breaker.
  await layer("SEGMENT_CODE", "regional", "partial", { revealLast: 2, maskChar: "*" }, { source: "DPDP" });
  await layer("SEGMENT_CODE", "regional", "full", {}, { source: "RBI" });
  // WALLET_ID — tenant self-locked; DATE_OF_BIRTH — tenant editable.
  await layer("WALLET_ID", "tenant", "hash", { algorithm: "SHA-256" }, { locked: true });
  await layer("DATE_OF_BIRTH", "tenant", "generalize", { bucket: "age5" });

  // Rule group A — Analytics identifiers → hash (in_sync, 6 members).
  const groupAMembers = ["SESSION_ID", "DEVICE_ID", "REFERRER_URL", "IP_ADDRESS", "USER_AGENT", "GEO_CITY"];
  for (const c of groupAMembers) await layer(c, "tenant", "hash", { algorithm: "SHA-256" });
  await prisma.maskingRuleGroup.create({ data: { name: "Analytics identifiers — hash", family: "hash", paramsJson: J({ algorithm: "SHA-256" }), memberCodesJson: J(groupAMembers), createdBy: "R. Iyer" } });

  // Rule group B — Experiment fields → full redaction, with one diverged member.
  await layer("EXPERIMENT_ID", "tenant", "full", {});
  await layer("ANALYTICS_COHORT", "tenant", "hash", { algorithm: "SHA-256" }); // diverged from the group's "full"
  await prisma.maskingRuleGroup.create({ data: { name: "Experiment fields — full redaction", family: "full", paramsJson: J({}), memberCodesJson: J(["EXPERIMENT_ID", "ANALYTICS_COHORT"]), createdBy: "R. Iyer" } });

  // Pending change on LOAN: exports tokenize → full.
  await prisma.maskingChangeRequest.create({
    data: {
      fieldCode: "LOAN_ACCOUNT_NUMBER", kind: "rule_change", proposedBy: "R. Iyer", proposedAt: new Date("2026-09-26T05:39:00Z"),
      beforeJson: J([{ layer: "regional", channel: "exports", family: "tokenize", params: { vault: "default" } }]),
      afterJson: J([{ layer: "regional", channel: "exports", family: "full", params: {} }]),
      reason: "Collections agency exports should never carry a recoverable token.", status: "pending",
    },
  });

  console.log(`patch-masking: seeded ${FIELDS.length} fields, layered rules, 2 rule groups, 1 pending change.`);
}

main().catch((e) => console.error("patch-masking failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
