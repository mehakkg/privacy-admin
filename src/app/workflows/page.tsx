import { Shell } from "@/components/Shell";
import { buildPlan } from "@/lib/workflows/derive";
import { WorkflowsView } from "@/components/workflows/WorkflowsView";

export const dynamic = "force-dynamic";

/**
 * Workflows — end-to-end journeys stitched from the task register. Each journey
 * is an ordered chain of steps that crosses roles; readiness is derived from the
 * build status of its steps, so the team can see which journeys are buildable
 * today and where a handoff breaks.
 */
export default function WorkflowsPage() {
  const plan = buildPlan();
  return (
    <Shell active="/workflows" title="Workflows">
      <div className="stack" style={{ gap: 4, marginBottom: 2 }}>
        <p className="dh-kicker">Program map</p>
        <h1 className="inv-title">Workflows</h1>
        <p className="cell-sub" style={{ margin: 0 }}>End-to-end journeys derived from the task register — where each one is buildable today, and where a handoff breaks.</p>
      </div>
      <WorkflowsView plan={plan} />
    </Shell>
  );
}
