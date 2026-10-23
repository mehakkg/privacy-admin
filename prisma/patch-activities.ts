/**
 * Data Map demo — Meridian Financial Services (idempotent, every deploy).
 *
 * The single fixture store for the Data Map redesign: 2 fiduciary entities, 10
 * purposes (incl. one rejected), 9 systems/processors/recipients, and 10 activities
 * that exercise all nine readiness states. The list stays deterministic (exactly
 * 10) by removing any ProcessingActivity that isn't one of these before upserting.
 * Every count on screen is computed from this data — never hard-coded.
 */
import { PrismaClient } from "@prisma/client";
import { buildSnapshot, sha256Hex8, type SnapshotInput } from "../src/lib/activities/versions";

const prisma = new PrismaClient();
const J = (o: unknown) => JSON.stringify(o);
const d = (s: string) => new Date(s);

// --- Fiduciary entities -----------------------------------------------------
const ENTITIES = [
  { id: "ent-mfs", name: "Meridian Financial Services Ltd" },
  { id: "ent-msl", name: "Meridian Securities Ltd" },
];

// --- Systems / processors / recipients --------------------------------------
// kind: internal | processor | fiduciary | registry (for the Data flow page).
const VENDORS = [
  { key: "cbs", name: "Core Banking (CBS)", jurisdiction: "IN", kind: "internal", dpaStatus: "active" },
  { key: "salesforce", name: "Salesforce CRM", jurisdiction: "IN", kind: "processor", dpaStatus: "active" },
  { key: "snowflake", name: "Snowflake", jurisdiction: "SG", kind: "processor", dpaStatus: "active" },
  { key: "freshdesk", name: "Freshdesk", jurisdiction: "US", kind: "processor", dpaStatus: "active" },
  { key: "darwinbox", name: "Darwinbox HRMS", jurisdiction: "IN", kind: "processor", dpaStatus: "active" },
  { key: "mailchimp", name: "Mailchimp", jurisdiction: "US", kind: "processor", dpaStatus: "expired", dpaExpiresAt: "2026-09-30" },
  { key: "cibil", name: "TransUnion CIBIL", jurisdiction: "IN", kind: "fiduciary", dpaStatus: "active" },
  { key: "ckyc", name: "CKYC Registry (CERSAI)", jurisdiction: "IN", kind: "registry", dpaStatus: "active" },
  { key: "authbridge", name: "AuthBridge", jurisdiction: "IN", kind: "processor", dpaStatus: "active" },
];

// --- Purposes ---------------------------------------------------------------
// approval → tag.status + version.state. consent purposes carry a noticeRef (null
// = not in any notice). Legitimate-use purposes skip the notice check.
type Approval = "approved" | "pending" | "draft" | "rejected";
type P = {
  key: string; name: string; description: string; approval: Approval;
  legalBasis: "consent" | "legitimate_use"; legitimateUseType?: string;
  noticeRef?: string | null; retention: string; decidedAt?: string; rejectionReason?: string;
};
const PURPOSES: P[] = [
  { key: "kyc", name: "KYC & identity verification", description: "Verifying a customer's identity to open and run an account.", approval: "approved", legalBasis: "consent", noticeRef: "Account opening notice v3", retention: "5 years after account closure", decidedAt: "2026-08-14" },
  { key: "credit", name: "Credit assessment", description: "Assessing an applicant's creditworthiness for lending decisions.", approval: "approved", legalBasis: "consent", noticeRef: "Loan application notice v2", retention: "8 years after loan closure", decidedAt: "2026-09-02" },
  { key: "fraud", name: "Fraud detection", description: "Detecting and preventing fraudulent transactions and applications.", approval: "pending", legalBasis: "consent", noticeRef: "Account opening notice v3", retention: "5 years after the event" },
  { key: "recovery", name: "Recovery & collections", description: "Recovering overdue amounts on defaulted accounts.", approval: "approved", legalBasis: "consent", noticeRef: "Loan application notice v2", retention: "5 years after settlement", decidedAt: "2026-08-20" },
  { key: "marketing", name: "Product marketing", description: "Sending customers and prospects information about products.", approval: "draft", legalBasis: "consent", noticeRef: null, retention: "2 years after last interaction" },
  { key: "support", name: "Customer support & complaints", description: "Handling support requests, complaints and grievances.", approval: "approved", legalBasis: "consent", noticeRef: null, retention: "3 years after ticket closure", decidedAt: "2026-07-18" },
  { key: "wealth", name: "Investment advisory onboarding", description: "Onboarding wealth customers for investment advisory services.", approval: "approved", legalBasis: "consent", noticeRef: "Wealth account notice v1", retention: "5 years after account closure", decidedAt: "2026-08-01" },
  { key: "payroll", name: "Payroll & statutory deductions", description: "Processing employee salary, tax and statutory deductions.", approval: "approved", legalBasis: "legitimate_use", legitimateUseType: "Employment (7(i))", noticeRef: null, retention: "8 years after employment ends", decidedAt: "2026-06-14" },
  { key: "preemp", name: "Pre-employment background checks", description: "Verifying candidates before employment.", approval: "approved", legalBasis: "legitimate_use", legitimateUseType: "Employment (7(i))", noticeRef: null, retention: "2 years after decision", decidedAt: "2026-05-10" },
  { key: "socialCollections", name: "Collections outreach via social media", description: "Contacting defaulters through social-media channels.", approval: "rejected", legalBasis: "consent", noticeRef: null, retention: "1 year", rejectionReason: "Scope too broad. Specify which channels and why each is necessary." },
];

