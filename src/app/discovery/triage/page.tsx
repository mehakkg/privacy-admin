import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, formatDate, formatDateTime, Notice } from "@/components/ui";
import { TriageReview } from "@/components/triageReview";
import { DuplicateReview, type DupRow } from "@/components/duplicateReview";
import { ScriptScanViewer, type FlaggedScript, type CatOpt } from "@/components/consent/ScriptScanViewer";

export const dynamic = "force-dynamic";

/**
 * SCREEN 4 — Review Queue. Four structurally different decisions never share one
 * undifferentiated list: each finding type is its own tab, and each tab reuses
 * its originating screen's action component exactly (classification override,
 * quarantine gate, near-duplicate merge, script categorize). Defaults to
 * unactioned findings; "Show all history" is an explicit toggle.
 */
const TABS = [
  { key: "unclassified", label: "Unclassified fields" },
  { key: "quarantine", label: "Quarantine candidates" },
  { key: "duplicates", label: "Near-duplicates" },
  { key: "scripts", label: "Undisclosed scripts" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; all?: string }>;
}) {
  const params = await searchParams;
  const type: TabKey = (TABS.map((t) => t.key) as string[]).includes(params.type ?? "") ? (params.type as TabKey) : "unclassified";
  const showAll = params.all === "1";

  // Unactioned counts for the tab badges (the default scope).
  const [triageCounts, dupOpen, scriptOpen] = await Promise.all([
    db.triageItem.groupBy({ by: ["type"], where: { status: "open" }, _count: true }),
    db.duplicatePair.count({ where: { resolution: "unresolved" } }),
    db.cookieScanFinding.count({ where: { status: { in: ["open", "blocked"] } } }),
  ]);
  const triageCount = (t: string) => triageCounts.find((c) => c.type === t)?._count ?? 0;
  const badge: Record<TabKey, number> = {
    unclassified: triageCount("new_pii"),
    quarantine: triageCount("quarantine"),
    duplicates: dupOpen,
    scripts: scriptOpen,
  };

  return (
    <Shell active="/discovery" title="Discovery / Review queue">
      <PageHead
        crumbs={[{ label: "Data Discovery", href: "/discovery" }, { label: "Review queue" }]}
        title="Review queue"
        titleTip="Everything flagged for a decision, separated by finding type so you never context-switch between four kinds of judgement in one list. Defaults to what's new since your last review."
        actions={
          <div className="row" style={{ gap: 4 }}>
            <Link href={`/discovery/triage?type=${type}`} className={`btn xs ${showAll ? "ghost" : "primary"}`}>New / unactioned</Link>
            <Link href={`/discovery/triage?type=${type}&all=1`} className={`btn xs ${showAll ? "primary" : "ghost"}`}>Show all history</Link>
          </div>
        }
      />

      <nav className="stepper" style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <Link key={t.key} href={`/discovery/triage?type=${t.key}${showAll ? "&all=1" : ""}`} className={`step${t.key === type ? " active" : ""}`}>
            <span className="step-label">{t.label} ({badge[t.key]})</span>
          </Link>
        ))}
      </nav>

      {type === "unclassified" && <UnclassifiedTab showAll={showAll} />}
      {type === "quarantine" && <QuarantineTab showAll={showAll} />}
      {type === "duplicates" && <DuplicatesTab showAll={showAll} />}
      {type === "scripts" && <ScriptsTab showAll={showAll} />}
    </Shell>
  );
}

async function triageRows(triageType: string, showAll: boolean) {
  const items = await db.triageItem.findMany({
    where: { type: triageType, ...(showAll ? {} : { status: "open" }) },
    include: { field: { include: { source: true } }, duplicatePair: { include: { fieldA: true, fieldB: true } } },
    orderBy: { createdAt: triageType === "new_pii" ? "desc" : "asc" },
    take: 100,
  });
  return items.map((item) => ({
    id: item.id,
    type: item.type,
    label: item.field?.fieldPath ?? item.id,
    sourceName: item.field?.source.name ?? null,
    priority: item.priority,
    raised: formatDate(item.createdAt),
    note: item.note,
    crossRefType: item.crossRefType,
    driftFlag: item.field?.driftFlag ?? false,
    field: item.field ? { id: item.field.id, detectedType: item.field.detectedType, maskedSample: item.field.maskedSample, previousType: item.field.previousType } : null,
    resolveHref: null,
  }));
}

async function UnclassifiedTab({ showAll }: { showAll: boolean }) {
  const rows = await triageRows("new_pii", showAll);
  if (rows.length === 0) return <Notice tone="ok" title="No unclassified fields to review">Every newly discovered field has been classified.</Notice>;
  return <TriageReview rows={rows} />;
}

async function QuarantineTab({ showAll }: { showAll: boolean }) {
  const rows = await triageRows("quarantine", showAll);
  if (rows.length === 0) return <Notice tone="ok" title="No quarantine candidates">Nothing is awaiting a quarantine decision.</Notice>;
  return <TriageReview rows={rows} />;
}

async function DuplicatesTab({ showAll }: { showAll: boolean }) {
  const pairs = await db.duplicatePair.findMany({
    where: showAll ? {} : { resolution: "unresolved" },
    include: { fieldA: { include: { source: true } }, fieldB: { include: { source: true } } },
    orderBy: [{ resolution: "asc" }, { similarityScore: "desc" }],
    take: 100,
  });
  if (pairs.length === 0) return <Notice tone="ok" title="No near-duplicate pairs">No fields look like the same data held twice.</Notice>;
  const side = (f: { id: string; fieldPath: string; detectedType: string; maskedSample: string; lastVerified: Date | null; source: { name: string } }) => ({
    id: f.id, fieldPath: f.fieldPath, sourceName: f.source.name, detectedType: f.detectedType, maskedSample: f.maskedSample, lastVerified: f.lastVerified ? formatDate(f.lastVerified) : null,
  });
  const rows: DupRow[] = pairs.map((p) => ({ id: p.id, similarityScore: p.similarityScore, resolution: p.resolution, matchReason: p.matchReason, a: side(p.fieldA), b: side(p.fieldB) }));
  return <DuplicateReview rows={rows} />;
}

async function ScriptsTab({ showAll }: { showAll: boolean }) {
  const [findings, categories, lastRun] = await Promise.all([
    db.cookieScanFinding.findMany({ orderBy: { firstSeen: "desc" }, take: 200 }),
    db.cookieCategory.findMany({ where: { status: "approved" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.auditLogEntry.findFirst({ where: { action: "cookie.scan_run" }, orderBy: { seq: "desc" }, select: { timestamp: true } }),
  ]);
  const flagged: FlaggedScript[] = findings
    .filter((f) => showAll || !f.disclosed || f.firedBeforeConsent || f.status === "blocked")
    .map((f) => ({ id: f.id, scriptName: f.scriptName, vendor: f.vendor, page: f.page, disclosed: f.disclosed, firedBeforeConsent: f.firedBeforeConsent, status: f.status, technicalDetail: f.technicalDetail, triggerSource: f.triggerSource, suggestedCategory: f.suggestedCategory }));
  const cats: CatOpt[] = categories;
  return <ScriptScanViewer flagged={flagged} categories={cats} lastScan={lastRun?.timestamp ? formatDateTime(lastRun.timestamp) : null} />;
}
