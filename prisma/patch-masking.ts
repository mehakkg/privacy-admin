/**
 * Data Protection demo — Meridian Financial Services. Seeds the canonical BASELINE
 * and DPDP field defaults from the appendix reference tables, using the four
 * masking functions (PARTIAL_MASK, FULL_MASK, PATTERN_MASK, EMAIL_MASK) with their
 * real parameters, plus a few demo fields for the tenant-override, ambiguity,
 * self-lock, rule-group and no-rule states.
 *
 * Idempotent: reseeds once when PHONE_NUMBER is absent (a marker for this fixture
 * set), wiping any earlier rows; afterwards it only reconciles locks and the
 * canonical no-rule fields, so demo interactions survive.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const J = (o: unknown) => JSON.stringify(o ?? {});

async function reconcileLocks() {
  await prisma.maskingLayerRule.updateMany({ where: { fieldCode: { in: ["AADHAAR", "PAN", "ABHA_NUMBER"] } }, data: { systemRegulated: true, locked: true } });
  await prisma.maskingLayerRule.updateMany({ where: { layer: { in: ["baseline", "regional"] } }, data: { locked: true } });
  await prisma.maskingLayerRule.updateMany({ where: { fieldCode: "WALLET_ID", layer: "tenant" }, data: { locked: true } });
}

/** The templates the tenant can switch. BASELINE always on; DPDP + RBI associated
 *  by default (as if chosen at onboarding). skipDuplicates so a later admin toggle
 *  is not overwritten on redeploy. */
async function ensureTemplates() {
  await prisma.maskingTemplate.createMany({
    data: [
      { key: "BASELINE", name: "BASELINE", kind: "baseline", associated: true, sortOrder: 0 },
      { key: "DPDP", name: "DPDP", kind: "regional", associated: true, sortOrder: 1 },
      { key: "RBI", name: "RBI", kind: "regional", associated: true, sortOrder: 2 },
    ],
    skipDuplicates: true,
  });
}

/** Two canonical NO-rule fields — kept rule-less on every deploy. */
async function ensureNoRuleFields() {
  const codes = ["MARKETING_TAG", "SUPPORT_NOTE"];
  await prisma.maskingField.createMany({
    data: [
      { code: "MARKETING_TAG", name: "Marketing tag", sensitivity: "Internal", sampleValue: "mtag_5590" },
      { code: "SUPPORT_NOTE", name: "Support note", sensitivity: "Personal", sampleValue: "ticket note text" },
    ],
    skipDuplicates: true,
  });
  await prisma.maskingChannelRule.deleteMany({ where: { fieldCode: { in: codes } } });
  await prisma.maskingLayerRule.deleteMany({ where: { fieldCode: { in: codes } } });
}

/**
 * Idempotent fixtures for the FINAL spec's new states (Override On/Off, approved
 * Visibility Matrix variant, custom template + moved member, a prior approved
 * version for history-based Restore). Runs on EVERY deploy — new demo data must
 * live here, never in the one-time reseed block, so it lands on the live DB.
 */
