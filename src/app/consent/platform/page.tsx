import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { Card, PageHead, Pill, Stat, formatDate, formatDateTime } from "@/components/ui";
import {
  ApiConfigForm,
  WebhookTable,
  ConsentImport,
  ExpiryRuleBuilder,
} from "@/components/consentPlatform";
import { CHANNEL_ORIGIN_LABEL } from "@/lib/domain";

export const dynamic = "force-dynamic";

const TABS = ["setup", "distribution", "verification"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  setup: "Setup",
  distribution: "Distribution",
  verification: "Verification",
};

export default async function ConsentPlatformPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(params.tab ?? "") ? (params.tab as Tab) : "setup";

  const [config, webhooks, purposes, records] = await Promise.all([
    db.consentApiConfig.findUnique({ where: { id: "singleton" } }),
    db.webhook.findMany({ orderBy: { createdAt: "asc" } }),
    db.purposeTag.findMany({ where: { status: "approved" }, orderBy: { name: "asc" } }),
    db.consentRecord.findMany({ include: { purposeTag: true }, orderBy: { collectedAt: "desc" } }),
  ]);

  const withHash = records.filter((r) => r.artifactHash).length;

  return (
    <Shell active="/consent" title="Consent & Notices / Consent platform">
      <PageHead
        title="Consent platform"
        titleTip="The consent API, its distribution to downstream systems, and verification of the artifacts it produces."
      />

      <nav className="stepper">
        {TABS.map((t) => (
          <Link key={t} href={`/consent/platform?tab=${t}`} className={`step${t === tab ? " active" : ""}`}>
            <span className="step-label">{TAB_LABEL[t]}</span>
          </Link>
        ))}
      </nav>

      {tab === "setup" && (
        <Card title="Universal Consent API">
          <ApiConfigForm
            apiEndpoint={config?.apiEndpoint ?? ""}
            brand={config?.preferenceCenterBrand ?? ""}
            isolation={config?.businessUnitIsolation ?? false}
            expiryMonths={config?.defaultExpiryMonths ?? 24}
          />
        </Card>
      )}

      {tab === "distribution" && (
        <div className="stack">
          <Card title="Webhooks">
            <WebhookTable
              webhooks={webhooks.map((w) => ({
                id: w.id,
                endpoint: w.endpoint,
                event: w.event,
                status: w.status,
                lastTestResult: w.lastTestResult,
                lastTestAt: w.lastTestAt ? formatDateTime(w.lastTestAt) : null,
              }))}
            />
          </Card>
          <Card title="Multi-language notice generator">
            <p className="cell-sub" style={{ marginTop: 0 }}>
              Generate consent-notice copy across Eighth Schedule languages from a
              single source. Managed per notice on the{" "}
              <Link href="/consent/notices" className="row-link">
                Notices
              </Link>{" "}
              language-variants tab.
            </p>
          </Card>
        </div>
      )}

      {tab === "verification" && (
        <div className="stack">
          <div className="stat-row">
            <Stat label="Consent records" value={records.length} />
            <Stat label="With integrity hash" value={withHash} tone={withHash === records.length ? "green" : "yellow"} />
          </div>

          <Card title="Consent artifact integrity">
            <p className="cell-sub" style={{ marginTop: 0 }}>
              Every consent artifact is hashed on capture (MeitY Electronic
              Consent Framework). A record without a hash has not been sealed —
              usually an offline capture still pending sync.
            </p>
            <div className="table-wrap">
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Purpose</th>
                    <th>Channel</th>
                    <th>Collected</th>
                    <th>Integrity</th>
                  </tr>
                </thead>
                <tbody>
                  {records.slice(0, 25).map((r) => (
                    <tr key={r.id}>
                      <td className="mono cell-primary">{r.subjectRef}</td>
                      <td className="cell-sub">{r.purposeTag?.name ?? "—"}</td>
                      <td>
                        <Pill tone={r.channelOrigin === "branch" ? "purple" : "gray"} dot={false}>
                          {CHANNEL_ORIGIN_LABEL[r.channelOrigin] ?? r.channelOrigin}
                        </Pill>
                      </td>
                      <td className="cell-sub">{formatDate(r.collectedAt)}</td>
                      <td>
                        {r.artifactHash ? (
                          <span className="row" style={{ gap: 5 }}>
                            <Pill tone="green">Sealed</Pill>
                            <span className="mono cell-sub">{r.artifactHash}</span>
                          </span>
                        ) : (
                          <Pill tone="yellow">Unsealed</Pill>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Consent expiry rules">
            <ExpiryRuleBuilder months={config?.defaultExpiryMonths ?? 24} />
          </Card>

          <Card title="Bulk consent import">
            <ConsentImport purposes={purposes.map((p) => ({ id: p.id, name: p.name }))} />
          </Card>
        </div>
      )}
    </Shell>
  );
}
