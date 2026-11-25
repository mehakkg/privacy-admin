import { Shell } from "@/components/Shell";
import { JourneyEditor } from "@/components/caseflow/JourneyEditor";

export const dynamic = "force-dynamic";

/**
 * Journey Editor (Workflow & Case Management — Configure phase). Edits the draft
 * version of WF-DR-01: step owners/backups, assignment rules, locked DPO steps,
 * role handoffs, deadlines under the legal ceiling, then validate → submit to DPO.
 */
export default function JourneyEditorPage() {
  return (
    <Shell active="/workflows" title="Journey editor">
      <JourneyEditor />
    </Shell>
  );
}