async function ensureNewStateFixtures() {
  // 1. Override OFF: a DPDP-governed field with a stored tenant rule that is switched
  //    off, so it resolves live to the DPDP value while keeping the stored rule.
  if (!(await prisma.maskingField.findUnique({ where: { code: "MOBILE_WALLET_KYC" } }))) {
    await prisma.maskingField.create({ data: { code: "MOBILE_WALLET_KYC", name: "Mobile wallet KYC ref", sensitivity: "Sensitive", sampleValue: "WKYC-99120034" } });
    await prisma.maskingLayerRule.create({ data: { fieldCode: "MOBILE_WALLET_KYC", layer: "regional", source: "DPDP", family: "partial", paramsJson: J({ showFirst: 0, showLast: 4, maskChar: "*" }), locked: true, citation: "DPDP Act 2023, s.8" } });
    await prisma.maskingLayerRule.create({ data: { fieldCode: "MOBILE_WALLET_KYC", layer: "tenant", family: "full", paramsJson: J({}), active: false } });
  }

  // 2. Approved Visibility Matrix variant on a tenant-governed field (VOTER_ID). It
  //    is approved but NOT live (enforcement_active is false) — still resolves to Default.
  if (await prisma.maskingField.findUnique({ where: { code: "VOTER_ID" } })) {
    await prisma.maskingVisibilityVariant.upsert({
      where: { fieldCode_scopeType_scopeValue: { fieldCode: "VOTER_ID", scopeType: "role", scopeValue: "Grievance Officer" } },
      update: {},
      create: { fieldCode: "VOTER_ID", scopeType: "role", scopeValue: "Grievance Officer", family: "partial", paramsJson: J({ showFirst: 0, showLast: 4, maskChar: "*" }), status: "approved", createdBy: "R. Iyer" },
    });
    // 4. A prior approved version so "Restore earlier version" has history to show.
    const priorVersion = await prisma.maskingChangeRequest.findFirst({ where: { fieldCode: "VOTER_ID", status: "approved", kind: "rule_change" } });
    if (!priorVersion) {
      await prisma.maskingChangeRequest.create({ data: {
        fieldCode: "VOTER_ID", kind: "rule_change", proposedBy: "R. Iyer", proposedAt: new Date("2026-09-10T09:00:00Z"),
        beforeJson: J([{ layer: "tenant", channel: null, family: "partial", params: { showFirst: 0, showLast: 4, maskChar: "*" } }]),
        afterJson: J([{ layer: "tenant", channel: null, family: "full", params: {} }]),
        reason: "Fully mask Voter ID in all surfaces.", status: "approved", decidedBy: "Kavita Menon", decidedAt: new Date("2026-09-11T06:00:00Z"), decisionNote: "Approved.",
      } });
    }
  }

  // 3. A tenant-owned custom template with one moved member (true re-association).
  await prisma.maskingTemplate.upsert({
    where: { key: "CUSTOM_ANALYTICS" },
    update: {},
    create: { key: "CUSTOM_ANALYTICS", name: "Analytics identifiers", kind: "custom", associated: true, sortOrder: 50, createdBy: "R. Iyer" },
  });
  const sess = await prisma.maskingLayerRule.findFirst({ where: { fieldCode: "SESSION_ID", layer: "tenant" } });
  if (sess && !sess.templateKey) await prisma.maskingLayerRule.update({ where: { id: sess.id }, data: { templateKey: "CUSTOM_ANALYTICS" } });

  // 5. Advisory display metadata (field path, primary channel/role, owner team) for
  //    the Rules table columns + Channel/Role/Owner filters. NOT resolution inputs.
  //    Set only where unset, so later edits survive. [path, channel, role, team]
  const advisory: Record<string, [string, string, string, string]> = {
    PHONE_NUMBER: ["profile.phone", "API", "Support", "Operations"],
    EMAIL_ADDRESS: ["profile.email", "API", "Support", "Identity"],
    FULL_NAME: ["profile.full_name", "Portal", "Admin", "Identity"],
    DATE_OF_BIRTH: ["profile.dob", "Portal", "Admin", "Identity"],
    CREDIT_CARD_NUMBER: ["billing.card_no", "API", "Support", "Payments"],
    ACCOUNT_NUMBER: ["accounts.account_no", "API", "Support", "Operations"],
    AADHAAR: ["kyc.aadhaar", "Portal", "Admin", "Compliance"],
    PAN: ["kyc.pan", "Portal", "Admin", "Compliance"],
    ABHA_NUMBER: ["health.abha", "Portal", "Admin", "Compliance"],
    UAN: ["hr.uan", "Portal", "HR", "People Ops"],
    PASSPORT_NUMBER: ["kyc.passport", "Portal", "Admin", "Compliance"],
    VOTER_ID: ["kyc.voter_id", "Portal", "Admin", "Compliance"],
    DRIVING_LICENSE_NUMBER: ["kyc.dl_no", "Portal", "Admin", "Compliance"],
    UPI_ID: ["payments.upi_id", "API", "Support", "Payments"],
    SEGMENT_CODE: ["crm.segment_code", "Web", "Analyst", "Data platform"],
    WALLET_ID: ["payments.wallet_id", "API", "Support", "Payments"],
    SESSION_ID: ["events.session_id", "Web", "Analyst", "Data platform"],
    DEVICE_ID: ["events.device_id", "Web", "Analyst", "Data platform"],
    REFERRER_URL: ["events.referrer_url", "Web", "Analyst", "Data platform"],
    IP_ADDRESS: ["events.ip_address", "Logs", "Security", "Security"],
    USER_AGENT: ["events.user_agent", "Logs", "Security", "Security"],
    GEO_CITY: ["events.geo_city", "Web", "Analyst", "Data platform"],
    EXPERIMENT_ID: ["exp.experiment_id", "Web", "Analyst", "Data platform"],
    ANALYTICS_COHORT: ["analytics.cohort_id", "Web", "Analyst", "Data platform"],
    MARKETING_TAG: ["crm.marketing_tag", "Web", "Analyst", "Marketing"],
    SUPPORT_NOTE: ["support.note", "Portal", "Support", "Support"],
    MOBILE_WALLET_KYC: ["kyc.wallet_ref", "API", "Support", "Payments"],
  };
  for (const [code, [path, channel, role, team]] of Object.entries(advisory)) {
    await prisma.maskingField.updateMany({ where: { code, primaryChannel: null }, data: { primaryChannel: channel, primaryRole: role, ownerTeam: team, dataElementRef: path } });
  }
}

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-masking: no DATABASE_URL, skipping."); return; }
  await ensureTemplates();
  if (await prisma.maskingField.findUnique({ where: { code: "PHONE_NUMBER" } })) {
    await reconcileLocks(); await ensureNoRuleFields(); await ensureNewStateFixtures();
    console.log("patch-masking: canonical fixtures present; ensured templates, locks, no-rule fields + new-state fixtures.");
    return;
  }

  // First run of this fixture set — clear any earlier masking rows.
  await prisma.maskingChannelRule.deleteMany({});
  await prisma.maskingUnmaskException.deleteMany({});
  await prisma.maskingChangeRequest.deleteMany({});
  await prisma.maskingRuleGroup.deleteMany({});
  await prisma.maskingLayerRule.deleteMany({});
  await prisma.maskingField.deleteMany({});

  const FIELDS: { code: string; name: string; sensitivity: string; sampleValue: string }[] = [
    { code: "PHONE_NUMBER", name: "Phone number", sensitivity: "Personal", sampleValue: "9876543210" },
    { code: "EMAIL_ADDRESS", name: "Email address", sensitivity: "Personal", sampleValue: "kabhinav@gmail.com" },
    { code: "FULL_NAME", name: "Full name", sensitivity: "Personal", sampleValue: "Rajesh Kumar" },
    { code: "DATE_OF_BIRTH", name: "Date of birth", sensitivity: "Personal", sampleValue: "1990-05-15" },
    { code: "CREDIT_CARD_NUMBER", name: "Credit card number", sensitivity: "Sensitive", sampleValue: "4532015112830366" },
    { code: "ACCOUNT_NUMBER", name: "Account number", sensitivity: "Sensitive", sampleValue: "1234567890123456" },
    { code: "AADHAAR", name: "Aadhaar number", sensitivity: "Sensitive", sampleValue: "123456789012" },
    { code: "PAN", name: "PAN", sensitivity: "Sensitive", sampleValue: "ABCDE1234F" },
    { code: "ABHA_NUMBER", name: "ABHA number", sensitivity: "Sensitive", sampleValue: "12345678901234" },
    { code: "UAN", name: "UAN", sensitivity: "Sensitive", sampleValue: "123456789012" },
    { code: "PASSPORT_NUMBER", name: "Passport number", sensitivity: "Sensitive", sampleValue: "M1234567" },
    { code: "VOTER_ID", name: "Voter ID", sensitivity: "Sensitive", sampleValue: "ABC1234567" },
    { code: "DRIVING_LICENSE_NUMBER", name: "Driving license number", sensitivity: "Sensitive", sampleValue: "DL1420110012345" },
    { code: "UPI_ID", name: "UPI ID", sensitivity: "Personal", sampleValue: "9876543210@okaxis" },
    // Demo states
    { code: "SEGMENT_CODE", name: "Customer segment code", sensitivity: "Internal", sampleValue: "SEG-A12" },
    { code: "WALLET_ID", name: "Wallet identifier", sensitivity: "Personal", sampleValue: "W-771203", },
    { code: "SESSION_ID", name: "Session identifier", sensitivity: "Personal", sampleValue: "sess_8842abF1" },
    { code: "DEVICE_ID", name: "Device identifier", sensitivity: "Personal", sampleValue: "dev_00A1B2C3" },
    { code: "REFERRER_URL", name: "Referrer URL", sensitivity: "Internal", sampleValue: "https://ref.example/x" },
    { code: "IP_ADDRESS", name: "IP address", sensitivity: "Personal", sampleValue: "10.24.9.7" },
    { code: "USER_AGENT", name: "User agent", sensitivity: "Internal", sampleValue: "Mozilla-5-0" },
    { code: "GEO_CITY", name: "Geo city", sensitivity: "Internal", sampleValue: "Bengaluru" },
    { code: "EXPERIMENT_ID", name: "Experiment identifier", sensitivity: "Internal", sampleValue: "exp_4417" },
    { code: "ANALYTICS_COHORT", name: "Analytics cohort", sensitivity: "Internal", sampleValue: "cohort_A9" },
  ];
  for (const f of FIELDS) await prisma.maskingField.create({ data: f });

  const layer = (fieldCode: string, layer: string, family: string, params: unknown, opts: { source?: string; citation?: string; locked?: boolean; systemRegulated?: boolean } = {}) =>
    prisma.maskingLayerRule.create({ data: { fieldCode, layer, family, paramsJson: J(params), source: opts.source ?? null, citation: opts.citation ?? null, locked: opts.locked ?? false, systemRegulated: opts.systemRegulated ?? false } });

  // BASELINE defaults.
  const B = { locked: true };
  await layer("PHONE_NUMBER", "baseline", "partial", { showFirst: 0, showLast: 4, maskChar: "*" }, B);
  await layer("EMAIL_ADDRESS", "baseline", "email", { localVisibleChars: 2, localVisibleLastChars: 2, domainMode: "PRESERVE", maskChar: "*" }, B);
  await layer("FULL_NAME", "baseline", "partial", { showFirst: 2, showLast: 2, maskChar: "*" }, B);
  await layer("DATE_OF_BIRTH", "baseline", "pattern", { template: "0000-00-00" }, B);
  await layer("CREDIT_CARD_NUMBER", "baseline", "pattern", { template: "****-****-****-####" }, B);
  await layer("ACCOUNT_NUMBER", "baseline", "partial", { showFirst: 0, showLast: 4, maskChar: "*" }, B);

  // DPDP defaults (regional).
  const D = (extra: object = {}) => ({ source: "DPDP", locked: true, ...extra });
  await layer("AADHAAR", "regional", "pattern", { template: "xxxx-xxxx-####" }, D({ systemRegulated: true, citation: "DPDP Act 2023 · Aadhaar Act 2016, s.29" }));
  await layer("PAN", "regional", "partial", { showFirst: 3, showLast: 2, maskChar: "*" }, D({ systemRegulated: true, citation: "Income-tax Act · RBI KYC" }));
  await layer("ABHA_NUMBER", "regional", "pattern", { template: "xx-xxxx-xxxx-xxxx" }, D({ systemRegulated: true, citation: "ABDM · DPDP Act 2023" }));
  await layer("UAN", "regional", "partial", { showFirst: 0, showLast: 4, maskChar: "*" }, D({ citation: "EPFO" }));
  await layer("PASSPORT_NUMBER", "regional", "partial", { showFirst: 0, showLast: 4, maskChar: "*" }, D());
  await layer("VOTER_ID", "regional", "partial", { showFirst: 0, showLast: 4, maskChar: "*" }, D());
  await layer("DRIVING_LICENSE_NUMBER", "regional", "partial", { showFirst: 0, showLast: 4, maskChar: "*" }, D());
  await layer("UPI_ID", "regional", "email", { localVisibleChars: 2, localVisibleLastChars: 2, domainMode: "PRESERVE", maskChar: "*" }, D({ citation: "DPDP Act 2023, s.8" }));

  // Demo — tenant override wins over the DPDP VOTER_ID floor.
  await layer("VOTER_ID", "tenant", "full", {});
  // Ambiguity — DPDP + RBI both claim SEGMENT_CODE, no tenant tie-breaker.
  await layer("SEGMENT_CODE", "regional", "partial", { showLast: 2, maskChar: "*" }, { source: "DPDP" });
  await layer("SEGMENT_CODE", "regional", "full", {}, { source: "RBI" });
  // Self-locked tenant field.
  await layer("WALLET_ID", "tenant", "partial", { showFirst: 0, showLast: 4, maskChar: "*" }, { locked: true });

  // Rule group A — partial last-4 across 6 analytics fields (in_sync).
  const groupA = ["SESSION_ID", "DEVICE_ID", "REFERRER_URL", "IP_ADDRESS", "USER_AGENT", "GEO_CITY"];
  for (const c of groupA) await layer(c, "tenant", "partial", { showFirst: 0, showLast: 4, maskChar: "*" });
  await prisma.maskingRuleGroup.create({ data: { name: "Analytics identifiers — last 4", family: "partial", paramsJson: J({ showFirst: 0, showLast: 4, maskChar: "*" }), memberCodesJson: J(groupA), createdBy: "R. Iyer" } });

  // Rule group B — full mask, with one diverged member.
  await layer("EXPERIMENT_ID", "tenant", "full", {});
  await layer("ANALYTICS_COHORT", "tenant", "partial", { showFirst: 0, showLast: 4, maskChar: "*" }); // diverged from group's "full"
  await prisma.maskingRuleGroup.create({ data: { name: "Experiment fields — full mask", family: "full", paramsJson: J({}), memberCodesJson: J(["EXPERIMENT_ID", "ANALYTICS_COHORT"]), createdBy: "R. Iyer" } });

  // Pending change on ACCOUNT_NUMBER: propose a tenant full mask (awaiting DPO).
  await prisma.maskingChangeRequest.create({
    data: {
      fieldCode: "ACCOUNT_NUMBER", kind: "rule_change", proposedBy: "R. Iyer", proposedAt: new Date("2026-09-27T05:39:00Z"),
      beforeJson: J([{ layer: "tenant", channel: null, family: "reveal", params: {} }]),
      afterJson: J([{ layer: "tenant", channel: null, family: "full", params: {} }]),
      reason: "Collections exports of full account numbers must be fully masked, not last-4.", status: "pending",
    },
  });

  await ensureNoRuleFields();
  await ensureNewStateFixtures();
  console.log(`patch-masking: seeded ${FIELDS.length} fields (BASELINE + DPDP + demo), 2 rule groups, 1 pending change, new-state fixtures.`);
}

main().catch((e) => console.error("patch-masking failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
