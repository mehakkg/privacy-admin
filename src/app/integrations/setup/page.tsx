import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, Pill, formatDate } from "@/components/ui";
import { IntegrationSetupForm } from "@/components/discovery/IntegrationSetupForm";
import { getDiscoveryGovernance } from "@/lib/engines/scenario4";

export const dynamic = "force-dynamic";

/** SCREEN 5 — Integration Setup & Drift Monitoring. Field mapping validated live
 *  against the CISO-approved schema (save blocked on out-of-schema), with drift
 *  monitoring enabled as part of the same connect action. */
export default async function IntegrationSetupPage() {
  const [{ cisoApprovedFields }, existing] = await Promise.all([
    getDiscoveryGovernance(),
    db.integrationConnection.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  return (
    <Shell active="/integrations/setup" title="Integrations / Setup">
      <PageHead title="Integration setup & drift monitoring" titleTip="Connect an integration with its field mapping validated live against CISO's approved schema, and drift monitoring for silent API changes enabled in the same flow — never an afterthought." />
      <IntegrationSetupForm approvedFields={cisoApprovedFields} />

      {existing.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 20 }}>
          <table className="dtable">
            <thead><tr><th>Integration</th><th>Vendor</th><th>Sync</th><th>Monitoring</th><th>Status</th><th>Connected</th></tr></thead>
            <tbody>
              {existing.map((c) => (
                <tr key={c.id}>
                  <td className="cell-primary">{c.name}</td>
                  <td className="cell-sub">{c.vendor}</td>
                  <td className="cell-sub">{c.syncFrequency}</td>
                  <td>{c.monitoringEnabled ? <Pill tone="green" dot={false}>Monitoring</Pill> : <Pill tone="gray" dot={false}>Off</Pill>}</td>
                  <td><Pill tone={c.status === "connected" ? "green" : "gray"} dot={false}>{c.status}</Pill></td>
                  <td className="cell-sub">{c.connectedAt ? formatDate(c.connectedAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="cell-sub" style={{ marginTop: 12 }}>Health monitoring for connected systems lives in <Link href="/integrations/health-monitoring">Integrations → Health monitoring</Link>.</p>
    </Shell>
  );
}
