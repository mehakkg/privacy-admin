import { db } from "@/lib/db";
import { PageHead, Stat, formatDate } from "@/components/ui";
import { CompactFilterBar } from "@/components/CompactFilterBar";
import { RoleLibrary } from "@/components/access/roleLibrary";
import type { RoleView } from "@/components/access/roleDetailDrawer";
import { decodeList } from "@/lib/codec/json";
import { capabilityById } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** SCREEN 1 — Role Library. Card grid over the single Role table, with the
 *  Compact Filter Bar, counter strip, and the Composer entry point. */
export default async function RolesLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; module?: string }>;
}) {
  const params = await searchParams;
  const term = (params.q ?? "").trim().toLowerCase();

  const roles = await db.rBACRole.findMany({
    include: { _count: { select: { assignments: true } } },
    orderBy: [{ roleType: "asc" }, { name: "asc" }],
  });

  const toView = (r: (typeof roles)[number]): RoleView => ({
    id: r.id,
    name: r.name,
    description: r.description,
    roleType: r.roleType,
    status: r.status,
    capabilityIds: decodeList(r.capabilitiesJson),
    createdBy: r.createdBy,
    approvedBy: r.baselineApprovedBy,
    approvedAt: r.baselineApprovedAt ? formatDate(r.baselineApprovedAt) : null,
    holders: r._count.assignments,
  });

  let views = roles.map(toView);
  const counts = {
    approved: views.filter((v) => v.status === "approved").length,
    draft: views.filter((v) => v.status === "draft").length,
    pending: views.filter((v) => v.status === "pending_dpo_approval").length,
  };

  // Module tags available for the facet, from the capability catalogue in use.
  const modules = [...new Set(views.flatMap((v) => v.capabilityIds.map((id) => capabilityById(id)?.module).filter(Boolean) as string[]))].sort();

  if (params.status) views = views.filter((v) => v.status === params.status);
  if (params.module) views = views.filter((v) => v.capabilityIds.some((id) => capabilityById(id)?.module === params.module));
  if (term) views = views.filter((v) => v.name.toLowerCase().includes(term) || v.description.toLowerCase().includes(term));

  const templates = roles.map(toView).filter((v) => v.status === "approved");

  return (
    <div className="stack">
      <PageHead
        title="Role library"
        titleTip="Every role — system and custom — with enough context to pick the right one before opening it. System roles are governance-owned and locked; custom roles are Admin-composed and go to the DPO for approval."
      />

      <div className="stat-row">
        <Stat label="Approved" value={counts.approved} tone={counts.approved ? "green" : undefined} />
        <Stat label="Draft" value={counts.draft} />
        <Stat label="Pending approval" value={counts.pending} tone={counts.pending ? "yellow" : undefined} />
      </div>

      <CompactFilterBar
        basePath="/access/roles"
        searchKey="q"
        searchPlaceholder="Search roles…"
        facets={[
          { key: "status", label: "Status", options: [
            { value: "approved", label: "Approved" },
            { value: "draft", label: "Draft" },
            { value: "pending_dpo_approval", label: "Pending approval" },
          ] },
          { key: "module", label: "Module", options: modules.map((m) => ({ value: m, label: m })) },
        ]}
      />

      <RoleLibrary roles={views} templates={templates} />
    </div>
  );
}
