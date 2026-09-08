/**
 * Idempotent Data Map demo data. Runs on every deploy (like patch-notices):
 * seeds the "Loan Application" processing activity with element-level
 * Purpose/Processor so the nested table and the DPO-request flow are demoable on
 * a database that was seeded before ActivityElement existed. Never deletes; safe
 * to run repeatedly.
 *
 * Phone Number is left deliberately UNASSIGNED so the bundled Purpose+Processor
 * request flow has a live target; PAN and Income are assigned to show the
 * policy-locked, resolved state.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("patch-datamap: no DATABASE_URL, skipping.");
    return;
  }

  const purposes = await prisma.purposeTag.findMany({ select: { id: true, name: true } });
  const purposeId = (name: string) => purposes.find((p) => p.name === name)?.id ?? null;
  if (purposes.length === 0) {
    console.log("patch-datamap: not seeded yet, skipping.");
    return;
  }
  const processor = await prisma.dataProcessor.findFirst({ select: { id: true, name: true } });

  // Upsert the activity by a stable id.
  await prisma.processingActivity.upsert({
    where: { id: "pa_loan" },
    update: {},
    create: { id: "pa_loan", activity: "Loan Application", origin: "manual" },
  });

  const existing = await prisma.activityElement.count({ where: { activityId: "pa_loan" } });
  if (existing > 0) {
    console.log("patch-datamap: Loan Application already has elements, leaving it alone.");
    return;
  }

  await prisma.activityElement.createMany({
    data: [
      // KYC — internal, no processor. (Regulatory compliance is the seeded KYC purpose.)
      { activityId: "pa_loan", elementName: "PAN Number", purposeTagId: purposeId("Regulatory compliance"), processorId: null, subjectType: "customer", requestState: "none" },
      // Deliberately unassigned — the Request flow's live target.
      { activityId: "pa_loan", elementName: "Phone Number", purposeTagId: null, processorId: null, subjectType: "customer", requestState: "none" },
      // Assigned to a purpose and shared with a processor.
      { activityId: "pa_loan", elementName: "Income Details", purposeTagId: purposeId("Account servicing"), processorId: processor?.id ?? null, subjectType: "customer", requestState: "none" },
    ],
  });

  console.log("patch-datamap: Loan Application activity + elements seeded.");
}

main()
  .catch((error) => console.error("patch-datamap failed (continuing):", error))
  .finally(async () => { await prisma.$disconnect(); });
