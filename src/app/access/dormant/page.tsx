import Link from "next/link";
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
import { DispositionForm, RevokeAccountButton } from "@/components/accessActions";
import { findDormantAccounts } from "@/lib/engines/access";
import { DISPOSITION_LABEL, type Disposition } from "@/lib/domain";

export const dynamic = "force-dynamic";

const THRESHOLDS = [30, 60, 90, 180, 365];
const DEFAULT_THRESHOLD = 90;

/**
 * SCREEN 4 (Scenario 2) — Dormant Account Report
 * SCREEN 5 (inline)      — Account Investigation / disposition
 *
 * The threshold is configurable because it is an organisational judgement, not
 * a statutory one, and the page says so rather than implying the law picked 90
 * days.
 *
 * Every disposition requires a justification, enforced on the server. "Disabled
 * it because it looked unused" is not something anyone can stand behind when
 * the account is questioned a year later, so the system will not record it.
 */
export default async function DormantPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; account?: string }>;
}) {
  const params = await searchParams;
  const threshold = Number(params.days) || DEFAULT_THRESHOLD;

  const dormant = await findDormantAccounts(threshold);
  const selected = dormant.find((d) => d.accountId === params.account) ?? null;

  const orphaned = dormant.filter((d) => d.orphaned);
  const withLiveSessions = dormant.filter((d) => d.liveSessions > 0);
  const undecided = dormant.filter((d) => !d.disposition);

  const totalAccounts = await db.systemAccount.count();

  return (
    <div className="stack">
      <PageHead
        title="Dormant accounts"
        subtitle="Accounts unused for longer than the threshold. Dormant access is still access — an unused account with a live token is reachable by anyone who finds the token."
      />

      <div className="row">
        <span className="section-label" style={{ margin: 0 }}>
          Dormant after
        </span>
        {THRESHOLDS.map((d) => (
          <Link
            key={d}
            href={`/access/dormant?days=${d}`}
            className={`btn sm ${d === threshold ? "primary" : "ghost"}`}
          >
            {d} days
          </Link>
        ))}
        <span className="cell-sub">
          Organisational threshold, not a statutory one — no DPDP provision fixes
          a dormancy period.
        </span>
      </div>

      <div className="stat-row">
        <Stat label={`Dormant > ${threshold}d`} value={dormant.length} />
        <Stat label="Of all accounts" value={totalAccounts} />
        <Stat
          label="Orphaned"
          value={orphaned.length}
          tone={orphaned.length ? "red" : undefined}
        />
        <Stat
          label="With live sessions"
          value={withLiveSessions.length}
          tone={withLiveSessions.length ? "red" : undefined}
        />
        <Stat
          label="No disposition yet"
          value={undecided.length}
          tone={undecided.length ? "yellow" : undefined}
        />
      </div>

      {orphaned.length > 0 && (
        <Notice tone="danger" title="Orphaned accounts">
          These belong to people who have left, or to no current owner at all.
          They cannot be justified by anyone&apos;s current job, and any live token
          on them is unattributable access to personal data.
        </Notice>
      )}

      <Card title="Dormant accounts">
        <div className="table-wrap">
          <table className="dtable">
            <thead>
              <tr>
                <th>Account</th>
                <th>System</th>
                <th>Last active</th>
                <th>Reaches</th>
                <th>Live sessions</th>
                <th>Disposition</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {dormant.map((d) => (
                <tr
                  key={d.accountId}
                  style={
                    selected?.accountId === d.accountId
                      ? { background: "var(--bg-selected)" }
                      : undefined
                  }
                >
                  <td>
                    <div className="cell-stack">
                      <span className="cell-primary">{d.userName}</span>
                      <span className="cell-sub mono">{d.username}</span>
                      {d.orphaned && <Pill tone="red">Orphaned</Pill>}
                    </div>
                  </td>
                  <td>{d.systemName}</td>
                  <td>
                    <div className="cell-stack">
                      <span>{formatDate(d.lastActiveAt)}</span>
                      <span className="cell-sub">
                        {d.daysDormant === null
                          ? "never used"
                          : `${d.daysDormant} days ago`}
                      </span>
                    </div>
                  </td>
                  <td>
                    {d.reachableCategories.length ? (
                      <FieldChips fields={d.reachableCategories} />
                    ) : (
                      <span className="muted">No live grants</span>
                    )}
                  </td>
                  <td
                    className="mono"
                    style={{
                      color: d.liveSessions ? "var(--red)" : undefined,
                      fontWeight: d.liveSessions ? 600 : 400,
                    }}
                  >
                    {d.liveSessions}
                  </td>
                  <td>
                    {d.disposition ? (
                      <div className="cell-stack">
                        <Pill tone="green">
                          {DISPOSITION_LABEL[d.disposition.disposition as Disposition]}
                        </Pill>
                        <span className="cell-sub">{d.disposition.justification}</span>
                      </div>
                    ) : (
                      <Pill tone="yellow">Not decided</Pill>
                    )}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <Link
                        href={`/access/dormant?days=${threshold}&account=${d.accountId}`}
                        className="btn sm ghost"
                      >
                        Investigate
                      </Link>
                      <RevokeAccountButton accountId={d.accountId} />
                    </div>
                  </td>
                </tr>
              ))}
              {dormant.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty">
                      No account has been dormant for more than {threshold} days.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {selected && (
        <Card title={`Disposition — ${selected.userName} on ${selected.systemName}`}>
          <p className="cell-sub" style={{ marginTop: 0 }}>
            {selected.daysDormant === null
              ? "This account has never been used."
              : `Unused for ${selected.daysDormant} days.`}{" "}
            {selected.orphaned && "The owner has left the organisation. "}
            {selected.liveSessions > 0 &&
              `${selected.liveSessions} session or token on it is still live. `}
            {selected.reachableCategories.length > 0 &&
              `It can reach ${selected.reachableCategories.join(", ")} data.`}
          </p>
          <Notice tone="warn" title="A justification is required">
            The server refuses a disposition without one. What is written here is
            the answer to &ldquo;why does this account still exist?&rdquo; when
            someone asks in a year.
          </Notice>
          <div style={{ marginTop: 12 }}>
            <DispositionForm accountId={selected.accountId} />
          </div>
        </Card>
      )}
    </div>
  );
}
