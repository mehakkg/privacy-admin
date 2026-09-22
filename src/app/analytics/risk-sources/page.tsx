import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { RiskSourceConnector, type SourceOpt, type ConnectedSource } from "@/components/risk/RiskSourceConnector";

export const dynamic = "force-dynamic";

/** SCREEN 4 — Risk Analytics Data Source Connection. Connect a discovered
 *  source into the risk dashboard's pipeline with system-suggested metrics. */
export default async function RiskSourcesPage() {
  const [sources, connected] = await Promise.all([
    db.discoverySource.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, kind: true } }),
    db.riskAnalyticsSource.findMany({ orderBy: { connectedAt: "desc" } }),
  ]);
  const connectedIds = new Set(connected.map((c) => c.sourceId));
  const available: SourceOpt[] = sources.filter((s) => !connectedIds.has(s.id));
  const connectedRows: ConnectedSource[] = connected.map((c) => ({ id: c.id, name: c.name, kind: c.kind, metrics: (() => { try { return JSON.parse(c.defaultMetricsJson); } catch { return []; } })() }));

  return (
    <Shell active="/analytics/risk-sources" title="Risk & Compliance / Risk analytics sources">
      <PageHead title="Risk analytics sources" titleTip="Connect a discovered data source into the pipeline feeding the Risk dashboard, with a system-suggested default metric set based on the source type — editable before you confirm." />
      <RiskSourceConnector available={available} connected={connectedRows} />
      <p className="cell-sub" style={{ marginTop: 12 }}>Connected feeds surface on the <Link href="/analytics/risk">Risk dashboard</Link>.</p>
    </Shell>
  );
}
