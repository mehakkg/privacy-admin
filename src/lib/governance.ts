import { db } from "@/lib/db";

/**
 * Org governance structure. `dedicated_dpo` routes approvals to a separate DPO;
 * `combined_admin_dpo` routes them back to the same person acting in a DPO
 * capacity — the review step is never skipped, and the approval is recorded as
 * self-approved. Stored as a singleton OrgSettings row (id "org").
 */
export const GOVERNANCE = {
  DEDICATED: "dedicated_dpo",
  COMBINED: "combined_admin_dpo",
} as const;
export type GovernanceStructure = (typeof GOVERNANCE)[keyof typeof GOVERNANCE];

export async function getGovernanceStructure(): Promise<GovernanceStructure> {
  try {
    const s = await db.orgSettings.findUnique({ where: { id: "org" } });
    return (s?.governanceStructure as GovernanceStructure) ?? GOVERNANCE.DEDICATED;
  } catch {
    return GOVERNANCE.DEDICATED;
  }
}

export async function isCombinedGovernance(): Promise<boolean> {
  return (await getGovernanceStructure()) === GOVERNANCE.COMBINED;
}
