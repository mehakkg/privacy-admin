import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, formatDateTime } from "@/components/ui";
import { ExpiryEngine, type PurposeRow, type LogRow } from "@/components/consentInfra/ExpiryEngine";

export const dynamic = "force-dynamic";

/** SCREEN 8 — Consent auto-expiry & re-consent engine. */
export default async function ExpiryPage() {
  const [purposes, configs, log] = await Promise.all([
    db.purposeTag.findMany({ where: { status: "approved" }, orderBy: { name: "asc" }, select: { id: true, name: true, retention: true } }),
    db.purposeExpiryConfig.findMany(),
    db.consentExpiryLog.findMany({ orderBy: { processedAt: "desc" }, take: 40 }),
  ]);
  const behaviorByPurpose = new Map(configs.map((c) => [c.purposeTagId, c.behavior]));
  const p: PurposeRow[] = purposes.map((x) => ({ id: x.id, name: x.name, retention: x.retention, behavior: behaviorByPurpose.get(x.id) ?? "auto_withdraw" }));
  const l: LogRow[] = log.map((x) => ({ id: x.id, purposeName: x.purposeName, action: x.action, processedAt: formatDateTime(x.processedAt), detail: x.detail }));

  return (
    <Shell active="/consent/expiry" title="Consent / Auto-expiry">
      <PageHead title="Consent auto-expiry & re-consent" titleTip="Enforce the retention already set on each purpose — auto-withdraw or trigger re-consent at expiry. Never silent data loss; the artifact is preserved as history." />
      <ExpiryEngine purposes={p} log={l} />
    </Shell>
  );
}
