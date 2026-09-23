/**
 * Data Map consolidation demo — idempotent. Seeds manually-added sources so the
 * provenance distinction and the "no automated scan" state are visible next to
 * the existing DLP-synced sources without anyone having to run the Add flow.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function ensureManual(name: string, data: { kind: string; connectionState: string; scanSchedule: string; scanDepth: string; lastScanned: Date | null }) {
  const existing = await prisma.discoverySource.findUnique({ where: { name } });
  if (existing) {
    if (existing.provenance !== "manually_added") await prisma.discoverySource.update({ where: { id: existing.id }, data: { provenance: "manually_added" } });
    return;
  }
  await prisma.discoverySource.create({
    data: {
      name, kind: data.kind, provenance: "manually_added", dpoApprovedForScanning: true,
      connectionState: data.connectionState, scanStatus: data.lastScanned ? "scanned" : "pending",
      scanSchedule: data.scanSchedule, scanDepth: data.scanDepth, lastScanned: data.lastScanned,
    },
  });
}

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-manual-sources: no DATABASE_URL, skipping."); return; }

  // Manually added, NO live connection yet → "No automated scan" state.
  await ensureManual("Legacy Mainframe (manual)", { kind: "database", connectionState: "untested", scanSchedule: "on_demand", scanDepth: "standard", lastScanned: null });
  // Manually added WITH a live connection + configured cadence.
  await ensureManual("Regional CRM (manual)", { kind: "saas", connectionState: "connected", scanSchedule: "weekly", scanDepth: "deep", lastScanned: new Date(Date.now() - 4 * 86400000) });

  console.log("patch-manual-sources: ensured manually-added demo sources.");
}

main().catch((e) => console.error("patch-manual-sources failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
