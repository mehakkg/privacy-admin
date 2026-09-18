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

  // Which optional records actually exist on this DB (fresh vs. long-lived).
  const entity = await prisma.entity.findFirst({ where: { id: "ent_meridian" }, select: { id: true } });
  const entityId = entity?.id ?? null;
  const hasSms = (await prisma.dataProcessor.count({ where: { id: "proc_smsdraft" } })) > 0;
  const hasEmail = (await prisma.dataProcessor.count({ where: { id: "proc_email" } })) > 0;

  // Two anchor activities, upserted by stable id. Lifecycle/entity set on create
  // and refreshed on update so a pre-existing row picks up the new columns.
  await prisma.processingActivity.upsert({
    where: { id: "pa_loan" },
    update: { lifecycleState: "active", entityId },
    create: { id: "pa_loan", activity: "Loan Application", origin: "manual", lifecycleState: "active", entityId },
  });
  await prisma.processingActivity.upsert({
    where: { id: "pa_marketing" },
    update: { lifecycleState: "active", entityId },
    create: { id: "pa_marketing", activity: "Marketing Campaigns", origin: "manual", lifecycleState: "active", entityId },
  });

  // Element reconciliation runs ONCE (guarded on the marker element). It replaces
  // any earlier element set on these two activities so a long-lived demo DB moves
  // to the state that exercises every new column, then leaves it alone forever.
  const alreadyReconciled = (await prisma.activityElement.count({ where: { id: "ae_device" } })) > 0;
  if (!alreadyReconciled) {
    await prisma.activityElement.deleteMany({ where: { activityId: { in: ["pa_loan", "pa_marketing"] } } });
    const el = (data: {
      id: string; activityId: string; elementName: string; purposeTagId: string | null;
      processorId: string | null; subjectType: string | null; requestState: string;
    }) => prisma.activityElement.create({ data });

    // Loan Application → 2 of 3 assigned (partial), one still awaiting DPO (blocks archive).
    await el({ id: "ae_pan", activityId: "pa_loan", elementName: "PAN Number", purposeTagId: purposeId("Regulatory compliance"), processorId: null, subjectType: "customer", requestState: "none" });
    await el({ id: "ae_phone", activityId: "pa_loan", elementName: "Phone Number", purposeTagId: purposeId("Marketing communication"), processorId: hasSms ? "proc_smsdraft" : null, subjectType: "customer", requestState: "none" }); // proc_smsdraft = draft DPA → "No DPA on file"
    await el({ id: "ae_income", activityId: "pa_loan", elementName: "Income Details", purposeTagId: null, processorId: null, subjectType: "customer", requestState: "requested" });

    // Marketing Campaigns → fully assigned; one cross-border, one full-lawful-chain internal.
    await el({ id: "ae_email", activityId: "pa_marketing", elementName: "Email Address", purposeTagId: purposeId("Marketing communication"), processorId: hasEmail ? "proc_email" : null, subjectType: "customer", requestState: "none" }); // proc_email = US → cross-border
    await el({ id: "ae_device", activityId: "pa_marketing", elementName: "Device fingerprint", purposeTagId: purposeId("Fraud prevention"), processorId: null, subjectType: "customer", requestState: "none" }); // internal, legitimate use, 365 days
    console.log("patch-datamap: processing-activity demo elements reconciled.");
  }

  await seedElementHistory();
  console.log("patch-datamap: processing activities ensured.");
}

/**
 * One ruled purpose-request escalation for the Device fingerprint element, so its
 * "View history" timeline has a real request→approval to show (who requested,
 * who approved, prior values, timestamps). Seeded once.
 */
async function seedElementHistory() {
  if ((await prisma.activityElement.count({ where: { id: "ae_device" } })) === 0) return;
  const existing = await prisma.escalation.findFirst({ where: { type: "purpose_request", contextJson: { contains: "ae_device" } }, select: { id: true } });
  if (existing) return;
  const dpo = await prisma.actor.findFirst({ where: { role: "dpo" }, select: { id: true } });
  const now = Date.now();
  await prisma.escalation.create({
    data: {
      type: "purpose_request",
      sourceRole: "admin",
      targetRole: "dpo",
      referenceCode: "ESC-2026-0042",
      reason: "New purpose “Fraud prevention” for “Device fingerprint” in Marketing Campaigns",
      contextJson: JSON.stringify({
        elementId: "ae_device",
        elementName: "Device fingerprint",
        activity: "Marketing Campaigns",
        existingPurposeTagId: null,
        proposedPurposeName: "Fraud prevention",
        processorId: null,
        proposedRetention: "365 days",
        proposedLawfulBasis: "legitimate_use",
      }),
      status: "ruled",
      ruling: "approve_override",
      rulingRationale: "Legitimate-use basis accepted for fraud prevention; 365-day retention approved.",
      ruledByActorId: dpo?.id ?? null,
      ruledAt: new Date(now - 1000 * 60 * 60 * 24 * 12),
      createdAt: new Date(now - 1000 * 60 * 60 * 24 * 14),
    },
  });
  console.log("patch-datamap: seeded element history escalation for ae_device.");
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
  await backfillGovernanceAttrs();
  await seedActivities();
  await seedSources();
  await seedRopaSuggestions();
  await backfillFlowNodeRefs();
}

/**
 * Backfill the DPO-owned attributes the Processing Activities register now reads
 * — retention + lawful basis on each approved purpose, and jurisdiction on each
 * processor — onto DBs seeded before those columns existed. Matched by the stable
 * seed name; only fills a value that is still null, so a human edit is never
 * overwritten. Also ensures the draft-DPA demo processor exists.
 */
async function backfillGovernanceAttrs() {
  const purposeAttrs: Record<string, { retention: string; lawfulBasis: string }> = {
    "Account servicing": { retention: "Account relationship + 8 years", lawfulBasis: "contractual" },
    "Regulatory compliance": { retention: "5 years after relationship ends", lawfulBasis: "legitimate_use" },
    "Fraud prevention": { retention: "365 days", lawfulBasis: "legitimate_use" },
    "Marketing communication": { retention: "Until consent withdrawn", lawfulBasis: "consent" },
    "Service improvement": { retention: "180 days", lawfulBasis: "legitimate_use" },
    "Grievance redressal": { retention: "3 years from closure", lawfulBasis: "legitimate_use" },
  };
  for (const [name, a] of Object.entries(purposeAttrs)) {
    await prisma.purposeTag.updateMany({
      where: { name, OR: [{ retention: null }, { lawfulBasis: null }] },
      data: { retention: a.retention, lawfulBasis: a.lawfulBasis },
    });
  }

  const jurisdictions: Record<string, string> = {
    "Sendwave (email delivery)": "US",
    "Metriq Analytics": "IN",
    "Chitra Print & Mail": "IN",
  };
  for (const [name, j] of Object.entries(jurisdictions)) {
    await prisma.dataProcessor.updateMany({ where: { name, jurisdiction: null }, data: { jurisdiction: j } });
  }

  // The draft-DPA processor drives the "No DPA on file" state; ensure it exists.
  if ((await prisma.dataProcessor.count({ where: { id: "proc_smsdraft" } })) === 0) {
    await prisma.dataProcessor.create({
      data: { id: "proc_smsdraft", name: "PingText SMS", dpaId: "DPA-2026-DRAFT-07", dpaScopeJson: JSON.stringify(["contact"]), contactChannel: "portal", dpaStatus: "draft", jurisdiction: "IN" },
    });
  }
  console.log("patch-datamap: governance attributes backfilled.");
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
