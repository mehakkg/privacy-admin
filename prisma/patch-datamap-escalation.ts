/**
 * Data Map Screen 2 demo — idempotent. Seeds ONE open escalation referencing a
 * real Processing Activity (via contextJson, since Escalation has no activity FK)
 * so the activity's "pending escalation" badge is demonstrable and deep-links
 * into Escalations. Distinct from patch-datamap's element-history escalation,
 * which is already ruled.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-datamap-escalation: no DATABASE_URL, skipping."); return; }

  const existing = await prisma.escalation.findFirst({ where: { status: "open", type: "purpose_request" } });
  if (existing) { console.log("patch-datamap-escalation: an open purpose_request escalation already exists, skipping."); return; }

  const activity =
    (await prisma.processingActivity.findUnique({ where: { id: "pa_loan" }, include: { purposeSegments: { include: { purposeTag: true } } } })) ??
    (await prisma.processingActivity.findFirst({ include: { purposeSegments: { include: { purposeTag: true } } }, orderBy: { createdAt: "desc" } }));
  if (!activity) { console.log("patch-datamap-escalation: no activity to reference, skipping."); return; }

  const purposeName = activity.purposeSegments.find((s) => s.purposeTag)?.purposeTag?.name ?? null;
  await prisma.escalation.create({
    data: {
      sourceRole: "admin",
      targetRole: "dpo",
      type: "purpose_request",
      referenceCode: "ESC-2026-DM01",
      reason: `Purpose ambiguity blocking "${activity.activity}" — a DPO decision is needed before it can be finalised.`,
      contextJson: JSON.stringify({ activityId: activity.id, activityName: activity.activity, purposeName }),
      status: "open",
    },
  });
  console.log(`patch-datamap-escalation: seeded open escalation for "${activity.activity}".`);
}

main().catch((e) => console.error("patch-datamap-escalation failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