const APPROVAL_TO_STATE: Record<Approval, string> = { approved: "approved", pending: "waiting_for_dpo", draft: "draft", rejected: "rejected" };
const APPROVAL_TO_TAG: Record<Approval, string> = { approved: "approved", pending: "pending_dpo_approval", draft: "draft", rejected: "rejected" };

// --- Activities -------------------------------------------------------------
type Seg = { purpose: string; data: string[]; processors: string[] };
type A = { id: string; name: string; entity: string; owner: string | null; department: string; principals: string[]; lifecycle: string; lastReviewedAt?: string; submitted?: boolean; seg: Seg };
const ACTIVITIES: A[] = [
  { id: "act-onboarding", name: "Customer onboarding & KYC", entity: "ent-mfs", owner: "R. Iyer", department: "Customer Operations", principals: ["Customer"], lifecycle: "active", lastReviewedAt: "2026-08-14",
    seg: { purpose: "kyc", processors: ["cbs", "ckyc"], data: ["Full name", "Date of birth", "PAN", "Aadhaar number (masked)", "Address", "Mobile number", "Email", "Photograph", "Signature"] } },
  { id: "act-credit-scoring", name: "Credit scoring", entity: "ent-mfs", owner: "P. Shah", department: "Credit", principals: ["Loan applicant"], lifecycle: "active", lastReviewedAt: "2026-09-02",
    seg: { purpose: "credit", processors: ["cbs", "cibil"], data: ["PAN", "Income", "Bureau score", "Existing loans", "Employment status", "Bank statement"] } },
  { id: "act-loan-servicing", name: "Loan servicing", entity: "ent-mfs", owner: "P. Shah", department: "Credit", principals: ["Customer"], lifecycle: "active", lastReviewedAt: "2026-06-11",
    seg: { purpose: "credit", processors: ["cbs", "snowflake"], data: ["Account number", "EMI schedule", "Outstanding balance", "Mobile number", "Email"] } },
  { id: "act-fraud", name: "Fraud monitoring", entity: "ent-mfs", owner: "A. Menon", department: "Risk", principals: ["Customer"], lifecycle: "draft",
    seg: { purpose: "fraud", processors: ["snowflake"], data: ["Device ID", "IP address", "Transaction pattern", "Account number"] } },
  { id: "act-debt", name: "Debt collections", entity: "ent-mfs", owner: "P. Shah", department: "Credit", principals: ["Customer"], lifecycle: "draft",
    seg: { purpose: "recovery", processors: [], data: ["Account number", "Outstanding amount"] } },
  { id: "act-marketing", name: "Marketing campaigns", entity: "ent-mfs", owner: "N. Rao", department: "Marketing", principals: ["Customer", "Prospect"], lifecycle: "draft",
    seg: { purpose: "marketing", processors: ["mailchimp"], data: ["Email", "Mobile number", "Segment"] } },
  { id: "act-support", name: "Customer support calls", entity: "ent-mfs", owner: "S. Pillai", department: "Customer Service", principals: ["Customer"], lifecycle: "draft",
    seg: { purpose: "support", processors: ["freshdesk"], data: ["Email", "Mobile number", "Ticket text"] } },
  { id: "act-payroll", name: "Payroll", entity: "ent-mfs", owner: null, department: "HR", principals: ["Employee"], lifecycle: "draft",
    seg: { purpose: "payroll", processors: [], data: [] } },
  { id: "act-wealth", name: "Wealth advisory onboarding", entity: "ent-msl", owner: "K. Das", department: "Wealth", principals: ["CUSTOMER"], lifecycle: "draft",
    seg: { purpose: "wealth", processors: [], data: [] } },
  { id: "act-preemp", name: "Pre-employment background verification", entity: "ent-mfs", owner: "L. Joshi", department: "HR", principals: ["Employee"], lifecycle: "pending_dpo_review", submitted: true,
    seg: { purpose: "preemp", processors: ["authbridge"], data: ["Full name", "PAN", "Address", "Previous employer", "Education"] } },
];

