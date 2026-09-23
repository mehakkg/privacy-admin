import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, formatDateTime } from "@/components/ui";
import { PolicyReconsent, type VersionRow, type BatchLogRow } from "@/components/consentInfra/PolicyReconsent";

export const dynamic = "force-dynamic";

/** SCREEN 7 — Reconsent-on-policy-change: cookie-policy version publish triggers
 *  the existing re-consent engine for returning visitors. */
export default async function PolicyReconsentPage() {
  const [versions, log] = await Promise.all([
    db.cookiePolicyVersion.findMany({ orderBy: { publishedAt: "desc" }, take: 20 }),
    db.consentExpiryLog.findMany({ where: { action: "reconsent_policy_change" }, orderBy: { processedAt: "desc" }, take: 60 }),
  ]);
  const v: VersionRow[] = versions.map((x) => ({ id: x.id, version: x.version, summary: x.summary, publishedAt: formatDateTime(x.publishedAt), publishedBy: x.publishedBy, affectedCount: x.affectedCount }));
  const l: BatchLogRow[] = log.map((x) => ({ id: x.id, purposeName: x.purposeName, detail: x.detail, processedAt: formatDateTime(x.processedAt) }));

  return (
    <Shell active="/consent/policy-reconsent" title="Consent / Policy re-consent">
      <PageHead title="Reconsent on policy change" titleTip="When the cookie policy changes version, returning visitors are re-prompted under the new policy — reusing the existing re-consent engine, never silently continuing old consent." />
      <PolicyReconsent versions={v} log={l} />
    </Shell>
  );
}
