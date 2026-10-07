/**
 * Masking Policy (DDM Console) demo — Meridian Financial Services. Seeds the
 * category catalog, fields (ready / needs-decision / not-used / regulated /
 * custom), and three versions: v1 archived, v2 active, v3 draft (based on v2)
 * with a mix of looser/tighter/neutral changes, four audiences, two channels and
 * mixed grants (same / more / full raw / channel-scoped), plus needs-attention.
 *
 * Idempotent: seeds once when no MPPolicyVersion exists.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const J = (o: unknown) => JSON.stringify(o ?? null);

// masking presets (all made-up sample values; never real customer data)
const hidden = null;
const last = (n: number) => ({ family: "partial", params: { showFirst: 0, showLast: n, maskChar: "*" } });
const firstlast = (a: number, b: number) => ({ family: "partial", params: { showFirst: a, showLast: b, maskChar: "*" } });
const email = (a: number, b: number) => ({ family: "email", params: { localVisibleChars: a, localVisibleLastChars: b, domainMode: "PRESERVE" } });
const pattern = (t: string) => ({ family: "pattern", params: { template: t } });

const CATEGORIES = [
  { id: "personal", name: "Personal Information", definition: "Details that identify a person on their own, like a name or date of birth.", sortOrder: 0 },
  { id: "contact", name: "Contact & Digital Identifiers", definition: "Ways to reach or recognise someone, like an email address or mobile number.", sortOrder: 1 },
  { id: "govid", name: "Government Identity Documents", definition: "Numbers issued by the government to identify a person. Some are protected by law and can never be shown in full.", sortOrder: 2 },
  { id: "finance", name: "Financial & Banking Data", definition: "Account, card, and payment identifiers.", sortOrder: 3 },
  { id: "other", name: "Other Personal Data", definition: "Personal data that doesn't fit the groups above.", sortOrder: 4 },
];

type FieldSeed = { code: string; displayName: string; categoryId: string; origin?: string; regulated?: boolean; legalMinimum?: unknown; sampleValue: string; usedByApps?: boolean; announcedBy?: string[] };
const FIELDS: FieldSeed[] = [
  // 11 "ready" (carried by the active version)
  { code: "FULL_NAME", displayName: "Full name", categoryId: "personal", sampleValue: "Rajesh Kumar" },
  { code: "DATE_OF_BIRTH", displayName: "Date of birth", categoryId: "personal", sampleValue: "1990-05-15" },
  { code: "EMAIL", displayName: "Email address", categoryId: "contact", sampleValue: "rajesh.kumar@example.com" },
  { code: "MOBILE", displayName: "Mobile number", categoryId: "contact", sampleValue: "9876543210" },
  { code: "AADHAAR", displayName: "Aadhaar number", categoryId: "govid", regulated: true, legalMinimum: pattern("xxxx-xxxx-####"), sampleValue: "123456789012" },
  { code: "PAN", displayName: "PAN", categoryId: "govid", regulated: true, legalMinimum: firstlast(3, 1), sampleValue: "ABCDE1234F" },
  { code: "PASSPORT", displayName: "Passport number", categoryId: "govid", sampleValue: "M1234567" },
  { code: "ACCOUNT_NUMBER", displayName: "Account number", categoryId: "finance", sampleValue: "1234567890123456" },
  { code: "CARD_NUMBER", displayName: "Card number", categoryId: "finance", sampleValue: "4111111111111111" },
  { code: "CUSTOMER_NOTE", displayName: "Customer note", categoryId: "other", sampleValue: "prefers email contact" },
  { code: "LOYALTY_TIER", displayName: "Loyalty tier", categoryId: "other", origin: "your_organization", sampleValue: "GOLD" },
  // 3 "need you" — newly announced by apps, in neither the catalog match nor the active version
  { code: "DEVICE_ID", displayName: "Device identifier", categoryId: "contact", sampleValue: "dev_8842Abf1", announcedBy: ["Mobile app"] },
  { code: "GEO_CITY", displayName: "City", categoryId: "other", sampleValue: "Bengaluru", announcedBy: ["Web app"] },
  { code: "IP_ADDRESS", displayName: "IP address", categoryId: "contact", sampleValue: "10.24.9.7", announcedBy: ["Mobile app", "Web app"] },
  // not used
  { code: "MIDDLE_NAME", displayName: "Middle name", categoryId: "personal", sampleValue: "Mohan", usedByApps: false },
];

// Baselines shared by v1/v2/v3 for the ready fields.
const BASE: Record<string, unknown> = {
  FULL_NAME: firstlast(2, 2), DATE_OF_BIRTH: pattern("0000-00-00"), EMAIL: email(2, 0), MOBILE: last(2),
  AADHAAR: pattern("xxxx-xxxx-####"), PAN: firstlast(3, 1), PASSPORT: last(4),
  ACCOUNT_NUMBER: last(4), CARD_NUMBER: pattern("****-****-****-####"), CUSTOMER_NOTE: hidden, LOYALTY_TIER: last(4),
};

interface VSpec {
  number: number; state: string; basedOn: number | null; activatedBy?: string; activatedAt?: Date; whyNote?: string; impactSummary?: string;
  decisions: { code: string; masking: unknown; status: string; mode?: string; overrideReason?: string; heldRank?: number }[];
  audiences: { key: string; label: string; identifier: string }[];
  channels: { key: string; label: string; identifier: string }[];
  grants: { aud: string; code: string; visibility: string; masking?: unknown; scope?: string[] | "ANY"; reason?: string }[];
}

// Default tier→strength ranks (4 hidden … 0 shown in full).
const TIER_RANKS: Record<string, number> = { Restricted: 4, Confidential: 3, Internal: 2, Public: 1 };

async function makeVersion(s: VSpec) {
  const v = await prisma.mPPolicyVersion.create({ data: { number: s.number, state: s.state, basedOn: s.basedOn, activatedBy: s.activatedBy ?? null, activatedAt: s.activatedAt ?? null, whyNote: s.whyNote ?? null, impactSummary: s.impactSummary ?? null } });
  for (const d of s.decisions) await prisma.mPFieldDecision.create({ data: { versionId: v.id, fieldCode: d.code, maskingJson: d.masking == null ? null : J(d.masking), status: d.status, mode: d.mode ?? "follows", overrideReason: d.overrideReason ?? null, heldRank: d.heldRank ?? null, reviewed: d.status !== "needs_decision" } });
  for (const [tier, rank] of Object.entries(TIER_RANKS)) await prisma.mPSensitivityRule.create({ data: { versionId: v.id, tier, rank } });
  const audIds: Record<string, string> = {};
  for (const [i, a] of s.audiences.entries()) { const row = await prisma.mPAudience.create({ data: { versionId: v.id, label: a.label, identifier: a.identifier, sortOrder: i } }); audIds[a.key] = row.id; }
  const chIds: Record<string, string> = {};
  for (const c of s.channels) { const row = await prisma.mPChannel.create({ data: { versionId: v.id, label: c.label, identifier: c.identifier } }); chIds[c.key] = row.id; }
  for (const g of s.grants) {
    const scope = g.scope && g.scope !== "ANY" ? g.scope.map((k) => chIds[k]) : "ANY";
    await prisma.mPGrant.create({ data: { versionId: v.id, audienceId: audIds[g.aud], fieldCode: g.code, channelScopeJson: J(scope), visibility: g.visibility, maskingJson: g.masking ? J(g.masking) : null, reason: g.reason ?? null } });
  }
  return v;
}

// Ready fields FOLLOW their sensitivity tier (masking derived by the engine, so no stored masking).
const readyDecisions = () => Object.keys(BASE).map((code) => ({ code, masking: null, status: "ready", mode: "follows" }));

/** Idempotent demo restriction: Support sees Mobile number hidden (direction less),
 *  so the "Sees less than everyone" section is demonstrable. */