const TEMPLATES = [
  { name: "Customer onboarding", purposes: ["kyc"], types: ["Name", "PAN", "Address", "Email"] },
  { name: "Lending", purposes: ["credit", "recovery"], types: ["PAN", "Income", "Bureau score"] },
  { name: "Payroll", purposes: ["payroll"], types: ["Name", "Account number", "Salary"] },
];

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-activities: no DATABASE_URL, skipping."); return; }

  // Fiduciary entities.
  for (const e of ENTITIES) {
    await prisma.entity.upsert({ where: { id: e.id }, update: { name: e.name }, create: { id: e.id, name: e.name, kind: "legal_entity" } });
  }

  // Systems / processors.
  const vendorId: Record<string, string> = {};
  for (const v of VENDORS) {
    const row = await prisma.dataProcessor.upsert({
      where: { name: v.name },
      update: { jurisdiction: v.jurisdiction, dpaStatus: v.dpaStatus, dpaExpiresAt: v.dpaExpiresAt ? d(v.dpaExpiresAt) : null },
      create: { name: v.name, dpaId: `DPA-${v.key.toUpperCase()}`, dpaScopeJson: "[]", contactChannel: "email", jurisdiction: v.jurisdiction, dpaStatus: v.dpaStatus, dpaExpiresAt: v.dpaExpiresAt ? d(v.dpaExpiresAt) : null, riskClassification: "medium" },
    });
    vendorId[v.key] = row.id;
  }

  // Purposes + a single version each.
  const purposeId: Record<string, string> = {};
  for (const p of PURPOSES) {
    const tag = await prisma.purposeTag.upsert({
      where: { name: p.name },
      update: { status: APPROVAL_TO_TAG[p.approval], description: p.description, lawfulBasis: p.legalBasis, retention: p.retention, rejectionReason: p.rejectionReason ?? null },
      create: { name: p.name, description: p.description, status: APPROVAL_TO_TAG[p.approval], lawfulBasis: p.legalBasis, retention: p.retention, rejectionReason: p.rejectionReason ?? null, approvedBy: p.approval === "approved" ? "Kavita Menon" : "", approvedAt: p.decidedAt ? d(p.decidedAt) : new Date(0) },
    });
    purposeId[p.key] = tag.id;
    await prisma.purposeVersion.upsert({
      where: { purposeId_number: { purposeId: tag.id, number: 1 } },
      update: { state: APPROVAL_TO_STATE[p.approval], decisionComment: p.rejectionReason ?? null, decidedBy: p.approval === "approved" || p.approval === "rejected" ? "Kavita Menon" : null },
      create: {
        purposeId: tag.id, number: 1, state: APPROVAL_TO_STATE[p.approval], name: p.name, description: p.description, legalBasis: p.legalBasis,
        legitimateUseType: p.legitimateUseType ?? null, retentionAmount: 0, retentionUnit: "years", retentionTrigger: p.retention,
        justification: "", submittedBy: p.approval === "approved" || p.approval === "rejected" ? "R. Iyer" : p.approval === "pending" ? "R. Iyer" : null,
        submittedAt: p.approval !== "draft" ? d("2026-05-01") : null, decidedBy: p.approval === "approved" || p.approval === "rejected" ? "Kavita Menon" : null,
        decidedAt: p.decidedAt ? d(p.decidedAt) : null, decisionComment: p.rejectionReason ?? null, consent: p.legalBasis === "consent" ? (p.noticeRef ? "linked" : "not_linked") : "not_required",
      },
    });
  }

  const fields = await prisma.classifiedField.findMany({ select: { id: true, fieldPath: true } });
  const fieldByPath = new Map(fields.map((f) => [f.fieldPath, f.id]));

  // Deterministic set: remove any activity not in the Meridian 10.
  const keepIds = ACTIVITIES.map((a) => a.id);
  await prisma.activityElement.deleteMany({ where: { activityId: { notIn: keepIds } } });
  await prisma.activityPurpose.deleteMany({ where: { activityId: { notIn: keepIds } } });
  await prisma.processingActivity.deleteMany({ where: { id: { notIn: keepIds } } });

  for (const a of ACTIVITIES) {
    const base = { activity: a.name, ownerName: a.owner, department: a.department, entityId: a.entity, principalsJson: J(a.principals), lifecycleState: a.lifecycle, lastReviewedAt: a.lastReviewedAt ? d(a.lastReviewedAt) : null, activatedAt: a.lifecycle === "active" && a.lastReviewedAt ? d(a.lastReviewedAt) : null, nextReviewDue: a.lastReviewedAt ? d(a.lastReviewedAt) : null, createdBy: "R. Iyer" };
    await prisma.processingActivity.upsert({ where: { id: a.id }, update: base, create: { id: a.id, origin: "manual", ...base } });
    await prisma.activityPurpose.deleteMany({ where: { activityId: a.id } });
    await prisma.reviewReason.deleteMany({ where: { activityId: a.id } });
    const seg = a.seg;
    const sp = await prisma.activityPurpose.create({ data: { activityId: a.id, purposeTagId: purposeId[seg.purpose], linkState: "confirmed", processorMode: seg.processors.length ? "uses_processors" : seg.data.length ? "unanswered" : "none", addedBy: "R. Iyer", processorId: seg.processors[0] ? vendorId[seg.processors[0]] : null } });
    for (const name of seg.data) await prisma.activityPurposeElement.create({ data: { activityPurposeId: sp.id, fieldName: name, classifiedFieldId: fieldByPath.get(name) ?? null, linkState: "confirmed", addedBy: "R. Iyer" } });
    for (const pk of seg.processors) await prisma.activityPurposeProcessor.create({ data: { activityPurposeId: sp.id, vendorId: vendorId[pk], linkState: "confirmed", addedBy: "R. Iyer" } });
  }

  // Templates.
  for (const t of TEMPLATES) {
    await prisma.activityTemplate.upsert({
      where: { name: t.name },
      update: { purposeIdsJson: J(t.purposes.map((k) => purposeId[k])), typicalDataTypesJson: J(t.types) },
      create: { name: t.name, description: null, purposeIdsJson: J(t.purposes.map((k) => purposeId[k])), typicalDataTypesJson: J(t.types) },
    });
  }

  // --- Signed versions: the active (in-register) activities ------------------
  const purposeByKey = Object.fromEntries(PURPOSES.map((p) => [p.key, p]));
  const entityName = Object.fromEntries(ENTITIES.map((e) => [e.id, e.name]));
  const snapInput = (a: A): SnapshotInput => {
    const p = purposeByKey[a.seg.purpose];
    return {
      name: a.name, description: "", owner: a.owner, department: a.department, entity: entityName[a.entity],
      principals: a.principals, reviewPeriodMonths: 12, nextReviewDue: a.lastReviewedAt ?? null,
      purposes: [{ purposeId: p.name, approvedVersion: 1, legalBasis: p.legalBasis === "consent" ? "Consent" : "Legitimate use", retention: p.retention, noProcessor: a.seg.processors.length === 0, data: a.seg.data.map((name) => ({ fieldId: name, path: name, dataType: "Unknown", sensitivity: null as string | null })), processors: a.seg.processors.map((k) => ({ vendor: VENDORS.find((v) => v.key === k)!.name, country: VENDORS.find((v) => v.key === k)!.jurisdiction as string | null })) }],
    };
  };
  const active = ACTIVITIES.filter((a) => a.lifecycle === "active");
  await prisma.activityVersion.deleteMany({ where: { activityId: { in: active.map((a) => a.id) } } });
  for (const a of active) {
    const snap = buildSnapshot(snapInput(a));
    const hash = await sha256Hex8(snap);
    await prisma.activityVersion.create({ data: { activityId: a.id, number: 1, state: "active", snapshot: snap, hash, activatedBy: "Kavita Menon", activatedAt: a.lastReviewedAt ? d(a.lastReviewedAt) : new Date(), reason: null, attestationsJson: J({ accurate: true, authority: true, reviewBy: a.lastReviewedAt ?? null }), diffJson: null } });
  }

  console.log(`patch-activities: seeded ${ENTITIES.length} entities, ${PURPOSES.length} purposes, ${ACTIVITIES.length} activities, ${active.length} signed versions.`);
}

main().catch((e) => console.error("patch-activities failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
