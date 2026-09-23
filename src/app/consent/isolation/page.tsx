import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, formatDateTime } from "@/components/ui";
import { IsolationVerifier, type EntityOpt, type CheckRow } from "@/components/consentInfra/IsolationVerifier";

export const dynamic = "force-dynamic";

/** SCREEN 4 — Business-unit isolation verification (active cross-entity test). */
export default async function IsolationPage() {
  const [entities, counts, checks] = await Promise.all([
    db.entity.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.consentRecord.groupBy({ by: ["entityId"], _count: { _all: true } }),
    db.isolationCheck.findMany({ orderBy: { runAt: "desc" }, take: 10 }),
  ]);
  const countByEntity = new Map(counts.map((c) => [c.entityId, c._count._all]));
  const e: EntityOpt[] = entities.map((x) => ({ id: x.id, name: x.name, consentCount: countByEntity.get(x.id) ?? 0 }));
  const toRow = (c: (typeof checks)[number]): CheckRow => ({ id: c.id, runAt: formatDateTime(c.runAt), entityAName: c.entityAName, entityBName: c.entityBName, passed: c.passed, leakedCount: c.leakedCount, detail: c.detail });
  const latest = checks[0] ? toRow(checks[0]) : null;
  const history = checks.slice(1).map(toRow);

  return (
    <Shell active="/consent/isolation" title="Consent / Business-unit isolation">
      <PageHead title="Business-unit isolation verification" titleTip="Actively confirms one business unit cannot read another's consent data by running a real scoped query — not a schema assumption." />
      <IsolationVerifier entities={e} latest={latest} history={history} />
    </Shell>
  );
}
