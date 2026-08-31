import { Card, Citation, PageHead, PolicyLocked, Pill, formatDate } from "@/components/ui";
import { GateForm, GovernanceRetryPanel } from "@/components/onboardingForms";
import { getOnboarding } from "@/lib/engines/onboarding";
import {
  fetchGovernanceConfig,
  GovernancePortalUnreachableError,
  parseSim,
  type GovernanceConfig,
} from "@/lib/governance/portal";

export const dynamic = "force-dynamic";

/**
 * SCREEN 1 — Escalation & Retention Defaults. MANDATORY, no skip.
 *
 * Of the six candidate structures evaluated, the two rejected ones (free-order
 * checklist, defer-everything fast path) both share a failure: they let
 * escalation routing and retention awareness go silently unconfigured. That is
 * the exact failure mode the underlying audit exists to prevent, which is why
 * this screen has no skip control — not a discouraged one, none.
 *
 * The right panel is the first use of the policy-lock pattern. Retention
 * categories are the DPO's; Admin reads them here and implements against them
 * everywhere else.
 */
export default async function EscalationStep({
  searchParams,
}: {
  searchParams: Promise<{ sim?: string; retry?: string }>;
}) {
  const params = await searchParams;
  const sim = parseSim(params.sim);
  const state = await getOnboarding();

  let config: GovernanceConfig | null = null;
  let unreachable = false;
  try {
    config = await fetchGovernanceConfig(sim);
  } catch (error) {
    if (error instanceof GovernancePortalUnreachableError) unreachable = true;
    else throw error;
  }

  const retryHref = `/onboarding/escalation?retry=${Number(params.retry ?? 0) + 1}`;

  return (
    <div className="stack">
      <PageHead
        title="Escalation & retention defaults"
        subtitle="Two things have to be set before anything else: where a conflict goes when Admin cannot resolve it, and which statutory obligations override a deletion. Everything after this step can wait."
        actions={<Pill tone="red">Required — cannot be skipped</Pill>}
      />

      {unreachable ? (
        <Card title="Governance configuration">
          <GovernanceRetryPanel retryHref={retryHref} />
        </Card>
      ) : (
        <>
          <Card title="Routing and retention">
            <GateForm
              contacts={config!.contacts}
              categoryCount={config!.retentionCategories.length}
              noDpoAssigned={!config!.contacts.some((c) => c.role === "dpo")}
              noRetentionCategories={config!.retentionCategories.length === 0}
              governanceUnavailable={false}
              multiEntity={config!.multiEntity}
              initialContactId={state.escalationContactActorId}
              initialBackupId={state.backupContactActorId}
            />
          </Card>

          {config!.retentionCategories.length > 0 && (
            <Card title="Statutory retention categories">
              <PolicyLocked owner="DPO">
                <div className="table-wrap" style={{ border: "none" }}>
                  <table className="dtable">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Retention period</th>
                        <th>Statutory basis</th>
                        <th>Approved</th>
                      </tr>
                    </thead>
                    <tbody>
                      {config!.retentionCategories.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <div className="cell-stack">
                              <span className="cell-primary">{c.name}</span>
                              <span className="cell-sub">{c.description}</span>
                            </div>
                          </td>
                          <td className="mono">{c.retentionPeriod}</td>
                          <td>
                            <Citation citation={c.statuteRef} source="statute" />
                          </td>
                          <td className="cell-sub">
                            {c.approvedBy} · {formatDate(c.approvedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </PolicyLocked>
              <p className="cell-sub" style={{ marginTop: 10, marginBottom: 0 }}>
                A deletion request touching any of these categories will withhold
                the covered fields and erase the rest, rather than failing whole.
                Admin implements that; Admin does not decide it.
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
