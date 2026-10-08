/**
 * Processing Activities governance demo (idempotent, every deploy).
 *
 * Seeds the 8 spec purposes (with versions), 5 processors, 8 activities that
 * exercise every completeness state, review reasons, and 5 templates. To keep
 * the list deterministic (acceptance test 1 = exactly 8), it removes any
 * ProcessingActivity that is not one of these 8 before upserting.
 */
import { PrismaClient } from "@prisma/client";
import { buildSnapshot, sha256Hex8, diffSnapshots, type SnapshotInput } from "../src/lib/activities/versions";

const prisma = new PrismaClient();
const J = (o: unknown) => JSON.stringify(o);
const d = (s: string) => new Date(s);

// --- Processors (vendors) ---------------------------------------------------
const VENDORS = [
  { key: "snowflake", name: "Snowflake", jurisdiction: "US", dpaStatus: "active", risk: "medium" },
  { key: "salesforce", name: "Salesforce", jurisdiction: "US", dpaStatus: "active", risk: "medium" },
  { key: "acme", name: "Acme Cloud", jurisdiction: "IN", dpaStatus: "active", risk: "low" },
  { key: "northwind", name: "Northwind Mail", jurisdiction: "IE", dpaStatus: "draft", risk: "high" },
  { key: "helpdesk", name: "Helpdesk Co", jurisdiction: "IN", dpaStatus: "active", risk: "low" },
];

// --- Purposes (with a single in-force version per the spec) -----------------
type V = { number: number; state: string; legalBasis: string; legitimateUseType?: string; amount: number; unit: string; trigger: string; consent?: string; justification?: string; submittedBy?: string; submittedAt?: string; decidedBy?: string; decidedAt?: string; decisionComment?: string };
type P = { key: string; name: string; description: string; tagStatus: string; version: V };
const PURPOSES: P[] = [
  { key: "accountServicing", name: "Account servicing", description: "Servicing customer accounts for the agreed banking relationship.", tagStatus: "approved",
    version: { number: 3, state: "approved", legalBasis: "legitimate_use", legitimateUseType: "Voluntarily provided for a specified purpose", amount: 7, unit: "years", trigger: "after account closure", consent: "not_required", decidedBy: "K. Menon", decidedAt: "2026-08-12" } },
  { key: "loanApp", name: "Loan application processing", description: "Assessing and processing loan applications.", tagStatus: "approved",
    version: { number: 2, state: "approved", legalBasis: "legitimate_use", legitimateUseType: "Legal obligation", amount: 8, unit: "years", trigger: "after loan closure", consent: "not_required", decidedBy: "K. Menon", decidedAt: "2026-09-03" } },
  { key: "marketing", name: "Marketing communications", description: "Sending marketing messages to customers who opted in.", tagStatus: "approved",
    version: { number: 1, state: "approved", legalBasis: "consent", amount: 2, unit: "years", trigger: "after last interaction", consent: "linked", decidedBy: "K. Menon", decidedAt: "2026-07-20" } },
  { key: "customerSupport", name: "Customer support", description: "Handling customer support tickets and queries.", tagStatus: "approved",
    version: { number: 1, state: "approved", legalBasis: "legitimate_use", legitimateUseType: "Voluntarily provided for a specified purpose", amount: 3, unit: "years", trigger: "after ticket closure", consent: "not_required", decidedBy: "K. Menon", decidedAt: "2026-07-20" } },
  { key: "fraud", name: "Fraud prevention", description: "Detecting and blocking fraudulent applications.", tagStatus: "pending_dpo_approval",
    version: { number: 1, state: "waiting_for_dpo", legalBasis: "legitimate_use", legitimateUseType: "Legal obligation", amount: 5, unit: "years", trigger: "after the event", justification: "Needed to detect and block fraudulent applications.", submittedBy: "R. Iyer", submittedAt: "2026-10-07" } },
  { key: "creditScoring", name: "Credit scoring", description: "Scoring applicants' creditworthiness.", tagStatus: "draft",
    version: { number: 1, state: "changes_requested", legalBasis: "legitimate_use", legitimateUseType: "Legal obligation", amount: 8, unit: "years", trigger: "after loan closure", justification: "Needed to assess credit risk.", submittedBy: "R. Iyer", submittedAt: "2026-10-03", decidedBy: "K. Menon", decidedAt: "2026-10-05", decisionComment: "Please narrow retention to 3 years. 8 is longer than this needs." } },
  { key: "feedback", name: "Customer feedback surveys", description: "Running feedback surveys after interactions.", tagStatus: "draft",
    version: { number: 1, state: "draft", legalBasis: "consent", amount: 1, unit: "years", trigger: "after survey", consent: "not_linked", justification: "To improve service based on feedback." } },
  { key: "payroll", name: "Payroll processing", description: "Processing employee payroll.", tagStatus: "approved",
    version: { number: 1, state: "approved", legalBasis: "legitimate_use", legitimateUseType: "Employment", amount: 8, unit: "years", trigger: "after employment ends", consent: "not_required", decidedBy: "K. Menon", decidedAt: "2026-06-14" } },
];

