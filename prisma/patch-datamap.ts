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

async function seedActivities() {
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

/**
 * Additive source demo — ensures each of the four Source statuses is represented
 * without touching existing seeded sources. Upsert-by-name with an empty update
 * is a no-op when the row already exists.
 */
async function seedSources() {
  const rows = [
    // Never scanned — approved for scope, no scan yet.
    { name: "Data Warehouse — Snowflake", kind: "cloud_storage", dpoApprovedForScanning: true, scanStatus: "pending", connectionState: "connected", lastScanned: null as Date | null },
    // Awaiting approval — connected but not DPO-approved.
    { name: "Legacy Loan Archive", kind: "file_share", dpoApprovedForScanning: false, scanStatus: "pending", connectionState: "connected", lastScanned: null as Date | null },
    // Last scan failed.
    { name: "Marketing Automation", kind: "saas", dpoApprovedForScanning: true, scanStatus: "failed", connectionState: "connected", lastScanned: new Date("2026-08-20") },
    // Current.
    { name: "Finance File Share", kind: "file_share", dpoApprovedForScanning: true, scanStatus: "scanned", connectionState: "connected", lastScanned: new Date("2026-08-28") },
  ];
  for (const r of rows) {
    await prisma.discoverySource.upsert({
      where: { name: r.name },
      update: {}, // never disturb an existing source
      create: { name: r.name, kind: r.kind, dpoApprovedForScanning: r.dpoApprovedForScanning, scanStatus: r.scanStatus, connectionState: r.connectionState, lastScanned: r.lastScanned },
    });
  }
  console.log("patch-datamap: demo sources ensured.");
}

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-datamap: no DATABASE_URL, skipping."); return; }
  await seedActivities();
  await seedSources();
}

main()
  .catch((error) => console.error("patch-datamap failed (continuing):", error))
  .finally(async () => { await prisma.$disconnect(); });
