import { db } from "@/lib/db";
import { Card, Notice, PageHead, Pill, Stat } from "@/components/ui";
import { SourceForm, StepFooter } from "@/components/onboardingForms";
import {
  CONNECTION_STATE_LABEL,
  SOURCE_KIND_LABEL,
  type ConnectionState,
  type SourceKind,
} from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * SCREEN 2 — Connect Data Sources. Skippable.
 *
 * The skip is labelled as a deferral with a destination, not a dismissal:
 * someone without credentials to hand is doing the right thing by deferring,
 * and the label should not make that feel like giving up.
 *
 * Test-connection failures are three-part — what failed, why, what to do next —
 * and distinguish credentials rejected / host unreachable / insufficient
 * permissions, because those three have completely different fixes and
 * different people to ask.
 */
export default async function SourcesStep() {
  const sources = await db.discoverySource.findMany({ orderBy: { name: "asc" } });

  const connected = sources.filter((s) => s.connectionState === "connected");
  const failed = sources.filter((s) => s.connectionState === "failed");
  const empty = sources.filter((s) => s.connectionState === "connected_no_data");

  return (
    <div className="stack">
      <PageHead
        title="Connect data sources"
        subtitle="Where personal data actually lives. Nothing is scanned at this step — this only establishes that we can reach each system."
      />

      <div className="stat-row">
        <Stat label="Sources added" value={sources.length} />
        <Stat label="Connected" value={connected.length} tone={connected.length ? "green" : undefined} />
        <Stat label="Connected, no data" value={empty.length} tone={empty.length ? "yellow" : undefined} />
        <Stat label="Failed" value={failed.length} tone={failed.length ? "red" : undefined} />
      </div>

      {sources.length > 0 && (
        <Card title="Sources">
          <div className="table-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>State</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="cell-stack">
                        <span className="cell-primary">{s.name}</span>
                        {s.requiresManualVerification && (
                          <span className="cell-sub">
                            Custom source — needs manual verification
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="cell-sub">
                      {SOURCE_KIND_LABEL[s.kind as SourceKind]}
                    </td>
                    <td>
                      <Pill
                        tone={
                          s.connectionState === "connected"
                            ? "green"
                            : s.connectionState === "connected_no_data"
                              ? "yellow"
                              : s.connectionState === "failed"
                                ? "red"
                                : "gray"
                        }
                      >
                        {CONNECTION_STATE_LABEL[s.connectionState as ConnectionState]}
                      </Pill>
                    </td>
                    <td style={{ maxWidth: 420 }}>
                      {s.connectionState === "failed" ? (
                        <div className="cell-stack">
                          <code className="field-chip" style={{ margin: 0, color: "var(--red)" }}>
                            {s.failureCode}
                          </code>
                          <span className="cell-sub">{s.failureDetail}</span>
                          <span className="cell-sub" style={{ fontWeight: 500 }}>
                            {s.connectionHint}
                          </span>
                        </div>
                      ) : (
                        <span className="cell-sub">{s.connectionHint ?? "—"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {empty.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Notice tone="warn" title="Connected, but no accessible data found">
                Not a failure — the connection works. It usually means the
                service account can sign in but has no read grant on the schemas
                holding personal data, so a scan would come back empty and look
                like a clean result. Check permissions before scanning.
              </Notice>
            </div>
          )}
        </Card>
      )}

      <Card title="Add a source">
        <SourceForm />
      </Card>

      <StepFooter
        step={2}
        nextHref="/onboarding/scan"
        skippable
        primaryLabel={
          sources.length > 0 ? "Continue" : "Continue without sources"
        }
        skipLabel="Skip — I'll connect sources later from Integrations"
      />
    </div>
  );
}
