/**
 * Data Map demo STATES — idempotent. Makes the spec's key visual states
 * demonstrable: a Failed source (with six consecutive TIMED_OUT ScanRuns, the
 * exact failure the Sources screen exists to surface), acquired-origin sources,
 * a Stale source, and a parent/subsidiary entity hierarchy.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function ensureSource(name: string, data: { kind: string; entityId: string | null; scanStatus: string; lastScanned: Date | null }) {
  const existing = await prisma.discoverySource.findUnique({ where: { name } });
  if (existing) return existing;
  return prisma.discoverySource.create({
    data: { name, kind: data.kind, dpoApprovedForScanning: true, scanStatus: data.scanStatus, connectionState: "connected", lastScanned: data.lastScanned, entityId: data.entityId },
  });
}

async function main() {
  if (!process.env.DATABASE_URL) { console.log("patch-datamap-states: no DATABASE_URL, skipping."); return; }

  const meridian = await prisma.entity.findFirst({ where: { source: "acquired", name: { contains: "Meridian" } } }) ?? await prisma.entity.findFirst({ where: { source: "acquired" } });
  const northgate = await prisma.entity.findFirst({ where: { source: "acquired", name: { contains: "Northgate" } } });

  // Failed + acquired source, with 6 consecutive failed scan runs (TIMED_OUT).
  const failedSrc = await ensureSource("Northgate CRM", { kind: "saas", entityId: northgate?.id ?? meridian?.id ?? null, scanStatus: "failed", lastScanned: new Date(Date.now() - 40 * 86400000) });
  if ((await prisma.scanRun.count({ where: { sourceId: failedSrc.id, status: "failed" } })) === 0) {
    for (let i = 0; i < 6; i++) {
      await prisma.scanRun.create({ data: { sourceId: failedSrc.id, status: "failed", startedAt: new Date(Date.now() - (i + 1) * 86400000), failureStage: "connect", failureReason: "TIMED_OUT — no response from host within 30s", failureAction: "Check network route and credentials, then retry." } });
    }
    console.log("patch-datamap-states: seeded failed source + 6 TIMED_OUT runs.");
  }

  // Healthy + acquired source, so the Acquired origin badge shows on a normal row.
  await ensureSource("Meridian Analytics", { kind: "cloud_storage", entityId: meridian?.id ?? null, scanStatus: "scanned", lastScanned: new Date(Date.now() - 3 * 86400000) });

  // Make one existing approved source Stale (no successful sync in > 30 days).
  const stale = await prisma.discoverySource.findFirst({ where: { name: "Finance File Share" } });
  if (stale && stale.dpoApprovedForScanning && stale.scanStatus !== "failed") {
    const age = stale.lastScanned ? Date.now() - stale.lastScanned.getTime() : 0;
    if (age < 31 * 86400000) await prisma.discoverySource.update({ where: { id: stale.id }, data: { lastScanned: new Date(Date.now() - 55 * 86400000), scanStatus: "scanned" } });
  }

  // Entity hierarchy: Northgate becomes a subsidiary of Meridian.
  if (northgate && meridian && !northgate.hierarchyParentId) {
    await prisma.entity.update({ where: { id: northgate.id }, data: { hierarchyParentId: meridian.id } });
    console.log("patch-datamap-states: nested Northgate under Meridian.");
  }

  console.log("patch-datamap-states: done.");
}

main().catch((e) => console.error("patch-datamap-states failed (continuing):", e)).finally(async () => { await prisma.$disconnect(); });
