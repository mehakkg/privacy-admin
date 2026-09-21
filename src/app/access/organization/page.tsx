import { PageHead } from "@/components/ui";
import { OrganizationSetup } from "@/components/access/organizationSetup";
import { getGovernanceStructure } from "@/lib/governance";

export const dynamic = "force-dynamic";

/** Identity & Access → Organization setup: the governance-structure question. */
export default async function OrganizationSetupPage() {
  const structure = await getGovernanceStructure();
  return (
    <div className="stack">
      <PageHead
        title="Governance setup"
        titleTip="How approval requests route across the product. A combined Admin+DPO org still goes through the Approval Queue — the review is never skipped — and self-approvals are marked in the audit trail."
      />
      <OrganizationSetup structure={structure} />
    </div>
  );
}