async function ensureRestrictionDemo() {
  const active = await prisma.mPPolicyVersion.findFirst({ where: { state: "active" } });
  if (!active) return;
  const support = await prisma.mPAudience.findFirst({ where: { versionId: active.id, label: "Support" } });
  if (!support) return;
  const existing = await prisma.mPGrant.findFirst({ where: { versionId: active.id, audienceId: support.id, fieldCode: "MOBILE" } });
  if (existing) return;
  await prisma.mPGrant.create({ data: { versionId: active.id, audienceId: support.id, fieldCode: "MOBILE", channelScopeJson: '"ANY"', visibility: "restrict", direction: "less", maskingJson: null, reason: null } });
}

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-maskingpolicy: no DATABASE_URL, skipping."); return; }
  await prisma.mPCategory.createMany({ data: CATEGORIES, skipDuplicates: true });
  await prisma.mPField.createMany({
    data: FIELDS.map((f) => ({ code: f.code, displayName: f.displayName, categoryId: f.categoryId, origin: f.origin ?? "platform", regulated: f.regulated ?? false, legalMinimumJson: f.legalMinimum ? J(f.legalMinimum) : null, sampleValue: f.sampleValue, usedByApps: f.usedByApps ?? true, announcedByJson: J(f.announcedBy ?? []) })),
    skipDuplicates: true,
  });

  await ensureCatalogFixtures();
  await ensureSensitivityModel();
  await ensureRestrictionDemo();
  if (await prisma.mPPolicyVersion.findFirst()) { console.log("patch-maskingpolicy: versions present; ensured categories, fields, catalog fixtures + sensitivity model."); return; }

  const audiences = [
    { key: "teller", label: "Teller", identifier: "role:teller" },
    { key: "manager", label: "Manager", identifier: "role:manager" },
    { key: "support", label: "Support", identifier: "role:support" },
    { key: "auditor", label: "Auditor", identifier: "role:auditor" },
  ];
  const channels = [{ key: "mobile", label: "Mobile app", identifier: "app:mobile" }, { key: "web", label: "Web app", identifier: "app:web" }];
  const notUsed = { code: "MIDDLE_NAME", masking: hidden, status: "not_used" };

  // v1 archived
  await makeVersion({
    number: 1, state: "archived", basedOn: null, activatedBy: "A. Rao", activatedAt: new Date("2026-06-02T09:00:00Z"),
    whyNote: "Initial rollout — everyone sees masked values only.", impactSummary: "No audience sees more than everyone else.",
    decisions: [...readyDecisions(), notUsed], audiences, channels, grants: [],
  });

  // v2 active — two audiences see more; Manager sees one full raw value.
  await makeVersion({
    number: 2, state: "active", basedOn: 1, activatedBy: "R. Iyer", activatedAt: new Date("2026-09-14T06:30:00Z"),
    whyNote: "Let Tellers verify the mobile number and give Managers the email for escalations.",
    impactSummary: "3 audiences see more than everyone else · 1 sees full raw values.",
    decisions: [...readyDecisions(), notUsed], audiences, channels,
    grants: [
      { aud: "teller", code: "MOBILE", visibility: "more", masking: last(4) },
      { aud: "manager", code: "EMAIL", visibility: "full_raw", reason: "Managers handle escalations that need the full email." },
      { aud: "support", code: "MOBILE", visibility: "more", masking: last(6), scope: ["mobile"] },
      { aud: "auditor", code: "ACCOUNT_NUMBER", visibility: "more", masking: last(6) },
    ],
  });

  // v3 draft (based on v2) — a mix of looser / tighter / neutral + the 3 new fields.
  await makeVersion({
    number: 3, state: "draft", basedOn: 2,
    decisions: [
      ...readyDecisions().map((d) =>
        d.code === "EMAIL" ? { ...d, mode: "custom", masking: email(6, 0), overrideReason: "Support staff need more of the email to match tickets." } /* custom: looser than its Internal tier, with a reason */
        : d.code === "CUSTOMER_NOTE" ? { ...d, mode: "held", masking: null, heldRank: 4 } /* held fully hidden pending a decision */
        : d),
      notUsed,
      // 3 new fields need a decision
      { code: "DEVICE_ID", masking: hidden, status: "needs_decision" },
      { code: "GEO_CITY", masking: hidden, status: "needs_decision" },
      { code: "IP_ADDRESS", masking: hidden, status: "needs_decision" },
    ],
    audiences, channels,
    grants: [
      { aud: "teller", code: "MOBILE", visibility: "more", masking: last(6) },      // looser (was last 4)
      { aud: "manager", code: "EMAIL", visibility: "more", masking: email(2, 3) },  // tighter (was full raw)
      { aud: "support", code: "MOBILE", visibility: "more", masking: last(4), scope: ["mobile"] }, // tighter (was last 6)
      { aud: "auditor", code: "ACCOUNT_NUMBER", visibility: "more", masking: last(4) }, // tighter (was last 6)
    ],
  });

  await prisma.mPNeedsAttention.createMany({
    data: [
      { type: "new_app_field", label: "3 new fields seen in your applications", count: 3, link: "decisions" },
      { type: "catalog_update", label: "Catalog update affects Aadhaar", count: 1, link: "field:AADHAAR" },
      { type: "fallback_events", label: "12 fields were hidden by the fail-safe in the last 24 hours", count: 12, link: "/audit?module=masking_policy" },
    ],
  });

  console.log(`patch-maskingpolicy: seeded ${CATEGORIES.length} categories, ${FIELDS.length} fields, 3 versions (v2 active, v3 draft), 4 audiences, needs-attention.`);
}