// --- Activities -------------------------------------------------------------
type Seg = { purpose: string; data: string[]; processorMode: "unanswered" | "uses_processors" | "none"; processors?: string[] };
type A = { id: string; name: string; owner: string | null; department: string; principals: string[]; lifecycle: string; lastReviewedAt?: string; activatedAt?: string; nextReviewDue?: string; segments: Seg[]; reasons?: { type: string; detail: string }[] };
const ACTIVITIES: A[] = [
  { id: "pa-loan-origination", name: "Retail Loan Origination", owner: "P. Shah", department: "Credit", principals: ["customers"], lifecycle: "active", lastReviewedAt: "2026-08-12", activatedAt: "2026-08-12", nextReviewDue: "2027-08-12",
    segments: [
      { purpose: "loanApp", processorMode: "uses_processors", processors: ["acme", "snowflake"], data: ["loans.account_number", "loans.applicant_name", "loans.income", "loans.card_number", "customers.pan_number", "customers.aadhaar", "profiles.dob"] },
      { purpose: "accountServicing", processorMode: "uses_processors", processors: ["snowflake"], data: ["customers.mobile", "profiles.email"] },
    ] },
  { id: "pa-marketing", name: "Marketing Campaigns", owner: "A. Rao", department: "Marketing", principals: ["customers"], lifecycle: "under_review", lastReviewedAt: "2025-10-08",
    segments: [{ purpose: "marketing", processorMode: "uses_processors", processors: ["northwind"], data: ["profiles.phone", "campaigns.recipient"] }],
    reasons: [{ type: "new_field_in_linked_table", detail: "A new field appeared in Marketing Automation: prefs.country." }, { type: "review_due", detail: "Review is due. Last confirmed 8 Oct 2025." }] },
  { id: "pa-onboarding", name: "Customer Onboarding", owner: "R. Iyer", department: "Customer Operations", principals: ["customers"], lifecycle: "draft",
    segments: [
      { purpose: "accountServicing", processorMode: "uses_processors", processors: ["snowflake"], data: ["customers.mobile", "profiles.full_name", "profiles.email"] },
      { purpose: "customerSupport", processorMode: "unanswered", data: [] },
    ] },
  { id: "pa-support", name: "Customer Support", owner: "S. Nair", department: "Customer Operations", principals: ["customers"], lifecycle: "active", lastReviewedAt: "2026-09-01", activatedAt: "2026-09-01", nextReviewDue: "2027-09-01",
    segments: [{ purpose: "customerSupport", processorMode: "uses_processors", processors: ["salesforce", "helpdesk"], data: ["tickets.requester_email", "contacts.email", "contacts.phone", "contacts.full_name"] }] },
  { id: "pa-fraud", name: "Fraud Monitoring", owner: "P. Shah", department: "Risk", principals: ["customers"], lifecycle: "draft",
    segments: [{ purpose: "fraud", processorMode: "unanswered", data: [] }] },
  { id: "pa-credit-scoring", name: "Credit Scoring", owner: "P. Shah", department: "Credit", principals: ["customers"], lifecycle: "draft",
    segments: [{ purpose: "creditScoring", processorMode: "unanswered", data: [] }] },
  { id: "pa-payroll", name: "Payroll", owner: null, department: "HR", principals: [], lifecycle: "draft", segments: [] },
  { id: "pa-debt", name: "Debt Collections", owner: "P. Shah", department: "Credit", principals: ["customers"], lifecycle: "draft",
    segments: [{ purpose: "loanApp", processorMode: "unanswered", data: ["loans.account_number", "loans.applicant_name"] }] },
];

