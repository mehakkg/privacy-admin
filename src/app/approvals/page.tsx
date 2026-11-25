import { Shell } from "@/components/Shell";
import { ApprovalsInbox } from "@/components/caseflow/ApprovalsInbox";

export const dynamic = "force-dynamic";

/** DPO Approvals inbox (Govern phase) — version publishes, sub-processors, notices. */
export default function ApprovalsPage() {
  return (
    <Shell active="/approvals" title="Approvals">
      <ApprovalsInbox />
    </Shell>
  );
}
