import { Shell } from "@/components/Shell";
import { getActivityList, type ActivityListParams } from "@/lib/engines/activities";
import { ActivitiesList } from "@/components/activities/ActivitiesList";

export const dynamic = "force-dynamic";

/**
 * SCREEN 1 — Processing activities list (governance flow). Which activities need
 * work, and the next step for each. Top-level page: no breadcrumb. The old
 * Fiduciaries tab moved to Settings › Organization › Entities.
 */
export default async function ProcessingActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const params: ActivityListParams = {
    segment: sp.segment === "under-review" || sp.segment === "all" || sp.segment === "needs-work" ? sp.segment : undefined,
    q: sp.q, owner: sp.owner, department: sp.department, purpose: sp.purpose, lifecycle: sp.lifecycle,
  };
  const view = await getActivityList(params);
  return (
    <Shell active="/data-map/processing-activities" title="Processing activities">
      <ActivitiesList view={view} params={params} />
    </Shell>
  );
}
