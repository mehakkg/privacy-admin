/**
 * DLP connection demo (idempotent). Discovery, classification and scanning live
 * in the DLP now; Privacy Admin only reads from it. Seed the IntegrationConfig
 * singleton so the default state is a healthy, recently-synced connection — the
 * Settings › Integrations › DLP page can switch it to preview the warnings.
 *
 * Only sets the last-sync time when it has never been set, so a demo-switched
 * state survives redeploys.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-dlp: no DATABASE_URL, skipping."); return; }
  const existing = await prisma.integrationConfig.findUnique({ where: { id: "singleton" } });
  if (existing?.dlpLastSyncAt) { console.log("patch-dlp: DLP state already set; leaving as-is."); return; }
  const twoHoursAgo = new Date(Date.now() - 1000 * 60 * 120);
  await prisma.integrationConfig.upsert({
    where: { id: "singleton" },
    update: { dlpConnected: true, dlpSyncFailed: false, dlpLastSyncAt: twoHoursAgo, dlpSyncIntervalHours: 24 },
    create: { id: "singleton", dlpConnected: true, dlpSyncFailed: false, dlpLastSyncAt: twoHoursAgo, dlpSyncIntervalHours: 24 },
  });
  console.log("patch-dlp: seeded DLP connection (connected, last sync 2h ago).");
}

main().catch((e) => console.error("patch-dlp failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
