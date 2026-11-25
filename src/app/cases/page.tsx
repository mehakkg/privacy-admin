import { Shell } from "@/components/Shell";
import { CaseInbox } from "@/components/caseflow/CaseInbox";

export const dynamic = "force-dynamic";

/** My Work — the case inbox (Operate phase). Cases assigned to the current user. */
export default function CasesPage() {
  return (
    <Shell active="/cases" title="My Work">
      <CaseInbox />
    </Shell>
  );
}
