import { db } from "@/lib/db";
import {
  Card,
  Notice,
  PageHead,
  Pill,
  Stat,
  formatDateTime,
} from "@/components/ui";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { RbacMatrix, type RoleRow } from "@/components/rbacMatrix";
import { analyseRole } from "@/lib/guards/baselineGate";
import { decodeObject } from "@/lib/codec/json";
import { ROLE_LABEL, type ActorRole } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * SCREEN 4 (Scenario 2) — RBAC Matrix, with drift detection
 *
 * Drift is found, not waited for: the drift-status column compares each role's
 * current permissions against the CISO-approved baseline the moment the table
 * loads. No drift (teal) / minor (amber) / significant (red) — significant when
 * a sensitive permission was added, or the delta is large.
 *
 * The Role Editor is a side-by-side of baseline (read-only) vs current
 * (editable). Narrowing a role is Admin's to do; widening it past the baseline
 * is the CISO's decision, raised as an escalation.
 */
export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; drift?: string }>;
}) {
  const params = await searchParams;
  const term = (params.q ?? "").trim().toLowerCase();

  const [roles, grants, escalations] = await Promise.all([
    db.rBACRole.findMany({ orderBy: { name: "asc" } }),
    db.accessGrant.findMany({ where: { revokedAt: null } }),
    db.escalation.findMany({
      where: { targetRole: "ciso" },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const holdersByRole = new Map<string, number>();
  for (const g of grants) holdersByRole.set(g.roleId, (holdersByRole.get(g.roleId) ?? 0) + 1);

  let rows: RoleRow[] = roles.map((role) => {
    const a = analyseRole(role);
    return {
      id: a.roleId,
      name: a.roleName,
      description: a.description,
      current: a.current,
      baseline: a.baseline,
      excess: a.excess,
      sensitiveExcess: a.sensitiveExcess,
      missing: a.missing,
      severity: a.severity,
      baselineCount: a.baselineCount,
      currentCount: a.currentCount,
      baselineApprovedBy: a.baselineApprovedBy,
      baselineApprovedAt: a.baselineApprovedAt,
      lastReviewedAt: a.lastReviewedAt,
      holders: holdersByRole.get(a.roleId) ?? 0,
    };
  });

  const drifted = rows.filter((r) => r.severity !== "none");

  if (params.drift) rows = rows.filter((r) => r.severity === params.drift);
  if (term) rows = rows.filter((r) => r.name.toLowerCase().includes(term));

  return (
    <div className="stack">
      <PageHead
        title="RBAC matrix"
        titleTip="Each role's current permissions compared against the CISO-approved baseline. Drift is unapproved widening; it is detected automatically the moment this loads."
      />

      <div className="stat-row">
        <Stat label="Roles" value={roles.length} />
        <Stat
          label="Roles with drift"
          value={drifted.length}
          tone={drifted.length ? "red" : undefined}
        />
        <Stat
          label="Significant"
          value={drifted.filter((r) => r.severity === "significant").length}
          tone={drifted.some((r) => r.severity === "significant") ? "red" : undefined}
        />
        <Stat label="Live grants" value={grants.length} />
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
              <li key={d.id} style={{ marginBottom: 3 }}>
                <strong>{d.name}</strong> holds <strong>{d.excess.join(", ")}</strong>,
                which {d.baselineApprovedBy} did not approve.{" "}
                {d.sensitiveExcess.length > 0 && (
                  <span style={{ color: "var(--red)" }}>
                    Includes a sensitive write/export permission.{" "}
                  </span>
                )}
                {d.holders} account{d.holders === 1 ? "" : "s"} hold this role now.
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <CompactFilterBar
        basePath="/access/roles"
        searchKey="q"
        searchPlaceholder="Search roles…"
        facets={[
          {
            key: "drift",
            label: "Drift",
            options: [
              { value: "none", label: "No drift" },
              { value: "minor", label: "Minor drift" },
              { value: "significant", label: "Significant drift" },
            ],
          },
        ]}
      />

      <RbacMatrix rows={rows} />

      {escalations.length > 0 && (
        <Card title="Baseline change requests to the CISO">
          {escalations.map((e) => {
            const context = decodeObject<Record<string, unknown>>(e.contextJson);
            return (
              <div
                key={e.id}
                style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 12, marginTop: 12 }}
              >
                <div className="row" style={{ marginBottom: 6 }}>
                  <Pill tone={e.status === "ruled" ? "green" : "purple"}>
                    {e.status === "ruled" ? "Ruled" : "Awaiting the CISO"}
                  </Pill>
                  <span className="cell-sub">
                    Raised by {ROLE_LABEL[e.sourceRole as ActorRole]} · {formatDateTime(e.createdAt)}
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