/**
 * Data-catalog fixtures (idempotent, every deploy): sensitivity + platform
 * recommendation + app sightings. Mirrors "read from Data inventory". Sets only
 * where unset so edits survive. [sensitivity, recommended|null, seen]
 */
async function ensureCatalogFixtures() {
  const seen = (name = "ddm-sample-fiduciary-app") => J([{ name, firstSeen: "2026-08-12", lastSeen: "2026-10-06" }]);
  // [sensitivity tier, recommended|null, seen]. Tiers: Restricted | Confidential | Internal | Public | Not classified.
  const spec: Record<string, [string, unknown, boolean]> = {
    FULL_NAME: ["Internal", firstlast(2, 2), true],
    DATE_OF_BIRTH: ["Internal", pattern("0000-00-00"), true],
    EMAIL: ["Internal", email(2, 0), true],
    MOBILE: ["Internal", last(4), true],
    AADHAAR: ["Restricted", pattern("xxxx-xxxx-####"), true],
    PAN: ["Restricted", firstlast(3, 1), true],
    PASSPORT: ["Confidential", last(4), true],
    ACCOUNT_NUMBER: ["Confidential", last(4), true],
    CARD_NUMBER: ["Confidential", pattern("****-****-****-####"), true],
    CUSTOMER_NOTE: ["Public", hidden, true],
    LOYALTY_TIER: ["Public", last(4), true],
    DEVICE_ID: ["Internal", last(4), true],
    GEO_CITY: ["Not classified", null, true],       // demo: Not classified + "Classify"
    IP_ADDRESS: ["Internal", last(4), true],
    MIDDLE_NAME: ["Public", firstlast(1, 1), false],   // demo: platform field not seen yet
  };
  for (const [code, [sens, rec, isSeen]] of Object.entries(spec)) {
    await prisma.mPField.updateMany({
      where: { code, sensitivity: "not_classified" },
      data: { sensitivity: sens, recommendedJson: rec == null ? null : J(rec), ...(isSeen ? { announcedByJson: seen() } : {}) },
    });
  }
}

