import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  Card,
  CompletionPill,
  ExecutionPill,
  FieldChips,
  KeyValue,
  Notice,
  PageHead,
  Pill,
  formatDate,
  formatDateTime,
} from "@/components/ui";
import {
  DeprovisionButton,
  RetryRevocationButton,
  TerminateSessionButton,
} from "@/components/accessActions";
import { analyseGrant, computeRevocationCompletion } from "@/lib/engines/access";
import {
  EMPLOYMENT_STATUS_LABEL,
  SESSION_KIND_LABEL,
  type EmploymentStatus,
  type SessionKind,
} from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * SCREEN 5 (Scenario 2) — Account Investigation Panel
 *
 * Everything about one person's access, including the full diagnostics from any
 * failed revocation — the same criterion 7 rule as the Failure Investigation
 * workspace: the person expected to fix it can see why it broke.
 *
 * Live sessions get their own termination control, because that is the specific
 * gap that turns a "revoked" account back into a working one.
 */
export default async function UserAccessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await db.internalUser.findUnique({
    where: { id },
    include: {
      accounts: {
        include: {
          system: true,
          sessions: { orderBy: { startedAt: "desc" } },
          grants: { include: { role: true } },
          revocations: { orderBy: { createdAt: "desc" } },
          disposition: true,
        },
      },
    },
  });
  if (!user) notFound();

  const completion = await computeRevocationCompletion(id);
  const failures = completion.failures;

  return (
    <div className="stack">
      <PageHead
        crumbs={[
          { label: "Identity & Access", href: "/access/deprovisioning" },
          { label: user.fullName },
        ]}
        title={user.fullName}
        subtitle={
          <span className="row" style={{ gap: 8 }}>
            <CompletionPill
              state={completion.state}
              hasFailures={completion.hasFailures}
            />
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
            <span className="cell-sub">
              {user.department} · joined {formatDate(user.joinedAt)}
              {user.leftAt ? ` · left ${formatDate(user.leftAt)}` : ""}
            </span>
          </span>
        }
        actions={
          completion.state !== "verified" && user.accounts.length > 0 ? (
            <DeprovisionButton userId={user.id} accounts={user.accounts.length} />
          ) : undefined
        }
      />

      {completion.state !== "verified" && completion.blockedBy.length > 0 && (
        <Notice tone="warn" title="Access is not fully removed">
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {completion.blockedBy.map((r, i) => (
              <li key={i} style={{ marginBottom: 2 }}>
                {r}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {failures.length > 0 && (
        <Card title={`Failed revocations (${failures.length})`}>
          {failures.map((f) => (
            <div
              key={f.accountId}
              style={{
                borderTop: "1px solid var(--border-soft)",
                paddingTop: 12,
                marginTop: 12,
              }}
            >
              <div className="row" style={{ marginBottom: 8 }}>
                <strong>{f.systemName}</strong>
                <ExecutionPill status="failed" />
                <Pill tone="gray" dot={false}>
                  Attempt {f.attempt}
                </Pill>
              </div>
              <KeyValue
                rows={[
                  [
                    "Error code",
                    <code key="c" className="field-chip" style={{ color: "var(--red)" }}>
                      {f.failureCode}
                    </code>,
                  ],
                  ["What went wrong", f.failureDetail],
                ]}
              />
              {f.failureRawResponse && (
                <div style={{ marginTop: 12 }}>
                  <div className="section-label">Raw response from the system</div>
                  <pre className="code-block">{f.failureRawResponse}</pre>
                </div>
              )}
              <p className="cell-sub" style={{ marginTop: 10 }}>
                Nothing changed on {f.systemName}: grants and sessions there are
                untouched. Fix the cause, then retry.
              </p>
              {f.recordId && (
                <div style={{ marginTop: 8 }}>
                  <RetryRevocationButton recordId={f.recordId} />
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      {user.accounts.map((account) => {
        const live = account.sessions.filter((s) => !s.terminatedAt);
        const record = account.revocations[0] ?? null;
        return (
          <Card
            key={account.id}
            title={
              <span className="row">
                {account.system.name}
                <span className="mono cell-sub">{account.username}</span>
                <Pill
                  tone={
                    account.status === "revoked"
                      ? "green"
                      : account.status === "active"
                        ? "blue"
                        : "gray"
                  }
                >
                  {account.status}
                </Pill>
                {live.length > 0 && (
                  <Pill tone="red">
                    {live.length} live session{live.length === 1 ? "" : "s"}
                  </Pill>
                )}
              </span>
            }
          >
            <KeyValue
              rows={[
                ["Created", formatDate(account.createdAt)],
                ["Last active", formatDate(account.lastActiveAt)],
                [
                  "Revocation",
                  record ? (
                    <span key="r" className="row">
                      <ExecutionPill status={record.status as never} />
                      <span className="cell-sub">
                        {record.grantsRevoked} grants revoked, {record.sessionsKilled}{" "}
                        sessions killed, {record.sessionsRemaining} remaining
                      </span>
                    </span>
                  ) : (
                    <span className="muted">Not attempted</span>
                  ),
                ],
              ]}
            />

            <div style={{ marginTop: 14 }}>
              <div className="section-label">Grants</div>
              {account.grants.length === 0 ? (
                <span className="muted">None.</span>
              ) : (
                account.grants.map((g) => {
                  const a = analyseGrant(g, g.role);
                  return (
                    <div key={g.id} style={{ marginBottom: 8 }}>
                      <div className="row">
                        <strong>{g.role.name}</strong>
                        {g.revokedAt ? (
                          <Pill tone="green">Revoked {formatDate(g.revokedAt)}</Pill>
                        ) : (
                          <Pill tone="blue">Live</Pill>
                        )}
                        {a.overBroad && <Pill tone="red">Over-broad</Pill>}
                      </div>
                      <FieldChips fields={a.scopeCategories} />
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="section-label">Sessions and tokens</div>
              {account.sessions.length === 0 ? (
                <span className="muted">None.</span>
              ) : (
                <div className="table-wrap">
                  <table className="dtable">
                    <thead>
                      <tr>
                        <th>Kind</th>
                        <th>Reference</th>
                        <th>Started</th>
                        <th>Last seen</th>
                        <th>Expires</th>
                        <th>State</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {account.sessions.map((s) => (
                        <tr key={s.id}>
                          <td>{SESSION_KIND_LABEL[s.kind as SessionKind]}</td>
                          <td className="mono">{s.tokenRef}</td>
                          <td className="cell-sub">{formatDate(s.startedAt)}</td>
                          <td className="cell-sub">{formatDate(s.lastSeenAt)}</td>
                          <td className="cell-sub">{formatDate(s.expiresAt)}</td>
                          <td>
                            {s.terminatedAt ? (
                              <Pill tone="gray">
                                Terminated {formatDate(s.terminatedAt)}
                              </Pill>
                            ) : (
                              <Pill tone="red">Live</Pill>
                            )}
                          </td>
                          <td>
                            {!s.terminatedAt && <TerminateSessionButton sessionId={s.id} />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {live.length > 0 && (
                <p className="cell-sub" style={{ marginTop: 8 }}>
                  Revoking a role does not end a session that is already running.
                  Until these are terminated, this account can still reach personal
                  data — which is why the revocation reads as partial rather than
                  done.
                </p>
              )}
            </div>

            {account.disposition && (
              <div style={{ marginTop: 14 }}>
                <Notice tone="info" title={`Disposition: ${account.disposition.disposition}`}>
                  {account.disposition.justification}
                  <div className="cell-sub" style={{ marginTop: 4 }}>
                    Recorded {formatDateTime(account.disposition.decidedAt)}
                  </div>
                </Notice>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
