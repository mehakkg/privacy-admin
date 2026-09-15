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
  await seedRopaSuggestions();
  await backfillFlowNodeRefs();
}

/**
 * Backfill the new DataFlowNode → source/processor links on databases that were
 * seeded before those FKs existed. Idempotent: only touches nodes that still
 * have neither FK, and resolves the target by the refHref id (sources) or by
 * matching the node label to a processor name.
 */
async function backfillFlowNodeRefs() {
  const nodes = await prisma.dataFlowNode.findMany({
    where: { sourceRefId: null, processorRefId: null },
    select: { id: true, label: true, nodeType: true, refHref: true },
  });
  if (nodes.length === 0) { console.log("patch-datamap: flow node refs present, skipping."); return; }
  const [sources, processors] = await Promise.all([
    prisma.discoverySource.findMany({ select: { id: true } }),
    prisma.dataProcessor.findMany({ select: { id: true, name: true } }),
  ]);
  const sourceIds = new Set(sources.map((s) => s.id));
  const procByName = new Map(processors.map((p) => [p.name, p.id]));
  let linked = 0;
  for (const n of nodes) {
    // A source/system node links out via /discovery/sources/<id> — reuse that id.
    const m = n.refHref?.match(/\/discovery\/sources\/([^/]+)$/);
    if (m && sourceIds.has(m[1])) {
      await prisma.dataFlowNode.update({ where: { id: n.id }, data: { sourceRefId: m[1] } });
      linked++;
      continue;
    }
    // A processor node is matched to its DataProcessor by exact name.
    const pid = procByName.get(n.label);
    if (pid) {
      await prisma.dataFlowNode.update({ where: { id: n.id }, data: { processorRefId: pid } });
      linked++;
    }
  }
  console.log(`patch-datamap: backfilled ${linked} flow node ref(s).`);
}

/** Seed initial ROPA suggestions from approved classified fields, once. */
async function seedRopaSuggestions() {
  if ((await prisma.ropaSuggestion.count()) > 0) { console.log("patch-datamap: ropa suggestions present, skipping."); return; }
  const fields = await prisma.classifiedField.findMany({
    where: { reviewState: "approved" },
    select: { id: true, sourceId: true, purposeTagId: true, dataSubjectType: true },
  });
  const groups = new Map<string, { sourceId: string; purposeTagId: string | null; dataSubjectType: string | null; fieldIds: string[] }>();
  for (const f of fields) {
    const key = `${f.sourceId}|${f.purposeTagId ?? ""}|${f.dataSubjectType ?? ""}`;
    const g = groups.get(key) ?? { sourceId: f.sourceId, purposeTagId: f.purposeTagId, dataSubjectType: f.dataSubjectType, fieldIds: [] };
    g.fieldIds.push(f.id);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    await prisma.ropaSuggestion.create({ data: { sourceId: g.sourceId, purposeTagId: g.purposeTagId, dataSubjectType: g.dataSubjectType, fieldIdsJson: JSON.stringify([...g.fieldIds].sort()), status: "pending" } });
  }
  console.log(`patch-datamap: seeded ${groups.size} ROPA suggestions.`);
}

main()
  .catch((error) => console.error("patch-datamap failed (continuing):", error))
  .finally(async () => { await prisma.$disconnect(); });
