import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { getActivityDetail } from "@/lib/engines/activities";
import { ActivityDetail } from "@/components/activities/ActivityDetail";

export const dynamic = "force-dynamic";

/** Activity detail (Data Map redesign) — the register record for one activity,
 *  shown as five tabs: Data fields · Purposes · Systems & processors · Consent ·
 *  History. Read-oriented; editing happens in the /edit workspace. */
export default async function ActivityDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const view = await getActivityDetail(id);
  if (!view) notFound();
  return (
    <Shell active="/data-map/processing-activities" title={view.name}>
      <ActivityDetail view={view} tab={sp.tab} />
    </Shell>
  );
}
