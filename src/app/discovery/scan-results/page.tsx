import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, Stat } from "@/components/ui";
import { ScanResultsViewer, type Finding, type NewSource } from "@/components/discovery/ScanResultsViewer";

export const dynamic = "force-dynamic";

/** SCREEN 2 — Unified Scan Results Viewer. Findings across EVERY source type,
 *  grouped by risk (high expanded), with matched-rule reasoning, override,
 *  quarantine, and bulk-onboard of newly discovered sources. */
export default async function ScanResultsPage() {
  const [fields, newSources] = await Promise.all([
    db.classifiedField.findMany({ include: { source: { select: { name: true, kind: true, scanDepth: true } } }, orderBy: { sensitivityTier: "asc" }, take: 500 }),
    db.discoverySource.findMany({ where: { availableAsScanTarget: false }, orderBy: { name: "asc" }, take: 50 }),
  ]);

  const findings: Finding[] = fields.map((f) => ({
    id: f.id, fieldPath: f.fieldPath, sourceName: f.source.name, sourceKind: f.source.kind,
    detectedType: f.detectedType, effectiveType: f.overriddenType ?? f.detectedType, risk: f.sensitivityTier,
    matchedRule: f.matchedRule ?? `${f.detectedType} pattern · ${f.confidence === "high" ? "high confidence" : "needs review"}`,
    quarantined: f.quarantined, overridden: f.reviewState === "overridden",
    // Regular vs Deep is the source's scan depth; "new since last review" is a
    // field the reviewer hasn't actioned yet (still pending).
    scanType: f.source.scanDepth === "deep" ? "deep" : "regular",
    isNew: f.reviewState === "pending",
  }));
  const news: NewSource[] = newSources.map((s) => ({ id: s.id, name: s.name, kind: s.kind }));

  const high = findings.filter((f) => f.risk === "high").length;
  const quarantined = findings.filter((f) => f.quarantined).length;

  return (
    <Shell active="/discovery/scan-results" title="Data Map / Scan results">
      <PageHead title="Scan results" titleTip="Everything the scan found across databases, files and blob storage in one place, grouped by risk. Risk visibility never depends on which source type happened to be scanned." />
      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Findings" value={findings.length} />
        <Stat label="High risk" value={high} tone={high ? "red" : undefined} />
        <Stat label="Quarantined" value={quarantined} tone={quarantined ? "red" : undefined} />
        <Stat label="New sources" value={news.length} tone={news.length ? "yellow" : undefined} />
      </div>
      <ScanResultsViewer findings={findings} newSources={news} />
    </Shell>
  );
}
