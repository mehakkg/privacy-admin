import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, formatDateTime } from "@/components/ui";
import { IdentityResolutionRunner } from "@/components/discovery/IdentityResolutionRunner";
import { getDiscoveryGovernance } from "@/lib/engines/scenario4";

export const dynamic = "force-dynamic";

/** SCREEN 6 — Identity Resolution Run. Executes matching at the DPO-approved
 *  threshold (read-only) and generates the flagged-pair batch for Screen 7. */
export default async function IdentityResolutionPage() {
  const [{ identityMatchThreshold }, last] = await Promise.all([
    getDiscoveryGovernance(),
    db.identityResolutionRun.findFirst({ where: { status: "complete" }, orderBy: { completedAt: "desc" } }),
  ]);

  return (
    <Shell active="/discovery/identity-resolution" title="Data Map / Identity resolution">
      <PageHead title="Identity resolution" titleTip="Runs record matching at the DPO-approved confidence threshold to flag near-duplicate profiles for review. The threshold is a governance parameter — displayed here, not editable by Admin." />
      <IdentityResolutionRunner threshold={identityMatchThreshold} lastRun={last?.completedAt ? { at: formatDateTime(last.completedAt), flagged: last.pairsFlagged } : null} />
    </Shell>
  );
}