const TEMPLATES = [
  { name: "Customer onboarding", purposes: ["accountServicing", "customerSupport"], types: ["Name", "Email", "Phone"] },
  { name: "Loan origination", purposes: ["loanApp", "accountServicing"], types: ["PAN", "Aadhaar", "Account number", "Financial"] },
  { name: "Marketing campaigns", purposes: ["marketing"], types: ["Email", "Phone", "Behavioural"] },
  { name: "Customer support", purposes: ["customerSupport"], types: ["Email", "Phone", "Free text"] },
  { name: "Payroll", purposes: ["payroll"], types: ["Name", "Account number", "Financial"] },
];

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-activities: no DATABASE_URL, skipping."); return; }

  // Processors.
  const vendorId: Record<string, string> = {};
  for (const v of VENDORS) {
    const row = await prisma.dataProcessor.upsert({
      where: { name: v.name },
      update: { jurisdiction: v.jurisdiction, dpaStatus: v.dpaStatus, riskClassification: v.risk },
      create: { name: v.name, dpaId: `DPA-${v.key.toUpperCase()}`, dpaScopeJson: "[]", contactChannel: "email", jurisdiction: v.jurisdiction, dpaStatus: v.dpaStatus, riskClassification: v.risk },
    });
    vendorId[v.key] = row.id;
  }

  // Purposes + versions.
  const purposeId: Record<string, string> = {};
  for (const p of PURPOSES) {
    const basisRetention = `${p.version.amount} ${p.version.unit} ${p.version.trigger}`;
    const tag = await prisma.purposeTag.upsert({
      where: { name: p.name },
      update: { status: p.tagStatus, description: p.description, lawfulBasis: p.version.legalBasis, retention: basisRetention },
      create: { name: p.name, description: p.description, status: p.tagStatus, lawfulBasis: p.version.legalBasis, retention: basisRetention, approvedBy: p.version.decidedBy ?? "", approvedAt: p.version.decidedAt ? d(p.version.decidedAt) : new Date(0) },
    });
    purposeId[p.key] = tag.id;
    const v = p.version;
    await prisma.purposeVersion.upsert({
      where: { purposeId_number: { purposeId: tag.id, number: v.number } },
      update: { state: v.state, consent: v.consent ?? "not_required", decisionComment: v.decisionComment ?? null },
      create: {
        purposeId: tag.id, number: v.number, state: v.state, name: p.name, description: p.description, legalBasis: v.legalBasis,
        legitimateUseType: v.legitimateUseType ?? null, retentionAmount: v.amount, retentionUnit: v.unit, retentionTrigger: v.trigger,
        justification: v.justification ?? "", submittedBy: v.submittedBy ?? null, submittedAt: v.submittedAt ? d(v.submittedAt) : null,
        decidedBy: v.decidedBy ?? null, decidedAt: v.decidedAt ? d(v.decidedAt) : null, decisionComment: v.decisionComment ?? null, consent: v.consent ?? "not_required",
      },
    });
  }

  // Map field paths → ClassifiedField ids (best effort; counts work either way).
  const fields = await prisma.classifiedField.findMany({ select: { id: true, fieldPath: true } });
  const fieldByPath = new Map(fields.map((f) => [f.fieldPath, f.id]));

  // Deterministic set: remove any activity that isn't one of the 8, then upsert.
  const keepIds = ACTIVITIES.map((a) => a.id);
  // Clear legacy element rows first (their FK predates the cascade), then the activities.
  await prisma.activityElement.deleteMany({ where: { activityId: { notIn: keepIds } } });
  await prisma.activityPurpose.deleteMany({ where: { activityId: { notIn: keepIds } } });
  await prisma.processingActivity.deleteMany({ where: { id: { notIn: keepIds } } });

  for (const a of ACTIVITIES) {
    await prisma.processingActivity.upsert({
      where: { id: a.id },
      update: { activity: a.name, ownerName: a.owner, department: a.department, principalsJson: J(a.principals), lifecycleState: a.lifecycle, lastReviewedAt: a.lastReviewedAt ? d(a.lastReviewedAt) : null, activatedAt: a.activatedAt ? d(a.activatedAt) : null, nextReviewDue: a.nextReviewDue ? d(a.nextReviewDue) : null, createdBy: "R. Iyer" },
      create: { id: a.id, activity: a.name, origin: "manual", ownerName: a.owner, department: a.department, principalsJson: J(a.principals), lifecycleState: a.lifecycle, lastReviewedAt: a.lastReviewedAt ? d(a.lastReviewedAt) : null, activatedAt: a.activatedAt ? d(a.activatedAt) : null, nextReviewDue: a.nextReviewDue ? d(a.nextReviewDue) : null, createdBy: "R. Iyer" },
    });
    // Rebuild segments from scratch for determinism.
    await prisma.activityPurpose.deleteMany({ where: { activityId: a.id } });
    await prisma.reviewReason.deleteMany({ where: { activityId: a.id } });
    for (const seg of a.segments) {
      const sp = await prisma.activityPurpose.create({ data: { activityId: a.id, purposeTagId: purposeId[seg.purpose], linkState: "confirmed", processorMode: seg.processorMode, addedBy: "R. Iyer", processorId: seg.processors?.[0] ? vendorId[seg.processors[0]] : null } });
      for (const path of seg.data) await prisma.activityPurposeElement.create({ data: { activityPurposeId: sp.id, fieldName: path, classifiedFieldId: fieldByPath.get(path) ?? null, linkState: "confirmed", addedBy: "R. Iyer" } });
      for (const pk of seg.processors ?? []) await prisma.activityPurposeProcessor.create({ data: { activityPurposeId: sp.id, vendorId: vendorId[pk], linkState: "confirmed", addedBy: "R. Iyer" } });
    }
    for (const r of a.reasons ?? []) await prisma.reviewReason.create({ data: { activityId: a.id, type: r.type, detail: r.detail, status: "open" } });
  }

  // Templates.
  for (const t of TEMPLATES) {
    await prisma.activityTemplate.upsert({
      where: { name: t.name },
      update: { purposeIdsJson: J(t.purposes.map((k) => purposeId[k])), typicalDataTypesJson: J(t.types) },
      create: { name: t.name, description: null, purposeIdsJson: J(t.purposes.map((k) => purposeId[k])), typicalDataTypesJson: J(t.types) },
    });
  }

  // --- Signed versions (M1) -------------------------------------------------
  // Retail Loan Origination is active at version 2 (v1 superseded 12 Aug 2026);
  // Customer Support is active at version 1. Snapshots are canonical + hashed so
  // "Verify" matches. Idempotent: cleared and rebuilt each run (hashes are stable).
  const purposeByKey = Object.fromEntries(PURPOSES.map((p) => [p.key, p]));
  const vendorByKey = Object.fromEntries(VENDORS.map((v) => [v.key, v]));
  const snapInput = (a: A): SnapshotInput => ({
    name: a.name, description: "", owner: a.owner, department: a.department, entity: null,
    principals: a.principals, reviewPeriodMonths: 12, nextReviewDue: a.nextReviewDue ?? null,
    purposes: a.segments.map((seg) => {
      const p = purposeByKey[seg.purpose];
      return {
        purposeId: p.name, approvedVersion: p.version.number,
        legalBasis: p.version.legalBasis === "consent" ? "Consent" : "Legitimate use",
        retention: `${p.version.amount} ${p.version.unit} ${p.version.trigger}`.trim(),
        noProcessor: seg.processorMode === "none",
        data: seg.data.map((path) => ({ fieldId: path, path, dataType: "Unknown", sensitivity: null as string | null })),
        processors: (seg.processors ?? []).map((k) => ({ vendor: vendorByKey[k].name, country: vendorByKey[k].jurisdiction as string | null })),
      };
    }),
  });

  await prisma.activityVersion.deleteMany({ where: { activityId: { in: ["pa-loan-origination", "pa-support"] } } });

  const loanFull = snapInput(ACTIVITIES.find((a) => a.id === "pa-loan-origination")!);
  // v1 lacked the date-of-birth field that v2 added.
  const loanV1Input: SnapshotInput = { ...loanFull, nextReviewDue: "2027-06-01", purposes: loanFull.purposes.map((p, i) => (i === 0 ? { ...p, data: p.data.filter((d) => d.path !== "profiles.dob") } : p)) };
  const loanV1Snap = buildSnapshot(loanV1Input), loanV1Hash = await sha256Hex8(loanV1Snap);
  const loanV2Snap = buildSnapshot(loanFull), loanV2Hash = await sha256Hex8(loanV2Snap);
  await prisma.activityVersion.create({ data: { activityId: "pa-loan-origination", number: 1, state: "superseded", snapshot: loanV1Snap, hash: loanV1Hash, activatedBy: "R. Iyer", activatedAt: d("2026-06-01"), reason: null, attestationsJson: J({ accurate: true, authority: true, reviewBy: "2027-06-01" }), diffJson: null } });
  await prisma.activityVersion.create({ data: { activityId: "pa-loan-origination", number: 2, state: "active", snapshot: loanV2Snap, hash: loanV2Hash, activatedBy: "R. Iyer", activatedAt: d("2026-08-12"), reason: "Added the applicant date-of-birth field after the Q3 lending-policy update.", attestationsJson: J({ accurate: true, authority: true, reviewBy: "2027-08-12" }), diffJson: J(diffSnapshots(loanV1Snap, loanV2Snap)) } });

  const supportSnap = buildSnapshot(snapInput(ACTIVITIES.find((a) => a.id === "pa-support")!)), supportHash = await sha256Hex8(supportSnap);
  await prisma.activityVersion.create({ data: { activityId: "pa-support", number: 1, state: "active", snapshot: supportSnap, hash: supportHash, activatedBy: "R. Iyer", activatedAt: d("2026-09-01"), reason: null, attestationsJson: J({ accurate: true, authority: true, reviewBy: "2027-09-01" }), diffJson: null } });

  console.log(`patch-activities: seeded ${PURPOSES.length} purposes, ${ACTIVITIES.length} activities, ${TEMPLATES.length} templates, 3 signed versions.`);
}

main().catch((e) => console.error("patch-activities failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
