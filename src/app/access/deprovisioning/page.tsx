import Link from "next/link";
import { db } from "@/lib/db";
import {
  Card,
  CompletionPill,
  Notice,
  PageHead,
  Pill,
  Stat,
  formatDate,
} from "@/components/ui";
import { DeprovisionButton } from "@/components/accessActions";
import { computeRevocationCompletion } from "@/lib/engines/access";
import {
  EMPLOYMENT_STATUS_LABEL,
  SESSION_KIND_LABEL,
  type EmploymentStatus,
  type SessionKind,
} from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * SCREEN 2 (Scenario 2) — Deprovisioning Panel
 *
 * Bulk revoke across every system, plus termination of sessions and tokens that
 * are already running.
 *
 * The two are shown separately on purpose. Removing someone's roles does not
 * end a session they already hold, and a refresh token issued last month keeps
 * working long after the account is "revoked". Treating those as one action is
 * how access survives an offboarding, so this screen counts them apart and the
 * completion state refuses to read verified while either is outstanding.
 */
export default async function DeprovisioningPage() {
  const users = await db.internalUser.findMany({
    include: {
      accounts: {
        include: {
          system: true,
          sessions: true,
          grants: { where: { revokedAt: null } },
        },
      },
    },
    orderBy: [{ employmentStatus: "asc" }, { fullName: "asc" }],
  });

  const rows = await Promise.all(
    users.map(async (user) => ({
      user,
      completion: await computeRevocationCompletion(user.id),
      liveSessions: user.accounts.flatMap((a) =>
        a.sessions.filter((s) => !s.terminatedAt),
      ),
      liveGrants: user.accounts.flatMap((a) => a.grants),
    })),
  );

  // People who have left, or are leaving, and still hold access.
  const needsAction = rows.filter(
    (r) =>
      (r.user.employmentStatus !== "active" || r.user.offboardingDueAt) &&
      r.completion.state !== "verified",
  );

  const leaversWithLiveAccess = rows.filter(
    (r) => r.user.employmentStatus === "offboarded" && r.liveSessions.length > 0,
  );

  return (
    <div className="stack">
      <PageHead
        title="Deprovisioning"
        subtitle="Revoke access across every system at once. Grants and live sessions are tracked separately, because they fail separately."
      />

      <div className="stat-row">
        <Stat label="People" value={users.length} />
        <Stat
          label="Awaiting deprovisioning"
          value={needsAction.length}
          tone={needsAction.length ? "yellow" : undefined}
        />
        <Stat
          label="Leavers with live access"
          value={leaversWithLiveAccess.length}
          tone={leaversWithLiveAccess.length ? "red" : undefined}
        />
      </div>

      {leaversWithLiveAccess.length > 0 && (
        <Notice tone="danger" title="Access has outlived the person">
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {leaversWithLiveAccess.map((r) => (
              <li key={r.user.id}>
                <strong>{r.user.fullName}</strong> left{" "}
                {formatDate(r.user.leftAt)} and still holds{" "}
                {r.liveSessions.length} live session
                {r.liveSessions.length === 1 ? "" : "s"} or token.
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {rows.map(({ user, completion, liveSessions, liveGrants }) => (
        <Card
          key={user.id}
          title={
            <span className="row">
              {user.fullName}
              <Pill
                tone={
                  user.employmentStatus === "active"
                    ? "green"
                    : user.employmentStatus === "on_notice"
                      ? "yellow"
                      : "gray"
                }
              >
                {EMPLOYMENT_STATUS_LABEL[user.employmentStatus as EmploymentStatus]}
              </Pill>
              <span className="cell-sub">{user.department}</span>
            </span>
          }
          actions={
            <Link href={`/access/users/${user.id}`} className="btn sm">
              Verification detail
            </Link>
          }
        >
          <div className="row" style={{ marginBottom: 12, gap: 14 }}>
            <span>
              <span className="cell-sub">Revocation: </span>
              <CompletionPill
                state={completion.state}
                hasFailures={completion.hasFailures}
              />
            </span>
            <span className="cell-sub">
              {completion.totals.verified}/{completion.totals.accounts} accounts
              confirmed
            </span>
            <span
              className="cell-sub"
              style={{ color: liveGrants.length ? "var(--yellow)" : undefined }}
            >
              {liveGrants.length} live grant{liveGrants.length === 1 ? "" : "s"}
            </span>
            <span
              className="cell-sub"
              style={{ color: liveSessions.length ? "var(--red)" : undefined }}
            >
              {liveSessions.length} live session{liveSessions.length === 1 ? "" : "s"} / token
            </span>
            {user.offboardingDueAt && (
              <Pill tone="yellow">Offboarding due {formatDate(user.offboardingDueAt)}</Pill>
            )}
          </div>

          <div className="table-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th>System</th>
                  <th>Username</th>
                  <th>Grants</th>
                  <th>Live sessions / tokens</th>
                </tr>
              </thead>
              <tbody>
                {user.accounts.map((account) => {
                  const live = account.sessions.filter((s) => !s.terminatedAt);
                  return (
                    <tr key={account.id}>
                      <td className="cell-primary">{account.system.name}</td>
                      <td className="mono">{account.username}</td>
                      <td>{account.grants.length}</td>
                      <td>
                        {live.length === 0 ? (
                          <span className="muted">None</span>
                        ) : (
                          <div className="cell-stack">
                            {live.map((s) => (
                              <span key={s.id} className="cell-sub mono">
                                {SESSION_KIND_LABEL[s.kind as SessionKind]} · {s.tokenRef}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {user.accounts.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <div className="empty">No accounts.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {user.accounts.length > 0 && completion.state !== "verified" && (
            <div style={{ marginTop: 14 }}>
              <DeprovisionButton userId={user.id} accounts={user.accounts.length} />
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
