import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, Stat, formatDateTime } from "@/components/ui";
import { ScriptScanViewer, type FlaggedScript, type CatOpt } from "@/components/consent/ScriptScanViewer";

export const dynamic = "force-dynamic";

/** SCREEN 8 — Script Compliance Scan. Flagged-only default list; undisclosed /
 *  pre-consent scripts auto-blocked. Same engine a scheduled trigger reuses. */
export default async function ScriptScanPage() {
  const [findings, categories, lastRun] = await Promise.all([
    db.cookieScanFinding.findMany({ orderBy: { firstSeen: "desc" }, take: 200 }),
    db.cookieCategory.findMany({ where: { status: "approved" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.auditLogEntry.findFirst({ where: { action: "cookie.scan_run" }, orderBy: { seq: "desc" }, select: { timestamp: true } }),
  ]);

  const flagged: FlaggedScript[] = findings
    .filter((f) => !f.disclosed || f.firedBeforeConsent || f.status === "blocked")
    .map((f) => ({ id: f.id, scriptName: f.scriptName, vendor: f.vendor, page: f.page, disclosed: f.disclosed, firedBeforeConsent: f.firedBeforeConsent, status: f.status, technicalDetail: f.technicalDetail, triggerSource: f.triggerSource, suggestedCategory: f.suggestedCategory }));
  const cats: CatOpt[] = categories;
  const blocked = flagged.filter((f) => f.status === "blocked").length;

  return (
    <Shell active="/consent/script-scan" title="Consent & Notices / Script compliance scan">
      <PageHead title="Script compliance scan" titleTip="Audits live scripts against the declared cookie policy, flagging undisclosed or pre-consent-firing scripts and auto-blocking them until categorised. Built once here; a scheduled trigger reuses the same engine." />
      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Flagged" value={flagged.filter((f) => f.status !== "categorised").length} tone={flagged.some((f) => f.status !== "categorised") ? "red" : "green"} />
        <Stat label="Auto-blocked" value={blocked} tone={blocked ? "red" : undefined} />
      </div>
      <ScriptScanViewer flagged={flagged} categories={cats} lastScan={lastRun?.timestamp ? formatDateTime(lastRun.timestamp) : null} />
    </Shell>
  );
}