/**
 * Sensitivity-model migration (idempotent, every deploy). Remaps the old
 * high/medium/low vocabulary to the DLP tiers, seeds tier→strength rules for
 * every existing version, and — one time only — makes existing decisions FOLLOW
 * their tier (clearing stored masking) while keeping a little demo variety.
 */
async function ensureSensitivityModel() {
  // 1. Remap old vocabulary → tiers (only touches rows that still hold an old value).
  const remap: Record<string, string> = { high: "Confidential", medium: "Internal", low: "Public", not_classified: "Not classified" };
  for (const [oldv, tier] of Object.entries(remap)) await prisma.mPField.updateMany({ where: { sensitivity: oldv }, data: { sensitivity: tier } });
  // The two regulated identity numbers are the most sensitive → Restricted.
  await prisma.mPField.updateMany({ where: { code: { in: ["AADHAAR", "PAN"] }, sensitivity: "Confidential" }, data: { sensitivity: "Restricted" } });

  // 2. Every version gets a full set of tier→strength rules (defaults when missing).
  const versions = await prisma.mPPolicyVersion.findMany();
  for (const v of versions) {
    for (const [tier, rank] of Object.entries(TIER_RANKS)) {
      const existing = await prisma.mPSensitivityRule.findUnique({ where: { versionId_tier: { versionId: v.id, tier } } });
      if (!existing) await prisma.mPSensitivityRule.create({ data: { versionId: v.id, tier, rank } });
    }
  }

  // 3. One-time: switch existing decisions to follow their tier. Marker = any custom/held decision.
  const alreadyMigrated = await prisma.mPFieldDecision.findFirst({ where: { OR: [{ mode: "custom" }, { mode: "held" }] } });
  if (!alreadyMigrated) {
    const decs = await prisma.mPFieldDecision.findMany();
    for (const d of decs) {
      if (d.status === "needs_decision" || d.status === "not_used") continue;
      await prisma.mPFieldDecision.update({ where: { id: d.id }, data: { mode: "follows", maskingJson: null } });
    }
    // Keep demo variety in the draft: EMAIL custom (looser, with reason), Customer note held.
    const draft = await prisma.mPPolicyVersion.findFirst({ where: { state: "draft" } });
    if (draft) {
      await prisma.mPFieldDecision.updateMany({ where: { versionId: draft.id, fieldCode: "EMAIL" }, data: { mode: "custom", maskingJson: J(email(6, 0)), overrideReason: "Support staff need more of the email to match tickets." } });
      await prisma.mPFieldDecision.updateMany({ where: { versionId: draft.id, fieldCode: "CUSTOMER_NOTE" }, data: { mode: "held", heldRank: 4, maskingJson: null } });
    }
  }
}

main().catch((e) => console.error("patch-maskingpolicy failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
