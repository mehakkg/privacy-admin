import { db } from "@/lib/db";

/**
 * Onboarding / governance-completeness state, computed continuously (not just at
 * onboarding's end) so an abandoned flow or a partial directory sync surfaces the
 * non-dismissible incomplete-state banner on the Dashboard.
 */
export interface OnboardingSnapshot {
  configured: boolean;          // OrgSettings.name present → onboarding ran
  orgName: string | null;
  sizeTier: string | null;
  entityCount: number;
  entitiesMissingGovernance: number;
  assignmentCount: number;
  singleUser: boolean;
  sourceConnected: boolean;
  provisionBannerDismissed: boolean;
  gettingStartedDismissed: boolean;
  /** The narrow, hard gap the red banner watches: zero entities OR any entity
   *  without a governance answer. */
  hasGovernanceGap: boolean;
  /** Full "fully configured" per the spec. */
  isFullyConfigured: boolean;
}

export async function getOnboardingSnapshot(): Promise<OnboardingSnapshot> {
  const [org, entities, assignmentCount, sourceConnected] = await Promise.all([
    db.orgSettings.findUnique({ where: { id: "org" } }),
    db.entity.findMany({ select: { governanceStructure: true } }),
    db.roleAssignment.count(),
    db.discoverySource.count({ where: { connectionState: "connected" } }),
  ]);
  const entityCount = entities.length;
  const entitiesMissingGovernance = entities.filter((e) => !e.governanceStructure).length;
  const singleUser = org?.singleUser ?? false;
  const hasGovernanceGap = entityCount === 0 || entitiesMissingGovernance > 0;
  const isFullyConfigured =
    entityCount >= 1 && entitiesMissingGovernance === 0 && (assignmentCount >= 1 || singleUser);

  return {
    configured: Boolean(org?.name),
    orgName: org?.name ?? null,
    sizeTier: org?.sizeTier ?? null,
    entityCount,
    entitiesMissingGovernance,
    assignmentCount,
    singleUser,
    sourceConnected: sourceConnected > 0,
    provisionBannerDismissed: org?.provisionBannerDismissed ?? false,
    gettingStartedDismissed: org?.gettingStartedDismissed ?? false,
    hasGovernanceGap,
    isFullyConfigured,
  };
}
