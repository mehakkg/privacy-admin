import Link from "next/link";
import { db } from "@/lib/db";
import { Card, FieldChips, Notice, PageHead, Pill, Stat, formatDate } from "@/components/ui";
import { ProcessorForm, SourceForm, StepFooter } from "@/components/onboardingForms";
import { decodeList } from "@/lib/codec/json";
import { CONNECTION_STATUS_LABEL, type ConnectionStatus } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * SCREEN 5 — Connect Integrations & Processors. Skippable.
 *
 * Two tabs, deliberately NOT one list. An internal system and a Data Processor
 * are structurally different things: one is a connection we operate, the other
 * is a contractual relationship with someone else who processes on our behalf.
 * Merging them would mean losing the DPA — and s.8(2) turns on the DPA
 * existing, so it is not an attribute we can afford to flatten away.
 */
export default async function IntegrationsStep({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab === "processors" ? "processors" : "systems";

  const [systems, processors] = await Promise.all([
    db.connectedSystem.findMany({ orderBy: { name: "asc" } }),
    db.dataProcessor.findMany({ orderBy: { name: "asc" } }),
  ]);

  const drafts = processors.filter((p) => p.dpaStatus === "draft");

  return (
    <div className="stack">
      <PageHead
        title="Integrations & processors"
        subtitle="Internal systems we operate, and third parties who process on our behalf. Kept apart because only one of them has a contract that governs what we may instruct."
      />

      <div className="stat-row">
        <Stat label="Internal systems" value={systems.length} />
        <Stat label="Data Processors" value={processors.length} />
        <Stat
          label="DPA pending"
          value={drafts.length}
          tone={drafts.length ? "yellow" : undefined}
        />
      </div>

      <div className="row">
        <span className="section-label" style={{ margin: 0 }}>
          Tab
        </span>
        <Link
          href="/onboarding/integrations?tab=systems"
          className={`btn sm ${tab === "systems" ? "primary" : "ghost"}`}
        >
          Internal systems ({systems.length})
        </Link>
        <Link
          href="/onboarding/integrations?tab=processors"
          className={`btn sm ${tab === "processors" ? "primary" : "ghost"}`}
        >
          Data Processors ({processors.length})
        </Link>
      </div>

      {tab === "systems" ? (
        <>
          <Card title="Internal systems">
            {systems.length === 0 ? (
              <div className="empty">
                <p style={{ margin: "0 0 10px" }}>No internal systems connected.</p>
                <Link href="/onboarding/sources" className="btn primary sm">
                  Connect one
                </Link>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="dtable">
                  <thead>
                    <tr>
                      <th>System</th>
                      <th>Type</th>
                      <th>Connection</th>
                      <th>Execution</th>
                      <th>Owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systems.map((s) => (
                      <tr key={s.id}>
                        <td className="cell-primary">{s.name}</td>
                        <td className="cell-sub">{s.kind}</td>
                        <td>
                          <Pill
                            tone={
                              s.connectionStatus === "healthy"
                                ? "green"
                                : s.connectionStatus === "degraded"
                                  ? "yellow"
                                  : s.connectionStatus === "down"
                                    ? "red"
                                    : "gray"
                            }
                          >
                            {CONNECTION_STATUS_LABEL[s.connectionStatus as ConnectionStatus]}
                          </Pill>
                        </td>
                        <td>
                          <div className="cell-stack">
                            <span className="cell-sub">{s.executionMode}</span>
                            {!s.hasApi && (
                              <span className="cell-sub">
                                No API — manual verification
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="cell-sub">{s.ownerTeam}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Add an internal system">
            <SourceForm />
          </Card>
        </>
      ) : (
        <>
          {drafts.length > 0 && (
            <Notice
              tone="danger"
              title={`${drafts.length} processor${drafts.length === 1 ? "" : "s"} cannot be instructed yet`}
            >
              A draft DPA is a hard block, not a warning. DPDP s.8(2) permits a
              Processor to process personal data on our behalf only under a valid
              contract, so no deletion or access instruction can be dispatched
              until the DPA is executed. Registering them now is right — it means
              the record lives here rather than in someone&apos;s inbox while
              legal finishes.
            </Notice>
          )}

          <Card title="Data Processors">
            {processors.length === 0 ? (
              <div className="empty">
                No processors registered. Add one below, or skip and do it later
                from Integrations.
              </div>
            ) : (
              <div className="table-wrap">
                <table className="dtable">
                  <thead>
                    <tr>
                      <th>Processor</th>
                      <th>DPA</th>
                      <th>Channel</th>
                      <th>DPA covers</th>
                      <th>Sub-processors</th>
                      <th>Can be instructed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processors.map((p) => {
                      const scope = decodeList(p.dpaScopeJson);
                      const subs = decodeList(p.subProcessorsJson);
                      const draft = p.dpaStatus === "draft";
                      return (
                        <tr key={p.id}>
                          <td className="cell-primary">{p.name}</td>
                          <td>
                            <div className="cell-stack">
                              <span className="mono">{p.dpaId}</span>
                              {p.dpaExpiresAt && (
                                <span className="cell-sub">
                                  expires {formatDate(p.dpaExpiresAt)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="cell-sub">{p.contactChannel}</td>
                          <td>
                            {scope.length ? (
                              <FieldChips fields={scope} />
                            ) : (
                              <span className="cell-sub">Not yet scoped</span>
                            )}
                          </td>
                          <td className="cell-sub">
                            {subs.length ? subs.join(", ") : "None disclosed"}
                          </td>
                          <td>
                            <div className="cell-stack">
                              <Pill tone={draft ? "red" : "green"}>
                                {draft ? "Blocked — DPA pending" : "Yes"}
                              </Pill>
                              {draft && (
                                <span className="cell-sub">
                                  s.8(2) — no valid contract yet
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Register a Data Processor">
            <ProcessorForm />
          </Card>
        </>
      )}

      <StepFooter
        step={5}
        nextHref="/onboarding/routing"
        skippable
        skipLabel="Skip — I'll set these up later from Integrations"
      />
    </div>
  );
}
