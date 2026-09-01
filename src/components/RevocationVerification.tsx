import Link from "next/link";
import { db } from "@/lib/db";
import {
  Card,
  CompletionPill,
  ExecutionPill,
  Notice,
  Stat,
  formatDateTime,
} from "@/components/ui";
import { computeRevocationCompletion } from "@/lib/engines/access";
import { ResidualAccessActions } from "@/components/accessActions";


/**
 * SCREEN 3 (Scenario 2) — Revocation Verification Dashboard
 *
 * The same three-state model as Scenario 1's completion tracker, applied to
 * access. `verified` requires every account revoked AND no live session
 * anywhere; anything less is partial, and the reasons are listed.
 *
 * A dashboard that showed "revoked ✓" once the IdP returned 200 would be the
 * whole problem in one tick.
 */
export async function RevocationVerification() {
  const users = await db.internalUser.findMany({
    where: { accounts: { some: {} } },
    orderBy: { fullName: "asc" },
  });

  const rows = await Promise.all(
    users.map((u) => computeRevocationCompletion(u.id)),
  );

  const withFailures = rows.filter((r) => r.hasFailures);
  const stillLive = rows.reduce((s, r) => s + r.totals.sessionsStillLive, 0);
  const notVerified = rows.filter((r) => r.state !== "verified");

  return (
    <div className="stack">
      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="People tracked" value={rows.length} />
        <Stat
          label="Not fully revoked"
          value={notVerified.length}
          tone={notVerified.length ? "yellow" : undefined}
        />
        <Stat
          label="Sessions still live"
          value={stillLive}
          tone={stillLive ? "red" : undefined}
        />
        <Stat
          label="Failed revocations"
          value={withFailures.length}
          tone={withFailures.length ? "red" : undefined}
        />
      </div>

      {withFailures.length > 0 && (
        <div style={{ marginBottom: 16 }}>
        <Notice tone="danger" title="Revocations that did not take">
          These returned an error, so nothing changed on the target system. The
          CISO was notified automatically when each one failed.
        </Notice>
        </div>
      )}

      {rows.map((completion) => (
        <Card
          key={completion.userId}
          title={
            <span className="row">
              {completion.userName}
              <CompletionPill
                state={completion.state}
                hasFailures={completion.hasFailures}
              />
            </span>
          }
          actions={
            <Link href={`/access/users/${completion.userId}`} className="btn sm">
              Investigate
            </Link>
          }
        >
          <div className="table-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th>System</th>
                  <th>Account</th>
                  <th>Status</th>
                  <th>Grants revoked</th>
                  <th>Sessions killed</th>
                  <th>Still live</th>
                  <th>Confirmed</th>
                  <th>Residual access</th>
                </tr>
              </thead>
              <tbody>
                {completion.targets.map((t) => {
                  // A revoke was attempted but access is not gone: sessions still
                  // live, a partial, or an outright failure. This is the state the
                  // whole verification tab exists to make visible.
                  const residual =
                    t.attempt > 0 &&
                    t.status !== "verified" &&
                    (t.sessionsRemaining > 0 || t.status === "failed" || t.status === "partial");
                  return (
                    <tr key={t.accountId}>
                      <td className="cell-primary">{t.systemName}</td>
                      <td className="mono">{t.username}</td>
                      <td>
                        <ExecutionPill status={t.status} />
                      </td>
                      <td className="mono">{t.grantsRevoked}</td>
                      <td className="mono">{t.sessionsKilled}</td>
                      <td
                        className="mono"
                        style={{
                          color: t.sessionsRemaining ? "var(--red)" : undefined,
                          fontWeight: t.sessionsRemaining ? 600 : 400,
                        }}
                      >
                        {t.sessionsRemaining}
                      </td>
                      <td className="cell-sub">{formatDateTime(t.confirmedAt)}</td>
                      <td>
                        {residual ? (
                          <div className="stack" style={{ gap: 6 }}>
                            <span style={{ color: "var(--red)", fontWeight: 600 }}>
                              ⚠ Access still active
                            </span>
                            <ResidualAccessActions accountId={t.accountId} recordId={t.recordId} />
                          </div>
                        ) : t.status === "verified" ? (
                          <span className="cell-sub" style={{ color: "var(--green)" }}>
                            Cleared
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {completion.state !== "verified" && completion.blockedBy.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Notice tone="warn" title="Why this is not fully revoked">
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {completion.blockedBy.map((r, i) => (
                    <li key={i} style={{ marginBottom: 2 }}>
                      {r}
                    </li>
                  ))}
                </ul>
              </Notice>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
