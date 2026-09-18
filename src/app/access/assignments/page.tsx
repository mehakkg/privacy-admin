import { db } from "@/lib/db";
import { PageHead, Stat, formatDate } from "@/components/ui";
import { Assignments, type AssignmentView, type ProvSystem } from "@/components/access/assignments";
import type { RoleView } from "@/components/access/roleDetailDrawer";
import { decodeList, decodeObject } from "@/lib/codec/json";

export const dynamic = "force-dynamic";

/** SCREENS 4 & 5 — Assignment flow + provisioning status. */
export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const params = await searchParams;

  const [assignments, roles, entities, systems] = await Promise.all([
    db.roleAssignment.findMany({ include: { role: true, entity: true }, orderBy: { grantedAt: "desc" } }),
    db.rBACRole.findMany({ where: { status: "approved" }, orderBy: { name: "asc" } }),
    db.entity.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.connectedSystem.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);

  const views: AssignmentView[] = assignments.map((a) => ({
    id: a.id,
    roleName: a.role.name,
    roleType: a.role.roleType,
    userName: a.userName,
    entityName: a.entity?.name ?? null,
    scope: decodeList(a.scopeSystemsJson),
    justification: a.justification,
    grantedAt: formatDate(a.grantedAt),
    status: a.status,
    provisioning: (decodeObject<ProvSystem[]>(a.provisioningJson) ?? []),
    provisioningStatus: a.provisioningStatus,
  }));

  const roleViews: RoleView[] = roles.map((r) => ({
    id: r.id, name: r.name, description: r.description, roleType: r.roleType, status: r.status,
    capabilityIds: decodeList(r.capabilitiesJson), createdBy: r.createdBy,
    approvedBy: r.baselineApprovedBy, approvedAt: null, holders: 0,
  }));

  const partial = views.filter((v) => v.provisioningStatus === "partial" || v.provisioningStatus === "failed").length;

  return (
    <div className="stack">
      <PageHead
        title="Assignments"
        titleTip="Approved roles granted to people, scoped to systems, each with a recorded justification. Provisioning is confirmed per system — a partial failure is never shown as success."
      />

      <div className="stat-row">
        <Stat label="Active assignments" value={views.filter((v) => v.status === "active").length} />
        <Stat label="Fully provisioned" value={views.filter((v) => v.provisioningStatus === "granted").length} tone="green" />
        <Stat label="Partial / failed" value={partial} tone={partial ? "red" : undefined} />
      </div>

      <Assignments
        assignments={views}
        roles={roleViews}
        entities={entities}
        systems={systems.map((s) => s.name)}
        initialRoleId={params.role ?? null}
      />
    </div>
  );
}
