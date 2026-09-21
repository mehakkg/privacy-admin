import { db } from "@/lib/db";
import { PageHead } from "@/components/ui";
import { InsightsClient, type DormantRow, type MatrixRole } from "@/components/access/insights";
import { formatDate } from "@/components/ui";

export const dynamic = "force-dynamic";

const DEFAULTS: Record<string, number> = { human: 60, service: 180 };

function classify(accountType: string, employmentStatus: string, hasSessions: boolean): string {
  if (accountType === "service") return "likely_service";
  if (employmentStatus === "offboarded" || !hasSessions) return "likely_abandoned";
  return "unclear";
}

/** SCREEN — Insights: dormant/orphaned detection + the full RBAC permission
 *  matrix, which OVERLAYS statuses already computed elsewhere (drift, dormancy,
 *  open certification) and never recomputes them. */
export default async function InsightsPage() {
  const now = Date.now();
  const [thresholdRows, accounts, roles, drift, openCerts] = await Promise.all([
    db.dormancyThreshold.findMany(),
    db.systemAccount.findMany({
      where: { status: { in: ["active", "disabled", "orphaned"] } },
      include: { user: true, system: true, sessions: true, investigations: { orderBy: { decidedAt: "desc" }, take: 1 } },
    }),
    db.rBACRole.findMany({ orderBy: [{ roleType: "asc" }, { name: "asc" }], include: { assignments: true } }),
    db.driftRecord.findMany({ where: { resolution: "unresolved" }, select: { assignmentId: true } }),
    db.certificationItem.findMany({ where: { decision: null }, select: { assignmentId: true } }),
  ]);

  const thresholds: Record<string, number> = { human: DEFAULTS.human, service: DEFAULTS.service, ...Object.fromEntries(thresholdRows.map((t) => [t.accountType, t.thresholdDays])) };

  // Dormant = past its type's threshold (or never active).
  const dormant: DormantRow[] = accounts
    .map((a) => {
      const days = a.lastActiveAt ? Math.floor((now - a.lastActiveAt.getTime()) / 86_400_000) : null;
      return { a, days };
    })
    .filter(({ a, days }) => {
      const th = thresholds[a.accountType] ?? DEFAULTS.human;
      return days === null || days >= th;
    })
    .map(({ a, days }) => ({
      accountId: a.id,
      name: a.user.fullName,
      system: a.system.name,
      username: a.username,
      accountType: a.accountType,
      lastActive: a.lastActiveAt ? formatDate(a.lastActiveAt) : null,
      daysDormant: days,
      classification: classify(a.accountType, a.user.employmentStatus, a.sessions.some((s) => !s.terminatedAt)),
      decided: a.investigations[0]?.decision ?? null,
      timeline: [
        ...(a.lastActiveAt ? [{ system: a.system.name, label: "Last active", at: formatDate(a.lastActiveAt) }] : []),
        { system: a.system.name, label: "Account created", at: formatDate(a.createdAt) },
      ],
    }));

  const dormantNames = new Set(dormant.filter((d) => !d.decided).map((d) => d.name));
  const driftedIds = new Set(drift.map((d) => d.assignmentId));
  const pendingIds = new Set(openCerts.map((c) => c.assignmentId));

  const matrix: MatrixRole[] = roles.map((r) => ({
    roleName: r.name,
    roleType: r.roleType,
    assignees: r.assignments.map((asg) => {
      let status: MatrixRole["assignees"][number]["status"] = "normal";
      if (driftedIds.has(asg.id)) status = "drifted";
      else if (dormantNames.has(asg.userName)) status = "dormant";
      else if (pendingIds.has(asg.id)) status = "pending";
      return { name: asg.userName, status };
    }),
  }));

  return (
    <div className="stack">
      <PageHead
        title="Access Insights"
        titleTip="Dormant/orphaned account detection and the full permission matrix. Distinct from Drift: Insights asks whether access is still alive and legitimate, not whether it deviated from baseline. The matrix overlays statuses already computed elsewhere."
      />
      <InsightsClient thresholds={{ human: thresholds.human, service: thresholds.service }} dormant={dormant} matrix={matrix} lastScan={formatDate(new Date())} />
    </div>
  );
}
