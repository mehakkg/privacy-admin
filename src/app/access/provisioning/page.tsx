import { db } from "@/lib/db";
import {
  Card,
  FieldChips,
  Notice,
  PageHead,
  Pill,
  Stat,
  formatDate,
} from "@/components/ui";
import { GrantForm } from "@/components/accessActions";
import { analyseGrant } from "@/lib/engines/access";
import { decodeList } from "@/lib/codec/json";
import { EMPLOYMENT_STATUS_LABEL, type EmploymentStatus } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * SCREEN 1 (Scenario 2) — Provisioning Panel
 *
 * Least-privilege role templates and scoped, multi-system grants.
 *
 * "Least privilege" is only meaningful if something checks it, so a grant
 * carries the data categories it can actually reach, and the server refuses a
 * scope wider than the role's CISO-approved baseline. Existing over-broad grants
 * are surfaced here rather than left for an annual review to find.
 */
export default async function ProvisioningPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const params = await searchParams;

  const [accounts, roles] = await Promise.all([
    db.systemAccount.findMany({
      where: { status: { in: ["active", "disabled"] } },
      include: {
        user: true,
        system: true,
        grants: { where: { revokedAt: null }, include: { role: true } },
      },
      orderBy: { username: "asc" },
    }),
    db.rBACRole.findMany({ orderBy: [{ isTemplate: "desc" }, { name: "asc" }] }),
  ]);

  const selected =
    accounts.find((a) => a.id === params.account) ?? accounts[0] ?? null;

  const analyses = accounts.flatMap((account) =>
    account.grants.map((grant) => ({
      account,
      grant,
      analysis: analyseGrant(grant, grant.role),
    })),
  );
  const overBroad = analyses.filter((a) => a.analysis.overBroad);
  const expired = analyses.filter((a) => a.analysis.expired);

  return (
    <div className="stack">
      <PageHead
        title="Provisioning"
        subtitle="Grant scoped access from least-privilege role templates. A grant records the data categories it can actually reach, so over-broad access is visible rather than assumed away."
      />

      <div className="stat-row">
        <Stat label="Active accounts" value={accounts.length} />
        <Stat label="Live grants" value={analyses.length} />
        <Stat
          label="Over-broad grants"
          value={overBroad.length}
          tone={overBroad.length ? "red" : undefined}
        />
        <Stat
          label="Expired but not revoked"
          value={expired.length}
          tone={expired.length ? "yellow" : undefined}
        />
      </div>

      {overBroad.length > 0 && (
        <Notice
          tone="danger"
          title={`${overBroad.length} grant${overBroad.length === 1 ? "" : "s"} reach data outside the role's baseline`}
        >
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {overBroad.map(({ account, analysis }) => (
              <li key={analysis.grantId} style={{ marginBottom: 3 }}>
                <strong>{account.user.fullName}</strong> on {account.system.name} holds{" "}
                <em>{analysis.roleName}</em> reaching{" "}
                <strong>{analysis.excessCategories.join(", ")}</strong>, which the
                role&apos;s baseline does not cover.
              </li>
            ))}
          </ul>
          <p style={{ margin: "8px 0 0" }}>
            New grants like these are refused at the point of granting. These
            predate that check and need narrowing.
          </p>
        </Notice>
      )}

      <div className="grid-2">
        <Card title="Accounts">
          <div className="table-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>System</th>
                  <th>Grants</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr
                    key={account.id}
                    style={
                      selected?.id === account.id
                        ? { background: "var(--bg-selected)" }
                        : undefined
                    }
                  >
                    <td>
                      <a
                        className="row-link"
                        href={`/access/provisioning?account=${account.id}`}
                      >
                        {account.user.fullName}
                      </a>
                      <div className="cell-sub">
                        {account.user.department} ·{" "}
                        {EMPLOYMENT_STATUS_LABEL[
                          account.user.employmentStatus as EmploymentStatus
                        ]}
                      </div>
                    </td>
                    <td>
                      <div className="cell-stack">
                        <span>{account.system.name}</span>
                        <span className="cell-sub mono">{account.username}</span>
                      </div>
                    </td>
                    <td>
                      <div className="cell-stack">
                        {account.grants.map((g) => {
                          const a = analyseGrant(g, g.role);
                          return (
                            <span key={g.id} className="row" style={{ gap: 5 }}>
                              <span>{g.role.name}</span>
                              {a.overBroad && <Pill tone="red">Over-broad</Pill>}
                              {a.expired && <Pill tone="yellow">Expired</Pill>}
                            </span>
                          );
                        })}
                        {account.grants.length === 0 && (
                          <span className="muted">No grants</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {selected && (
          <Card
            title={`Grant access — ${selected.user.fullName} on ${selected.system.name}`}
          >
            <div style={{ marginBottom: 14 }}>
              <div className="section-label">Current grants</div>
              {selected.grants.length === 0 ? (
                <span className="muted">None.</span>
              ) : (
                selected.grants.map((g) => {
                  const a = analyseGrant(g, g.role);
                  return (
                    <div key={g.id} style={{ marginBottom: 8 }}>
                      <div className="row">
                        <strong>{g.role.name}</strong>
                        {a.overBroad && <Pill tone="red">Over-broad</Pill>}
                        <span className="cell-sub">
                          granted {formatDate(g.grantedAt)}
                          {g.expiresAt ? `, expires ${formatDate(g.expiresAt)}` : ", no expiry"}
                        </span>
                      </div>
                      <FieldChips fields={a.scopeCategories} />
                      {a.overBroad && (
                        <p className="cell-sub" style={{ margin: "2px 0 0", color: "var(--red)" }}>
                          Outside baseline: {a.excessCategories.join(", ")}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <GrantForm
              accountId={selected.id}
              roles={roles.map((r) => ({
                id: r.id,
                name: r.name,
                description: r.description,
                baselineCategories: decodeList(r.baselineCategoriesJson),
              }))}
            />
          </Card>
        )}
      </div>
    </div>
  );
}
