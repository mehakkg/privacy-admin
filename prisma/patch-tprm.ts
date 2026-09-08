/**
 * Idempotent Vendor Risk (TPRM) demo data. Runs on every deploy; the vendor
 * block and the assessment block each guard on their own table being empty, so
 * a database that already has the vendors (from an earlier deploy) still gets
 * the assessments added, and neither block clobbers runtime edits.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const day = 86400000;
const d = (iso: string) => new Date(iso);

async function seedVendors() {
  if ((await prisma.vendor.count()) > 0) { console.log("patch-tprm: vendors present, skipping vendor seed."); return; }
  const purposes = await prisma.purposeTag.findMany({ select: { id: true, name: true } });
  if (purposes.length === 0) { console.log("patch-tprm: not seeded yet, skipping."); return; }
  const pid = (name: string) => purposes.find((p) => p.name === name)?.id ?? null;
  const now = Date.now();

  const razorpay = await prisma.vendor.create({
    data: {
      name: "Razorpay", category: "Payment Processor", riskRating: "high", riskBaseline: "high",
      ownerName: "Neha Kapoor", onboardedAt: d("2025-11-04"), lastReviewedAt: d("2026-06-12"),
      dpaName: "Razorpay Data Processing Addendum", dpaScope: "Payment and transaction data processing",
      dpaSignedAt: d("2025-11-10"), dpaExpiresAt: d("2027-11-10"), dpaStatus: "active", dpaDocLink: "#",
    },
  });
  await prisma.vendorPurposeMapping.createMany({ data: [
    { vendorId: razorpay.id, purposeTagId: pid("Account servicing"), purposeName: "Payment collection", piiTypesJson: JSON.stringify(["contact", "financial", "transaction"]), activityName: "Loan Application" },
    { vendorId: razorpay.id, purposeTagId: pid("Fraud prevention"), purposeName: "Fraud screening", piiTypesJson: JSON.stringify(["transaction", "identity"]), activityName: "Loan Application" },
  ] });

  const freshdesk = await prisma.vendor.create({
    data: {
      name: "Freshdesk", category: "Customer Support", riskRating: "medium", riskBaseline: "medium",
      ownerName: "Neha Kapoor", onboardedAt: d("2025-09-01"), lastReviewedAt: d("2026-07-01"),
      dpaName: "Freshworks DPA", dpaScope: "Support ticket data",
      dpaSignedAt: d("2025-09-05"), dpaExpiresAt: d("2027-09-05"), dpaStatus: "active", dpaDocLink: "#",
    },
  });
  await prisma.vendorPurposeMapping.createMany({ data: [
    { vendorId: freshdesk.id, purposeTagId: pid("Grievance redressal"), purposeName: "Support & grievance handling", piiTypesJson: JSON.stringify(["contact", "identity", "support"]), activityName: "Customer Support" },
  ] });

  const northgate = await prisma.vendor.create({
    data: {
      name: "Northgate Lending", category: "Lending Partner", riskRating: "critical", riskBaseline: "high",
      riskOverrideHistoryJson: JSON.stringify([{ from: "high", to: "critical", by: "Neha Kapoor", reason: "Handles Aadhaar for underwriting; SDF-adjacent exposure.", at: d("2026-05-20").toISOString() }]),
      ownerName: "Neha Kapoor", onboardedAt: d("2025-06-15"), lastReviewedAt: d("2026-05-20"),
      dpaName: "Northgate Lending Partner Agreement", dpaScope: "Loan underwriting — identity, KYC and financial data",
      dpaSignedAt: d("2025-06-20"), dpaExpiresAt: new Date(now + 18 * day), dpaStatus: "active", dpaDocLink: "#",
    },
  });
  await prisma.vendorPurposeMapping.createMany({ data: [
    { vendorId: northgate.id, purposeTagId: pid("Regulatory compliance"), purposeName: "KYC verification", piiTypesJson: JSON.stringify(["identity", "kyc"]), activityName: "Loan Application" },
    { vendorId: northgate.id, purposeTagId: pid("Account servicing"), purposeName: "Loan underwriting", piiTypesJson: JSON.stringify(["identity", "kyc", "financial", "transaction"]), activityName: "Loan Application" },
    { vendorId: northgate.id, purposeTagId: pid("Fraud prevention"), purposeName: "Default risk scoring", piiTypesJson: JSON.stringify(["financial", "behavioural"]), activityName: "Loan Application" },
  ] });

  await prisma.vendor.create({
    data: { name: "StationeryPlus", category: "Office Supplies", riskRating: "low", riskBaseline: "low", ownerName: "Neha Kapoor", onboardedAt: d("2026-02-01"), dpaStatus: "not_on_file" },
  });
  console.log("patch-tprm: 4 vendors seeded.");
}

async function seedAssessments() {
  if ((await prisma.vendorAssessment.count()) > 0) { console.log("patch-tprm: assessments present, skipping."); return; }
  const vendors = await prisma.vendor.findMany({ select: { id: true, name: true } });
  if (vendors.length === 0) return;
  const vid = (name: string) => vendors.find((v) => v.name === name)?.id ?? null;

  const answers = {
    data_categories: "Identity, contact, KYC and financial records.",
    data_residency: "Mumbai (ap-south-1); no transfer outside India.",
    subprocessors: "AWS for infrastructure hosting.",
    retention: "Retained for the loan term plus 8 years per RBI norms, then deleted.",
    certifications: "ISO 27001:2022, SOC 2 Type II.",
    encryption: "AES-256 at rest, TLS 1.3 in transit.",
    breach_sla: "Notification within 24 hours of confirmed breach.",
  };

  const northgate = vid("Northgate Lending");
  if (northgate) {
    await prisma.vendorAssessment.create({
      data: { vendorId: northgate, templateName: "High-Risk Financial Partner v2", assignedAt: d("2026-08-01"), vendorStatus: "submitted", legalReviewStatus: "pending", baselineRating: "high", submittedAt: d("2026-08-10"), responseJson: JSON.stringify(answers) },
    });
  }
  const freshdesk = vid("Freshdesk");
  if (freshdesk) {
    await prisma.vendorAssessment.create({
      data: { vendorId: freshdesk, templateName: "Standard SaaS Vendor v3", assignedAt: d("2026-07-15"), vendorStatus: "submitted", legalReviewStatus: "verified", classification: "medium", classificationReason: "Standard SaaS diligence passed; no elevated data exposure.", baselineRating: "medium", submittedAt: d("2026-07-20"), responseJson: JSON.stringify({ ...answers, data_categories: "Contact and support-ticket content only." }) },
    });
  }

  // CloudArchive Co. — a new vendor still mid-assessment, not yet in the register as "reviewed".
  let cloud = vid("CloudArchive Co.");
  if (!cloud) {
    const v = await prisma.vendor.create({ data: { name: "CloudArchive Co.", category: "Cloud Storage", riskRating: "high", riskBaseline: "high", ownerName: "Neha Kapoor", onboardedAt: d("2026-08-18"), dpaStatus: "not_on_file" } });
    cloud = v.id;
  }
  await prisma.vendorAssessment.create({
    data: { vendorId: cloud, templateName: "Cloud Storage v1", assignedAt: d("2026-08-20"), vendorStatus: "in_progress", legalReviewStatus: "pending", baselineRating: "high", responseJson: JSON.stringify({ data_categories: "Encrypted document archives.", data_residency: "" }) },
  });
  console.log("patch-tprm: assessments seeded.");
}

async function seedDisclosures() {
  if ((await prisma.subProcessorDisclosure.count()) > 0) { console.log("patch-tprm: disclosures present, skipping."); return; }
  const vendors = await prisma.vendor.findMany({ select: { id: true, name: true } });
  if (vendors.length === 0) return;
  const vid = (name: string) => vendors.find((v) => v.name === name)?.id ?? null;
  const now = Date.now();

  const northgate = vid("Northgate Lending");
  if (northgate) {
    const disc = await prisma.subProcessorDisclosure.create({
      data: { primaryVendorId: northgate, subProcessorName: "CreditCheck Analytics", scope: "Credit scoring data", reason: "Underwriting needs an external credit-scoring model.", piiTypesJson: JSON.stringify(["financial", "transaction"]), status: "held_pending_approval", disclosedAt: d("2026-09-02") },
    });
    await prisma.subProcessorDocument.create({ data: { vendorId: northgate, disclosureId: disc.id, name: "CreditCheck Analytics DPA", docType: "dpa" } });
    // A standing evidence doc expiring soon, to demo the <30-day flag.
    await prisma.subProcessorDocument.create({ data: { vendorId: northgate, name: "ISO 27001 certificate", docType: "certification", expiresAt: new Date(now + 20 * day) } });
  }

  const freshdesk = vid("Freshdesk");
  if (freshdesk) {
    const disc = await prisma.subProcessorDisclosure.create({
      data: { primaryVendorId: freshdesk, subProcessorName: "AWS (infra hosting)", scope: "Ticket data storage", piiTypesJson: JSON.stringify(["support", "contact"]), status: "active", disclosedAt: d("2026-04-10"), approvedAt: d("2026-04-14"), approvedBy: "Neha Kapoor" },
    });
    await prisma.subProcessorDocument.create({ data: { vendorId: freshdesk, disclosureId: disc.id, name: "AWS SOC 2 Type II", docType: "certification", expiresAt: d("2027-03-01") } });
  }

  // Detector output: Razorpay's flow map shows a destination matching no disclosure.
  const razorpay = vid("Razorpay");
  if (razorpay) {
    await prisma.subProcessorDisclosure.create({
      data: { primaryVendorId: razorpay, subProcessorName: "Unregistered endpoint (data-labs.io)", scope: "", piiTypesJson: JSON.stringify(["transaction"]), status: "flagged", detected: true, firstDetectedAt: d("2026-09-05"), flagStatus: "under_investigation" },
    });
  }
  console.log("patch-tprm: disclosures seeded.");
}

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-tprm: no DATABASE_URL, skipping."); return; }
  await seedVendors();
  await seedAssessments();
  await seedDisclosures();
}

main()
  .catch((e) => console.error("patch-tprm failed (continuing):", e))
  .finally(async () => { await prisma.$disconnect(); });
