/**
 * Idempotent Vendor Risk (TPRM) demo data — the four fixture vendors from the
 * spec. Runs on every deploy; seeds only if the Vendor table is empty, so it
 * never clobbers runtime edits (e.g. a risk override made on the deployed demo).
 *
 * Northgate Lending's DPA expiry is set ~18 days out from seed time so the DPA
 * registry's deadline-proximity sort has a live "Expiring (18 days)" row.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const day = 86400000;

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-tprm: no DATABASE_URL, skipping."); return; }

  const existing = await prisma.vendor.count();
  if (existing > 0) { console.log(`patch-tprm: ${existing} vendors already present, leaving alone.`); return; }

  const purposes = await prisma.purposeTag.findMany({ select: { id: true, name: true } });
  const pid = (name: string) => purposes.find((p) => p.name === name)?.id ?? null;
  const now = Date.now();
  const d = (iso: string) => new Date(iso);

  const razorpay = await prisma.vendor.create({
    data: {
      name: "Razorpay", category: "Payment Processor", riskRating: "high", riskBaseline: "high",
      ownerName: "Neha Kapoor", onboardedAt: d("2025-11-04"), lastReviewedAt: d("2026-06-12"),
      dpaName: "Razorpay Data Processing Addendum", dpaScope: "Payment and transaction data processing",
      dpaSignedAt: d("2025-11-10"), dpaExpiresAt: d("2027-11-10"), dpaStatus: "active", dpaDocLink: "#",
    },
  });
  await prisma.vendorPurposeMapping.createMany({
    data: [
      { vendorId: razorpay.id, purposeTagId: pid("Account servicing"), purposeName: "Payment collection", piiTypesJson: JSON.stringify(["contact", "financial", "transaction"]), activityName: "Loan Application" },
      { vendorId: razorpay.id, purposeTagId: pid("Fraud prevention"), purposeName: "Fraud screening", piiTypesJson: JSON.stringify(["transaction", "identity"]), activityName: "Loan Application" },
    ],
  });

  const freshdesk = await prisma.vendor.create({
    data: {
      name: "Freshdesk", category: "Customer Support", riskRating: "medium", riskBaseline: "medium",
      ownerName: "Neha Kapoor", onboardedAt: d("2025-09-01"), lastReviewedAt: d("2026-07-01"),
      dpaName: "Freshworks DPA", dpaScope: "Support ticket data",
      dpaSignedAt: d("2025-09-05"), dpaExpiresAt: d("2027-09-05"), dpaStatus: "active", dpaDocLink: "#",
    },
  });
  await prisma.vendorPurposeMapping.createMany({
    data: [
      { vendorId: freshdesk.id, purposeTagId: pid("Grievance redressal"), purposeName: "Support & grievance handling", piiTypesJson: JSON.stringify(["contact", "identity", "support"]), activityName: "Customer Support" },
    ],
  });

  const northgate = await prisma.vendor.create({
    data: {
      name: "Northgate Lending", category: "Lending Partner", riskRating: "critical", riskBaseline: "high",
      riskOverrideHistoryJson: JSON.stringify([{ from: "high", to: "critical", by: "Neha Kapoor", reason: "Handles Aadhaar for underwriting; SDF-adjacent exposure.", at: d("2026-05-20").toISOString() }]),
      ownerName: "Neha Kapoor", onboardedAt: d("2025-06-15"), lastReviewedAt: d("2026-05-20"),
      dpaName: "Northgate Lending Partner Agreement", dpaScope: "Loan underwriting — identity, KYC and financial data",
      dpaSignedAt: d("2025-06-20"), dpaExpiresAt: new Date(now + 18 * day), dpaStatus: "active", dpaDocLink: "#",
    },
  });
  await prisma.vendorPurposeMapping.createMany({
    data: [
      { vendorId: northgate.id, purposeTagId: pid("Regulatory compliance"), purposeName: "KYC verification", piiTypesJson: JSON.stringify(["identity", "kyc"]), activityName: "Loan Application" },
      { vendorId: northgate.id, purposeTagId: pid("Account servicing"), purposeName: "Loan underwriting", piiTypesJson: JSON.stringify(["identity", "kyc", "financial", "transaction"]), activityName: "Loan Application" },
      { vendorId: northgate.id, purposeTagId: pid("Fraud prevention"), purposeName: "Default risk scoring", piiTypesJson: JSON.stringify(["financial", "behavioural"]), activityName: "Loan Application" },
    ],
  });

  await prisma.vendor.create({
    data: {
      name: "StationeryPlus", category: "Office Supplies", riskRating: "low", riskBaseline: "low",
      ownerName: "Neha Kapoor", onboardedAt: d("2026-02-01"), lastReviewedAt: null,
      dpaStatus: "not_on_file",
    },
  });

  console.log("patch-tprm: 4 vendors seeded.");
}

main()
  .catch((e) => console.error("patch-tprm failed (continuing):", e))
  .finally(async () => { await prisma.$disconnect(); });
