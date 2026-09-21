/**
 * Breach Management demo — idempotent, seeded once. Produces the required states:
 * a live incident at ~60 hours elapsed (partial six-field package, processor
 * response received but NOT fiduciary-confirmed), plus one on-time and one overdue
 * submitted notification so the Trends dashboard has a mix.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const H = 3_600_000;

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-breach: no DATABASE_URL, skipping."); return; }
  if ((await prisma.breachIncident.count()) > 0) { console.log("patch-breach: incidents present, skipping."); return; }

  const entity = await prisma.entity.findFirst({ where: { id: "ent_meridian" }, select: { id: true } });
  const processor = await prisma.dataProcessor.findFirst({ where: { id: "proc_email" }, select: { id: true, name: true } })
    ?? await prisma.dataProcessor.findFirst({ select: { id: true, name: true } });
  const now = Date.now();

  // 1) Live incident at ~60h elapsed — processor-caused, partial package.
  const live = await prisma.breachIncident.create({
    data: {
      reference: "BR-2026-6001", detectedAt: new Date(now - 60 * H), reportedVia: "internal",
      category: "Unauthorized access", severity: "high", severityBasisJson: JSON.stringify({ volumeBand: 3, pii: 3, sens: 2, score: 18 }),
      status: "package_compiling", entityId: entity?.id ?? null, isProcessorCaused: Boolean(processor),
      reporterNote: "A misconfigured export on the marketing platform exposed customer contact records to an unauthorized third party.",
    },
  });
  if (processor) {
    await prisma.incidentImpactMapping.create({ data: { incidentId: live.id, elementName: "Email Address", processorId: processor.id } });
    await prisma.incidentImpactMapping.create({ data: { incidentId: live.id, elementName: "Phone Number", processorId: processor.id } });
    await prisma.processorBreachThread.create({
      data: { incidentId: live.id, processorId: processor.id, processorName: processor.name, outreachSentAt: new Date(now - 40 * H), remediationResponse: "Access revoked and the export endpoint disabled; audit log attached.", responseReceivedAt: new Date(now - 20 * H), fiduciaryConfirmed: false },
    });
  }
  await prisma.affectedPrincipalCohort.create({ data: { incidentId: live.id, principalIdsJson: JSON.stringify([]), count: 4120, snapshotTakenAt: new Date(now - 44 * H) } });
  await prisma.boardNotificationPackage.create({
    data: {
      incidentId: live.id, immediateDescription: "Unauthorized access to customer contact data via a marketing-platform export; ~4,120 principals; detected and contained same day.", immediateSentAt: new Date(now - 55 * H),
      updatedDescription: "Contact data (email, phone) for ~4,120 customers was exposed through a misconfigured export.",
      factsAndCircumstances: "The export was created for a campaign and left publicly reachable for ~6 hours.",
      compiledBy: "A. Khan", // remaining four fields deliberately blank — submission stays disabled
    },
  });

  // 2) On-time submitted (for Trends).
  const onTime = await prisma.breachIncident.create({
    data: { reference: "BR-2026-5001", detectedAt: new Date(now - 30 * 24 * H), reportedVia: "internal", category: "Misdirected email", severity: "medium", status: "closed", entityId: entity?.id ?? null, reporterNote: "Statement emailed to the wrong customer." },
  });
  await prisma.boardNotificationPackage.create({ data: { incidentId: onTime.id, updatedDescription: "x", factsAndCircumstances: "x", mitigationMeasures: "x", causeFindings: "x", remedialMeasures: "x", principalIntimationReport: "x", compiledBy: "A. Khan", approvedBy: "S. Menon", submittedAt: new Date(now - 30 * 24 * H + 40 * H) } });

  // 3) Overdue submitted (for Trends).
  const overdue = await prisma.breachIncident.create({
    data: { reference: "BR-2026-5002", detectedAt: new Date(now - 40 * 24 * H), reportedVia: "public_self_service", category: "Lost device", severity: "high", status: "closed", entityId: entity?.id ?? null, reporterNote: "An unencrypted laptop with a customer list was lost." },
  });
  await prisma.boardNotificationPackage.create({ data: { incidentId: overdue.id, updatedDescription: "x", factsAndCircumstances: "x", mitigationMeasures: "x", causeFindings: "x", remedialMeasures: "x", principalIntimationReport: "x", compiledBy: "A. Khan", approvedBy: "S. Menon", submittedAt: new Date(now - 40 * 24 * H + 90 * H) } });

  console.log("patch-breach: breach demo seeded.");
}

main().catch((e) => console.error("patch-breach failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
