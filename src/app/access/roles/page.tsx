import Link from "next/link";
import { db } from "@/lib/db";
import {
  Card,
  FieldChips,
  GovernanceBanner,
  Notice,
  PageHead,
  Pill,
  Stat,
  formatDate,
  formatDateTime,
} from "@/components/ui";
import { RoleEditor } from "@/components/accessActions";
import { analyseRole } from "@/lib/guards/baselineGate";
import { decodeList, decodeObject } from "@/lib/codec/json";
import { ROLE_LABEL, type ActorRole } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * SCREEN 6 (Scenario 2) — RBAC Matrix Viewer, with drift detection
 * SCREEN 7 (inline)      — Role Editor
 *
 * Drift is the gap between what a role grants now and the baseline the CISO
 * approved. Only unapproved WIDENING counts: a role narrower than its baseline
 * is not a security problem, and flagging it would train people to ignore the
 * flag.
 *
 * The asymmetry in the editor is the enforcement of criteria 5 and 6 in this
 * scenario. Narrowing a role is technical work Admin owns. Widening it past the
 * baseline is a governance decision, refused by the server and routed to the
 * CISO as an escalation.
 */
export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const params = await searchParams;

  const [roles, grants, escalations] = await Promise.all([
    db.rBACRole.findMany({ orderBy: { name: "asc" } }),
    db.accessGrant.findMany({
      where: { revokedAt: null },
      include: { account: { include: { user: true, system: true } } },
    }),
    db.escalation.findMany({
      where: { targetRole: "ciso" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const analyses = roles.map(analyseRole);
  const drifted = analyses.filter((a) => a.hasDrift);
  const selected =
    analyses.find((a) => a.roleId === params.role) ?? drifted[0] ?? analyses[0] ?? null;

  const holdersByRole = new Map<string, typeof grants>();
  for (const g of grants) {
    const list = holdersByRole.get(g.roleId) ?? [];
    list.push(g);
    holdersByRole.set(g.roleId, list);
  }

  const allPermissions = [
    ...new Set(analyses.flatMap((a) => [...a.current, ...a.baseline])),
  ].sort();

  return (
    <div className="stack">
      <PageHead
        title="RBAC matrix"
        subtitle="What each role grants now, against the baseline the CISO approved. Drift is unapproved widening — a role that grants less than its baseline is fine."
      />

      <div className="stat-row">
        <Stat label="Roles" value={roles.length} />
        <Stat
          label="Roles with drift"
          value={drifted.length}
          tone={drifted.length ? "red" : undefined}
        />
        <Stat label="Live grants" value={grants.length} />
        <Stat label="Distinct permissions" value={allPermissions.length} />
      </div>

      {drifted.length > 0 && (
        <Notice
          tone="danger"
          title={
            drifted.length === 1
              ? "1 role grants more than the approved baseline"
              : `${drifted.length} roles grant more than the approved baseline`
          }
        >
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {drifted.map((d) => (
              <li key={d.roleId} style={{ marginBottom: 3 }}>
                <strong>{d.roleName}</strong> holds{" "}
                <strong>{d.excess.join(", ")}</strong>, which{" "}
                {d.baselineApprovedBy} did not approve.{" "}
                {(holdersByRole.get(d.roleId) ?? []).length} account
                {(holdersByRole.get(d.roleId) ?? []).length === 1 ? "" : "s"} hold
                this role right now.
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <Card title="Role / permission matrix">
        <div className="table-wrap" style={{ overflowX: "auto" }}>
          <table className="dtable">
            <thead>
              <tr>
                <th>Role</th>
                <th>Holders</th>
                {allPermissions.map((p) => (
                  <th key={p} className="mono" style={{ fontSize: 10.5 }}>
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analyses.map((a) => (
                <tr key={a.roleId}>
                  <td>
                    <div className="cell-stack">
                      <Link
                        href={`/access/roles?role=${a.roleId}`}
                        className="row-link"
                      >
                        {a.roleName}
                      </Link>
                      {a.hasDrift && <Pill tone="red">Drift</Pill>}
                    </div>
                  </td>
                  <td className="mono">{(holdersByRole.get(a.roleId) ?? []).length}</td>
                  {allPermissions.map((p) => {
                    const granted = a.current.includes(p);
                    const inBaseline = a.baseline.includes(p);
                    return (
                      <td key={p} style={{ textAlign: "center" }}>
                        {granted && inBaseline && (
                          <span title="Granted, within baseline" style={{ color: "var(--green)" }}>
                            ●
                          </span>
                        )}
                        {granted && !inBaseline && (
                          <span
                            title="Granted but NOT in the approved baseline — drift"
                            style={{ color: "var(--red)", fontWeight: 700 }}
                          >
                            ▲
                          </span>
                        )}
                        {!granted && inBaseline && (
                          <span
                            title="Allowed by baseline but not granted — narrower than approved"
                            style={{ color: "var(--text-4)" }}
                          >
                            ○
                          </span>
                        )}
                        {!granted && !inBaseline && (
                          <span style={{ color: "var(--border)" }}>·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="cell-sub" style={{ marginTop: 10, marginBottom: 0 }}>
          <span style={{ color: "var(--green)" }}>●</span> granted, within baseline
          {" · "}
          <span style={{ color: "var(--red)", fontWeight: 700 }}>▲</span> granted,
          not in baseline (drift)
          {" · "}
          <span style={{ color: "var(--text-4)" }}>○</span> allowed but not granted
        </p>
      </Card>

      {selected && (
        <Card
          title={
            <span className="row">
              Role editor — {selected.roleName}
              {selected.hasDrift && <Pill tone="red">Drift</Pill>}
            </span>
          }
        >
          <GovernanceBanner owner={ROLE_LABEL.ciso} object="The role baseline" />

          <div style={{ margin: "14px 0" }}>
            <div className="section-label">Approved baseline</div>
            <FieldChips fields={selected.baseline} />
            <p className="cell-sub" style={{ margin: "4px 0 0" }}>
              Approved by {selected.baselineApprovedBy} on{" "}
              {formatDate(selected.baselineApprovedAt)}. Admin cannot change this.
            </p>
          </div>

          {selected.excess.length > 0 && (
            <Notice tone="danger" title="Granting more than was approved">
              <FieldChips fields={selected.excess} />
              These can be removed here. They cannot be re-added — putting them
              back would widen the role beyond the baseline, which is the CISO&apos;s
              decision, not Admin&apos;s.
            </Notice>
          )}

          {selected.missing.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Notice tone="info" title="Narrower than the baseline allows">
                <FieldChips fields={selected.missing} />
                Permitted but not granted. That is fine — least privilege means
                granting less than the ceiling, not up to it.
              </Notice>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <RoleEditor
              roleId={selected.roleId}
              roleName={selected.roleName}
              current={selected.current}
              baseline={selected.baseline}
              excess={selected.excess}
            />
          </div>

          <div style={{ marginTop: 18 }}>
            <div className="section-label">Who holds this role</div>
            {(holdersByRole.get(selected.roleId) ?? []).length === 0 ? (
              <span className="muted">Nobody currently.</span>
            ) : (
              <div className="table-wrap">
                <table className="dtable">
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th>System</th>
                      <th>Scope</th>
                      <th>Granted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(holdersByRole.get(selected.roleId) ?? []).map((g) => (
                      <tr key={g.id}>
                        <td className="cell-primary">{g.account.user.fullName}</td>
                        <td>{g.account.system.name}</td>
                        <td>
                          <FieldChips fields={decodeList(g.scopeCategoriesJson)} />
                        </td>
                        <td className="cell-sub">{formatDate(g.grantedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      )}

      {escalations.length > 0 && (
        <Card title="Baseline change requests to the CISO">
          {escalations.map((e) => {
            const context = decodeObject<Record<string, unknown>>(e.contextJson);
            return (
              <div
                key={e.id}
                style={{
                  borderTop: "1px solid var(--border-soft)",
                  paddingTop: 12,
                  marginTop: 12,
                }}
              >
                <div className="row" style={{ marginBottom: 6 }}>
                  <Pill tone={e.status === "ruled" ? "green" : "purple"}>
                    {e.status === "ruled" ? "Ruled" : "Awaiting the CISO"}
                  </Pill>
                  <span className="cell-sub">
                    Raised by {ROLE_LABEL[e.sourceRole as ActorRole]} ·{" "}
                    {formatDateTime(e.createdAt)}
                  </span>
                </div>
                <p style={{ margin: "0 0 8px" }}>{e.reason}</p>
                <pre className="code-block">{JSON.stringify(context, null, 2)}</pre>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
