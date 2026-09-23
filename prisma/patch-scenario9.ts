/**
 * Scenario 9 (cookie compliance) demo — idempotent. Seeds a scan-schedule
 * singleton and, if no script findings exist yet, two flagged findings from
 * different trigger sources (manual + scheduled) so the trigger-source tag is
 * visible immediately on the Script Compliance Scan screen.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-scenario9: no DATABASE_URL, skipping."); return; }

  if (!(await prisma.cookieScanSchedule.findUnique({ where: { id: "cookie" } }))) {
    await prisma.cookieScanSchedule.create({ data: { id: "cookie", cadence: "on_demand", updatedBy: "seed" } });
    console.log("patch-scenario9: seeded cookie scan schedule.");
  }

  if ((await prisma.cookieScanFinding.count()) === 0) {
    await prisma.cookieScanFinding.create({
      data: { scriptName: "hotjar.js", vendor: "Hotjar", page: "/checkout", disclosed: false, autoBlocked: true, triggerSource: "manual", status: "blocked", suggestedCategory: "Analytics", technicalDetail: "Undisclosed analytics tag not declared in the cookie policy; auto-blocked pending categorisation." },
    });
    await prisma.cookieScanFinding.create({
      data: { scriptName: "doubleclick.net/gpt.js", vendor: "Google", page: "/", disclosed: true, firedBeforeConsent: true, autoBlocked: true, triggerSource: "scheduled", status: "blocked", suggestedCategory: "Advertising", technicalDetail: "Advertising script executed before the consent event was recorded for the session." },
    });
    console.log("patch-scenario9: seeded manual + scheduled script findings.");
  }

  console.log("patch-scenario9: done.");
}

main().catch((e) => console.error("patch-scenario9 failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
