import { Shell } from "@/components/Shell";
import { getActivitiesView, type ActivitiesViewParams } from "@/lib/engines/activities";
import { ActivitiesList } from "@/components/activities/ActivitiesList";
import type { ReadinessBucket } from "@/lib/activities/readiness";

export const dynamic = "force-dynamic";

const BUCKETS = ["needs_work", "waiting_for_dpo", "review_due", "approved", "all"];

/**
 * Activities — the register of how personal data is processed (Data Map redesign).
 * Nine-state readiness drives every count; nothing is hard-coded. Title = nav label.
 */
export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const params: ActivitiesViewParams = {
    bucket: BUCKETS.includes(sp.bucket ?? "") ? (sp.bucket as ReadinessBucket | "all") : undefined,
    q: sp.q, entityId: sp.entityId, principal: sp.principal, department: sp.department,
  };
  const view = await getActivitiesView(params);
  return (
    <Shell active="/data-map/processing-activities" title="Activities">
      <ActivitiesList view={view} params={params} />
    </Shell>
  );
}
