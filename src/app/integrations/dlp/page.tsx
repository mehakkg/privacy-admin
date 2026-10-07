import Link from "next/link";
import { CheckCircle2, AlertTriangle, XCircle, Clock, ExternalLink } from "lucide-react";
import { Shell } from "@/components/Shell";
import { Card, PageHead, Notice } from "@/components/ui";
import { getDlpHealth } from "@/lib/engines/dlp";
import { DlpControls } from "@/components/integrations/DlpControls";
import { MovedNote } from "@/components/MovedNote";

export const dynamic = "force-dynamic";

/**
 * Settings › Integrations › DLP — the discovery source.
 *
 * Discovery, classification and scanning live in the DLP; Privacy Admin only
 * reads from it. This page owns the connection (status, scope, health, last
 * sync) that used to be "Sources" and "scan configuration". Acting on the data
 * happens in the DLP ("Open in DLP"); nothing is embedded here.
 */
const STATUS: Record<string, { icon: typeof CheckCircle2; label: string; tone: string }> = {
  connected: { icon: CheckCircle2, label: "Connected", tone: "var(--green)" },
  stale: { icon: Clock, label: "Data out of date", tone: "var(--yellow-700, #b45309)" },
  failed: { icon: AlertTriangle, label: "Last sync failed", tone: "var(--red)" },
  not_connected: { icon: XCircle, label: "Not connected", tone: "var(--red)" },
};

export default async function DlpIntegrationPage({ searchParams }: { searchParams: Promise<{ moved?: string }> }) {
  const [sp, health] = await Promise.all([searchParams, getDlpHealth()]);
  const s = STATUS[health.state];
  const Icon = s.icon;

  return (
    <Shell active="/integrations/dlp" title="Settings / Integrations / DLP">
      <PageHead
        crumbs={[{ label: "Settings", href: "/settings/organization" }, { label: "Integrations", href: "/integrations/dlp" }, { label: "DLP" }]}
        title="DLP"
        titleTip="The DLP is the discovery source. It finds and classifies personal data; Privacy Admin reads from it and never scans or classifies itself."
      />
      <MovedNote moved={sp.moved} />

      <div className="stack" style={{ gap: 16, maxWidth: 820 }}>
        <Card title="Connection">
          <div className="stack" style={{ gap: 12 }}>
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <Icon size={18} style={{ color: s.tone }} aria-hidden />
              <strong>{s.label}</strong>
              {health.lastSyncAt && <span className="cell-sub">· Last sync {health.lastSyncAgo}</span>}
            </div>
            {health.warnText && <div className="notice warn compact"><span>{health.warnText}. Discovery data may be incomplete until this is resolved.</span></div>}
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <a className="btn sm" href="#" aria-label="Open in DLP (opens the external DLP console)">Open in DLP <ExternalLink size={13} /></a>
              <span className="cell-sub">Classify, quarantine and scan settings are managed in the DLP.</span>
            </div>
            <DlpControls state={health.state} />
          </div>
        </Card>

        <Card title="Scope">
          <ul className="stack" style={{ gap: 6, margin: 0, paddingLeft: 18 }}>
            <li>Personal-data elements: location, data type, sensitivity label, last scanned, and changes.</li>
            <li>Metadata only — no sample values are read from the DLP.</li>
            <li>A personal-data flag and quarantine status, where the DLP exposes them.</li>
            <li>Systems the DLP discovers appear in Data inventory as a <strong>System</strong> column. Systems the DLP can&rsquo;t see are kept as <strong>Declared, not discovered</strong>.</li>
          </ul>
          <p className="cell-sub" style={{ marginTop: 8 }}>Sync interval: every {health.syncIntervalHours} hours. A sync older than this shows a warning on Data inventory.</p>
        </Card>

        <Card title="Related">
          <div className="stack" style={{ gap: 6 }}>
            <Link href="/integrations/connected-systems" className="row-link">Connected systems</Link>
            <Link href="/integrations/health-monitoring" className="row-link">Health monitoring</Link>
            <Link href="/integrations/data-processors" className="row-link">Data processors</Link>
          </div>
        </Card>

        <Notice tone="info" title="Discovery lives in the DLP">
          Sources and the Review queue were removed from Privacy Admin. Systems, unclassified fields and quarantine are now read from the DLP and surfaced in Data inventory; near-duplicate matching moved to Rights requests › Identity matching.
        </Notice>
      </div>
    </Shell>
  );
}
