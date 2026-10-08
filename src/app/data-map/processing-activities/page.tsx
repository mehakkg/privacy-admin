import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { getCurrentRole } from "@/lib/session";
import { getActivityList, type ActivityListParams } from "@/lib/engines/activities";
import { ActivitiesList } from "@/components/activities/ActivitiesList";
import { DevBar } from "@/components/activities/DevBar";

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
  const dev = sp.dev === "1";
  const [view, role, cfg] = await Promise.all([
    getActivityList(params),
    dev ? getCurrentRole() : Promise.resolve("admin" as const),
    dev ? db.integrationConfig.findUnique({ where: { id: "singleton" }, select: { paMultiEntity: true, paRequireDpoReview: true } }) : Promise.resolve(null),
  ]);
  return (
    <Shell active="/data-map/processing-activities" title="Processing activities">
      {dev && <DevBar role={role} multiEntity={cfg?.paMultiEntity ?? false} requireDpoReview={cfg?.paRequireDpoReview ?? false} />}
      <ActivitiesList view={view} params={params} />
    </Shell>
  );
}
