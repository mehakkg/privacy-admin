/**
 * Scenario 3 demo — idempotent. Seeds the states the 8 screens need: a demo
 * customer with cross-module audit entries, evidence requests (incl. one at
 * "3 of 5 confirmed"), a clean deletion, a conflicted deletion, an escalated
 * one awaiting ruling, and a fully executed one with its linked 4-stage thread.
 *
 * Audit entries are appended with correct hash-chaining (the customer-centric
 * columns are not hashed), so verifyChain() stays green.
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();
const DAY = 86_400_000;
const GENESIS = "0".repeat(64);

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const s = v as Record<string, unknown>; const o: Record<string, unknown> = {};
    for (const k of Object.keys(s).sort()) o[k] = sortDeep(s[k]);
    return o;
  }
  if (v instanceof Date) return v.toISOString();
  return v;
}
function hashEntry(fields: unknown): string { return createHash("sha256").update(JSON.stringify(sortDeep(fields))).digest("hex"); }

async function appendAudit(e: { timestamp: Date; action: string; targetType: string; targetId: string; customerId: string; description: string; evidenceRef?: string | null; payload?: Record<string, unknown> }) {
  const last = await prisma.auditLogEntry.findFirst({ orderBy: { seq: "desc" }, select: { payloadHash: true } });
  const prevHash = last?.payloadHash ?? GENESIS;
  const fields = {
    timestamp: e.timestamp, actorLabel: "System", actorRole: "system", action: e.action,
    targetType: e.targetType, targetId: e.targetId, requestId: null,
    payloadJson: JSON.stringify(e.payload ?? null), evidenceRef: e.evidenceRef ?? null, prevHash,
  };
  return prisma.auditLogEntry.create({
    data: { ...fields, actorId: null, payloadHash: hashEntry(fields), customerId: e.customerId, sourceModule: e.action.split(".")[0], eventType: e.action, eventDescription: e.description },
    select: { id: true },
  });
}

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-audit: no DATABASE_URL, skipping."); return; }
  if ((await prisma.evidenceRequest.count()) > 0) { console.log("patch-audit: already seeded, skipping."); return; }

  const principals = await prisma.dataPrincipal.findMany({ orderBy: { displayName: "asc" } });
  if (principals.length < 2) { console.log("patch-audit: not enough principals, skipping."); return; }

  const flag = await prisma.retentionException.findFirst({ where: { reviewStatus: { in: ["unreviewed", "acknowledged", "upheld"] } }, include: { principal: true } });
  const conflictPrincipal = flag?.principal ?? principals[0];
  const evidencePrincipal = principals.find((p) => p.id !== conflictPrincipal.id) ?? principals[0];
  const cleanPrincipal = principals.find((p) => p.id !== conflictPrincipal.id && p.id !== evidencePrincipal.id) ?? evidencePrincipal;
  const now = Date.now();

  // 1) Cross-module audit trail for the evidence demo customer (3 modules).
  const evEntries: { id: string }[] = [];
  const spec = [
    { d: 55, action: "consent.granted", tt: "ConsentRecord", desc: "Marketing consent captured (digital)" },
    { d: 48, action: "consent.withdrawn", tt: "ConsentRecord", desc: "Marketing consent withdrawn by the principal" },
    { d: 40, action: "access.grant_created", tt: "SystemAccount", desc: "Support access to the CRM profile granted" },
    { d: 22, action: "breach.impact_added", tt: "BreachIncident", desc: "Principal included in a breach impact cohort" },
    { d: 10, action: "notice.served", tt: "Notice", desc: "Updated privacy notice served" },
  ];
  for (const s of spec) {
    const row = await appendAudit({ timestamp: new Date(now - s.d * DAY), action: s.action, targetType: s.tt, targetId: evidencePrincipal.id, customerId: evidencePrincipal.id, description: s.desc });
    evEntries.push(row);
  }

  // 2) Evidence requests — one at 3/5 confirmed (export disabled), one delivered.
  const req1 = await prisma.evidenceRequest.create({
    data: { requestedBy: "K. Menon (Grievance Officer)", customerId: evidencePrincipal.id, dateFrom: new Date(now - 90 * DAY), dateTo: new Date(now), claimedEvent: "The customer says they withdrew marketing consent but still received offers.", eventTypeHint: "consent", source: "api", status: "verifying" },
  });
  // 3 of 5 confirmed; the other two left undecided so Export stays disabled.
  for (let i = 0; i < 3; i++) {
    await prisma.evidenceEntryConfirmation.create({ data: { requestId: req1.id, logEntryId: evEntries[i].id, confirmed: true, isSuggested: i < 2, decidedBy: "K. Menon (Grievance Officer)" } });
  }
  await prisma.evidenceRequest.create({
    data: { requestedBy: "Admin", customerId: cleanPrincipal.id, dateFrom: new Date(now - 60 * DAY), dateTo: new Date(now), claimedEvent: "Access history requested for a grievance file.", source: "manual", status: "delivered", exportFormat: "pdf", deliveredAt: new Date(now - 2 * DAY) },
  });

  // 3) Clean deletion — no conflict, still queued and executable.
  await prisma.deletionInstruction.create({ data: { customerId: cleanPrincipal.id, scope: "Marketing profile only", source: "dsr:erasure", status: "queued", deadline: new Date(now + 20 * DAY) } });

  // Helper to build a conflicted instruction (+ conflict) for a principal.
  async function conflicted(scope: string, status: string) {
    const inst = await prisma.deletionInstruction.create({ data: { customerId: conflictPrincipal.id, scope, source: "dsr:erasure", status, deadline: new Date(now + 15 * DAY) } });
    await prisma.retentionConflict.create({
      data: {
        instructionId: inst.id,
        obligationDescription: `${flag?.dataCategory ?? "KYC"} data is under a statutory retention obligation (${flag?.legalBasis ?? "legal_obligation"}).`,
        obligationReference: flag?.statuteRef ?? "PMLA 2002 s.12 r/w PML Rules r.3",
        retentionExceptionId: flag?.id ?? null,
      },
    });
    return inst;
  }

  // 4) Conflicted, sitting at the Retention Conflict Block (only Escalate visible).
  await conflicted("All personal data", "conflict_detected");

  // 5) Escalated, awaiting a DPO ruling.
  const escInst = await conflicted("All personal data (full erasure)", "escalated");
  await prisma.conflictEscalation.create({
    data: {
      instructionId: escInst.id, actionRequested: "Proceed with erasure to the extent permissible, retaining only the KYC fields under legal hold.",
      obligationInConflict: `${flag?.dataCategory ?? "KYC"} data under ${flag?.statuteRef ?? "PMLA 2002 s.12"}`,
      supportingEvidenceJson: JSON.stringify([`Retention record: ${flag?.statuteRef ?? "PMLA 2002 s.12"}`, `Deletion instruction: ${escInst.id.slice(0, 10)}… (All personal data)`]),
      compiledBy: "R. Iyer (Admin)",
    },
  });

  // 6) Fully executed — ruling issued + executed, with the linked 4-stage thread.
  const doneInst = await conflicted("Erasure of contact + marketing data", "executed");
  await prisma.deletionInstruction.update({ where: { id: doneInst.id }, data: { executedAt: new Date(now - 1 * DAY), executedBy: "R. Iyer (Admin)" } });
  const doneEsc = await prisma.conflictEscalation.create({
    data: {
      instructionId: doneInst.id, actionRequested: "Proceed with erasure of contact and marketing data; retain KYC under legal hold.",
      obligationInConflict: `${flag?.dataCategory ?? "KYC"} data under ${flag?.statuteRef ?? "PMLA 2002 s.12"}`,
      supportingEvidenceJson: JSON.stringify([`Retention record: ${flag?.statuteRef ?? "PMLA 2002 s.12"}`, `Deletion instruction: ${doneInst.id.slice(0, 10)}…`]),
      compiledBy: "R. Iyer (Admin)", submittedAt: new Date(now - 4 * DAY),
    },
  });
  const doneRuling = await prisma.dPORuling.create({
    data: { escalationId: doneEsc.id, decision: "modify", reasoning: "Erasure may proceed for contact and marketing data; KYC records must be retained for the statutory period and are out of scope for this erasure.", legalBasis: "DPDP Act 2023 s.8(7) proviso; PMLA 2002 s.12", ruledBy: "S. Menon (DPO)", ruledAt: new Date(now - 2 * DAY) },
  });
  const threadRef = `THREAD-${doneInst.id.slice(-8)}`;
  await prisma.rulingExecution.create({ data: { rulingId: doneRuling.id, executedBy: "R. Iyer (Admin)", executedAt: new Date(now - 1 * DAY), threadRef } });
  // The linked audit pair — shared evidenceRef ties them into one thread.
  await appendAudit({ timestamp: new Date(now - 1 * DAY), action: "conflict.escalation_raised", targetType: "DeletionInstruction", targetId: doneInst.id, customerId: conflictPrincipal.id, description: "Retention conflict raised", evidenceRef: threadRef });
  await appendAudit({ timestamp: new Date(now - 1 * DAY), action: "conflict.resolution_executed", targetType: "DeletionInstruction", targetId: doneInst.id, customerId: conflictPrincipal.id, description: "Resolution executed per DPO ruling: modify", evidenceRef: threadRef });

  console.log("patch-audit: Scenario 3 demo seeded.");
}

main().catch((e) => console.error("patch-audit failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
