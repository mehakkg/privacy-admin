import { Shell } from "@/components/Shell";
import { NewWorkflow } from "@/components/caseflow/NewWorkflow";

export const dynamic = "force-dynamic";

/**
 * New workflow (Configure phase) — guided creation of a journey's governance
 * frame: start from blank / template / clone, set domain, entity, legal basis
 * and deadline ceiling, pick roles, then open the Journey Editor as a draft.
 */
export default function NewWorkflowPage() {
  return (
    <Shell active="/workflows" title="New workflow">
      <NewWorkflow />
    </Shell>
  );
}
