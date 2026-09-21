import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { OnboardingWizard, type OnbEntity } from "@/components/onboarding/OnboardingWizard";
import type { RoleView } from "@/components/access/roleDetailDrawer";
import { decodeList } from "@/lib/codec/json";

export const dynamic = "force-dynamic";

/**
 * First-time Admin onboarding — one container, forking into the Lean path
 * (Startup / Mid-market) and the Structured path (Enterprise), converging at the
 * Dashboard. Governance is captured per entity; nothing defaults silently.
 */
export default async function OnboardingPage() {
  const [roles, entities, org] = await Promise.all([
    db.rBACRole.findMany({ where: { status: "approved" }, orderBy: [{ roleType: "asc" }, { name: "asc" }] }),
    db.entity.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, governanceStructure: true } }),
    db.orgSettings.findUnique({ where: { id: "org" } }),
  ]);

  const roleViews: RoleView[] = roles.map((r) => ({
    id: r.id, name: r.name, description: r.description, roleType: r.roleType, status: r.status,
    capabilityIds: decodeList(r.capabilitiesJson), createdBy: r.createdBy,
    approvedBy: r.baselineApprovedBy, approvedAt: null, holders: 0,
  }));
  const entityViews: OnbEntity[] = entities.map((e) => ({ id: e.id, name: e.name, governanceStructure: e.governanceStructure }));

  return (
    <Shell active="/get-started" title="Get started">
      <PageHead title="Get started" subtitle="A few decisions to set your organization up correctly. You can change any of it later." />
      <OnboardingWizard roles={roleViews} entities={entityViews} initialSize={org?.sizeTier ?? null} />
    </Shell>
  );
}
