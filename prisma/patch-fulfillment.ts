/**
 * Scenario 1 demo — idempotent. Seeds a deletion instruction mid-fulfilment with
 * the realistic mixed completion state: 2 systems confirmed, 1 needing manual
 * verification, 1 failed (with a real system error) so the investigation drawer
 * has something to show.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DAY = 86_400_000;

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-fulfillment: no DATABASE_URL, skipping."); return; }
  if ((await prisma.deletionSystemStatus.count()) > 0) { console.log("patch-fulfillment: already seeded, skipping."); return; }

  // A principal without an active retention conflict, so this is a clean flow.
  const principals = await prisma.dataPrincipal.findMany({ orderBy: { displayName: "asc" } });
  if (principals.length === 0) { console.log("patch-fulfillment: no principals, skipping."); return; }
  const flag = await prisma.retentionException.findFirst({ where: { reviewStatus: { in: ["unreviewed", "acknowledged", "upheld"] } }, select: { principalId: true } });
  const subject = principals.find((p) => p.id !== flag?.principalId) ?? principals[0];
  const now = Date.now();

  const inst = await prisma.deletionInstruction.create({
    data: { customerId: subject.id, scope: "All personal data", source: "dsr:erasure", status: "executed", deadline: new Date(now + 12 * DAY), scopeConfirmedAt: new Date(now - 2 * DAY), executedAt: new Date(now - 1 * DAY), executedBy: "R. Iyer (Admin)" },
  });

  await prisma.deletionSystemStatus.createMany({
    data: [
      { instructionId: inst.id, name: "Core Banking (Finacle)", kind: "automated", status: "confirmed", confirmationRef: "DEL-9F2A11", decidedAt: new Date(now - 1 * DAY) },
      { instructionId: inst.id, name: "CRM (Salesforce)", kind: "automated", status: "confirmed", confirmationRef: "DEL-77C4E0", decidedAt: new Date(now - 1 * DAY) },
      { instructionId: inst.id, name: "Legacy Loan Archive", kind: "manual", status: "manual_required" },
      { instructionId: inst.id, name: "Marketing Automation", kind: "automated", status: "failed", errorDetail: "HTTP 502 from delete endpoint /v2/subjects/{id}: upstream connector timed out after 30s. Record not deleted; queue position retained.", attemptCount: 1, decidedAt: new Date(now - 1 * DAY) },
    ],
  });

  console.log("patch-fulfillment: Scenario 1 fulfilment demo seeded.");
}

main().catch((e) => console.error("patch-fulfillment failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
