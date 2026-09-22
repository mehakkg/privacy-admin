import Link from "next/link";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, Stat, Pill, Chip, Notice } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Sensitive categories that make a grant "over-broad" through a privacy lens. */
const SENSITIVE = new Set(["kyc", "financial", "health", "children", "biometric"]);
const DORMANCY_DEFAULT: Record<string, number> = { human: 60, service: 180 };

function parseList(json: string): string[] {
  try { const v = JSON.parse(json); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}

/**
 * SCREEN — Access insights (Risk & Compliance): a PRIVACY LENS over access, not
 * an execution surface. It reads which access touches personal-data-holding
 * systems (flagging over-broad reach into sensitive categories) and the
 * privacy-relevant subset of IAM's dormancy detection. RBAC editing and
 * provisioning stay in Identity & Access — this screen only observes.
 */
export default async function RiskAccessInsightsPage() {
  const now = Date.now();
  const [locations, thresholdRows] = await Promise.all([
    db.dataLocation.findMany({ where: { systemId: { not: null } }, select: { systemId: true, dataCategoriesJson: true } }),
    db.dormancyThreshold.findMany(),
  ]);

  // Systems that hold personal data = those present in the data map, with the
  // union of categories found there.
  const catsBySystem = new Map<string, Set<string>>();
  for (const l of locations) {
    if (!l.systemId) continue;
    const set = catsBySystem.get(l.systemId) ?? new Set<string>();
    for (const c of parseList(l.dataCategoriesJson)) set.add(c);
    catsBySystem.set(l.systemId, set);
  }
  const personalDataSystemIds = [...catsBySystem.keys()];

  const accounts = personalDataSystemIds.length
    ? await db.systemAccount.findMany({
        where: { systemId: { in: personalDataSystemIds }, status: { in: ["active", "orphaned"] } },
        include: { user: true, system: true, grants: { where: { revokedAt: null } }, sessions: true },
      })
    : [];

  const thresholds: Record<string, number> = { ...DORMANCY_DEFAULT, ...Object.fromEntries(thresholdRows.map((t) => [t.accountType, t.thresholdDays])) };

  const reviewed = accounts.map((a) => {
    const reachable = new Set<string>();
    for (const g of a.grants) for (const c of parseList(g.scopeCategoriesJson)) reachable.add(c);
    const sensitive = [...reachable].filter((c) => SENSITIVE.has(c));
    const days = a.lastActiveAt ? Math.floor((now - a.lastActiveAt.getTime()) / 86_400_000) : null;
    const threshold = thresholds[a.accountType] ?? DORMANCY_DEFAULT.human;
    const dormant = days === null || days > threshold;
    return { a, reachable: [...reachable], sensitive, overBroad: sensitive.length > 0, days, threshold, dormant };
  });

  const dormant = reviewed.filter((r) => r.dormant);
  const overBroad = reviewed.filter((r) => r.overBroad).length;

  return (
    <Shell active="/risk/access-insights" title="Risk & Compliance / Access insights">
      <PageHead
        title="Access insights"
        titleTip="A privacy lens over access: which grants reach personal-data-holding systems (flagged where they reach sensitive categories) and the privacy-relevant subset of dormant accounts. Read-only — RBAC editing and provisioning live in Identity & Access."
      />

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="Personal-data systems" value={personalDataSystemIds.length} />
        <Stat label="Accounts with access" value={reviewed.length} />
        <Stat label="Over-broad (reach sensitive)" value={overBroad} tone={overBroad ? "red" : undefined} />
        <Stat label="Dormant on these systems" value={dormant.length} tone={dormant.length ? "yellow" : undefined} />
      </div>

      <h3 style={{ fontSize: 15, fontWeight: 600, margin: "4px 0 4px" }}>Personal-data access review</h3>
      <p className="cell-sub" style={{ margin: "0 0 10px" }}>
        Access grants that reach systems holding personal data. A grant is flagged over-broad when it can reach a sensitive category (KYC, financial, health, children).
      </p>
      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr><th>Account</th><th>System</th><th>Reaches</th><th>Last active</th><th>Review</th></tr>
          </thead>
          <tbody>
            {reviewed.map(({ a, reachable, sensitive, overBroad, days }) => (
              <tr key={a.id}>
                <td>
                  <div className="cell-stack">
                    <span className="cell-primary">{a.user?.fullName ?? a.username}</span>
                    <span className="cell-sub mono">{a.username} · {a.accountType}</span>
                  </div>
                </td>
                <td>{a.system?.name ?? "—"}</td>
                <td>
                  <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                    {reachable.length === 0 && <span className="cell-sub">no scoped grants</span>}
                    {reachable.map((c) => (sensitive.includes(c) ? <Pill key={c} tone="red" dot={false}>{c}</Pill> : <Chip key={c}>{c}</Chip>))}
                  </div>
                </td>
                <td><span className="cell-sub">{days === null ? "never" : `${days}d ago`}</span></td>
                <td>{overBroad ? <Pill tone="red" dot={false}>Over-broad</Pill> : <Pill tone="green" dot={false}>Scoped</Pill>}</td>
              </tr>
            ))}
            {reviewed.length === 0 && <tr><td colSpan={5}><div className="empty">No accounts reach personal-data systems.</div></td></tr>}
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: 15, fontWeight: 600, margin: "22px 0 4px" }}>Dormant accounts (privacy-relevant)</h3>
      <p className="cell-sub" style={{ margin: "0 0 10px" }}>
        Consumed from IAM&apos;s dormancy detection, filtered to accounts that can reach personal data. Past each account type&apos;s threshold (human {thresholds.human}d · service {thresholds.service}d).
      </p>
      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr><th>Account</th><th>System</th><th>Type</th><th>Dormant for</th></tr>
          </thead>
          <tbody>
            {dormant.map(({ a, days, threshold }) => (
              <tr key={a.id}>
                <td>
                  <div className="cell-stack">
                    <span className="cell-primary">{a.user?.fullName ?? a.username}</span>
                    <span className="cell-sub mono">{a.username}</span>
                  </div>
                </td>
                <td>{a.system?.name ?? "—"}</td>
                <td><Chip>{a.accountType}</Chip></td>
                <td><span style={{ color: "var(--yellow)", fontWeight: 600 }}>{days === null ? "never active" : `${days}d`}</span> <span className="cell-sub">(threshold {threshold}d)</span></td>
              </tr>
            ))}
            {dormant.length === 0 && <tr><td colSpan={4}><div className="empty">No dormant accounts reach personal-data systems.</div></td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16 }}>
        <Notice tone="info" title="A lens, not a control surface">
          This screen observes access through a privacy lens. To change roles, revoke access, run certification campaigns or edit the RBAC matrix, use <Link href="/access/insights">Identity &amp; Access → Insights</Link>.
        </Notice>
      </div>
    </Shell>
  );
}
