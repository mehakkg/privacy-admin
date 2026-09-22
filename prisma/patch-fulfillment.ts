/**
 * Scenario 1 demo — idempotent. Seeds a RightsFulfillmentRequest mid-fulfilment
 * (linked to a shared DeletionInstruction) with the realistic mixed completion
 * state: 2 systems confirmed, 1 manual-verification-required, 1 failed (with a
 * FailedDeletionInvestigation carrying a real system error).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DAY = 86_400_000;

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-fulfillment: no DATABASE_URL, skipping."); return; }
  if ((await prisma.rightsFulfillmentRequest.count()) > 0) { console.log("patch-fulfillment: already seeded, skipping."); return; }

  const principals = await prisma.dataPrincipal.findMany({ orderBy: { displayName: "asc" } });
  if (principals.length === 0) { console.log("patch-fulfillment: no principals, skipping."); return; }
  const flag = await prisma.retentionException.findFirst({ where: { reviewStatus: { in: ["unreviewed", "acknowledged", "upheld"] } }, select: { principalId: true } });
  const subject = principals.find((p) => p.id !== flag?.principalId) ?? principals[0];
  const now = Date.now();

  const req = await prisma.rightsFulfillmentRequest.create({
    data: { source: "grievance_escalation", customerId: subject.id, deadline: new Date(now + 12 * DAY), status: "verifying", scopeConfirmedAt: new Date(now - 2 * DAY) },
  });
  // Shared DeletionInstruction (no conflict for this subject → clean gate).
  await prisma.deletionInstruction.create({
    data: { customerId: subject.id, scope: "All personal data", source: "dsr:erasure", status: "queued", deadline: new Date(now + 12 * DAY), fulfillmentRequestId: req.id },
  });

  const confirmed1 = await prisma.systemCompletionStatus.create({ data: { requestId: req.id, name: "Core Banking (Finacle)", systemType: "automated", status: "confirmed", confirmationReference: "DEL-9F2A11", decidedAt: new Date(now - 1 * DAY) } });
  const confirmed2 = await prisma.systemCompletionStatus.create({ data: { requestId: req.id, name: "CRM (Salesforce)", systemType: "automated", status: "confirmed", confirmationReference: "DEL-77C4E0", decidedAt: new Date(now - 1 * DAY) } });
  await prisma.systemCompletionStatus.create({ data: { requestId: req.id, name: "Legacy Loan Archive", systemType: "manual", status: "manual_verification_required" } });
  const failed = await prisma.systemCompletionStatus.create({ data: { requestId: req.id, name: "Marketing Automation", systemType: "automated", status: "failed", decidedAt: new Date(now - 1 * DAY) } });
  await prisma.failedDeletionInvestigation.create({
    data: { systemCompletionId: failed.id, errorDetail: "HTTP 502 from delete endpoint /v2/subjects/{id}: upstream connector timed out after 30s. Record not deleted; queue position retained.", attemptCount: 1 },
  });
  void confirmed1; void confirmed2;

  console.log("patch-fulfillment: Scenario 1 fulfilment demo seeded.");
}

main().catch((e) => console.error("patch-fulfillment failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
