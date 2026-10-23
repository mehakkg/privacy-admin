import { Shell } from "@/components/Shell";
import { getDataFlow } from "@/lib/engines/dataflow";
import { DataFlowView } from "@/components/activities/DataFlowView";

export const dynamic = "force-dynamic";

/**
 * Data flow (Data Map redesign) — a derived, read-only six-column map of how
 * personal data moves through Meridian. Computed from the register + collection
 * channels; findings lead; cross-border is informational, never a violation.
 */
export default async function DataFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const sp = await searchParams;
  const view = await getDataFlow(sp.entity || null);
  return (
    <Shell active="/data-flow/map" title="Data flow">
      <DataFlowView view={view} />
    </Shell>
  );
}
