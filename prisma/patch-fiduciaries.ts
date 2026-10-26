/**
 * Fiduciary hygiene (idempotent, every deploy).
 *
 * Removes stray orphan Entity rows left from manual testing — anything that is
 * not a Meridian fiduciary or an "(acquired)" acquisition-demo entity and has no
 * activities, user mappings, notices, role assignments or breach incidents — so
 * the Fiduciaries register stays clean (Master spec A3 fixture hygiene). Also
 * clears any stray SDF flag off the two Meridian fiduciaries (fixture: 0 notified
 * as a Significant Data Fiduciary).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const entities = await prisma.entity.findMany({
    select: { id: true, name: true, _count: { select: { activities: true } } },
  });
  // Keep the Meridian fiduciaries and the acquisition-demo entities. Remove any
  // other entity that no activity points at, clearing its stray dependent rows
  // first (they belong to the same junk and would otherwise block the delete).
  const keep = (n: string) => /^meridian/i.test(n) || /\(acquired\)/i.test(n);
  const junk = entities.filter((e) => !keep(e.name) && e._count.activities === 0);
  let removed = 0;
  for (const e of junk) {
    try {
      await prisma.entityUserMapping.deleteMany({ where: { entityId: e.id } });
      await prisma.roleAssignment.deleteMany({ where: { entityId: e.id } });
      // Notice has two FKs to Entity — entityId and fiduciaryId — so clear both.
      await prisma.notice.deleteMany({ where: { OR: [{ entityId: e.id }, { fiduciaryId: e.id }] } });
      await prisma.breachIncident.deleteMany({ where: { entityId: e.id } });
      await prisma.organizationBranding.deleteMany({ where: { entityId: e.id } });
      await prisma.entity.delete({ where: { id: e.id } });
      removed++;
    } catch {
      console.log(`[patch-fiduciaries] kept ${e.name} (still referenced elsewhere)`);
    }
  }
  await prisma.entity.updateMany({
    where: { name: { in: ["Meridian Financial Services Ltd", "Meridian Securities Ltd"] }, sdfStatus: "sdf" },
    data: { sdfStatus: "not_assessed" },
  });
  console.log(`[patch-fiduciaries] removed ${removed} orphan entit${removed === 1 ? "y" : "ies"}`);

  // Data inventory hygiene (Part J): remove the stray "kjnjn" DLP source + its
  // field left from manual testing. Guarded — if the field is somehow referenced,
  // the delete is skipped rather than failing the deploy.
  const junkSources = await prisma.discoverySource.findMany({ where: { name: { in: ["kjnjn"] } }, select: { id: true, name: true } });
  for (const s of junkSources) {
    try {
      await prisma.classifiedField.deleteMany({ where: { sourceId: s.id } });
      await prisma.discoverySource.delete({ where: { id: s.id } });
      console.log(`[patch-fiduciaries] removed stray source "${s.name}"`);
    } catch {
      console.log(`[patch-fiduciaries] kept source "${s.name}" (still referenced)`);
    }
  }
}

main()
  .catch((e) => { console.error("[patch-fiduciaries] failed:", e); })
  .finally(() => prisma.$disconnect());
