import { Shell } from "@/components/Shell";
import { getPurposesView } from "@/lib/engines/purposes";
import { PurposesView } from "@/components/activities/PurposesView";

export const dynamic = "force-dynamic";

/** Purposes (Data Map redesign) — why personal data is processed, where each
 *  purpose sits in approval, and whether a consent purpose is in a published notice. */
export default async function PurposesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const view = await getPurposesView();
  return (
    <Shell active="/data-map/processing-activities" title="Purposes">
      <PurposesView view={view} segment={sp.segment ?? "needs_action"} />
    </Shell>
  );
}
