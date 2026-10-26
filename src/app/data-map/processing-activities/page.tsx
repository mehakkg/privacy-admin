import { Shell } from "@/components/Shell";
import { getCurrentRole } from "@/lib/session";
import { getActivitiesScreen } from "@/lib/engines/activities";
import { ActivitiesScreen } from "@/components/activities/ActivitiesScreen";

export const dynamic = "force-dynamic";

/**
 * Activities (redesign) — a coverage strip + two tabs: "My work" (what I must do)
 * and "Register" (the full record list). Keeps the ?bucket= param: bucket=all →
 * tab=register, any other bucket → tab=work.
 */
export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [sp, role] = await Promise.all([searchParams, getCurrentRole()]);
  let tab = sp.tab === "work" || sp.tab === "register" ? sp.tab : "";
  if (!tab && sp.bucket) tab = sp.bucket === "all" ? "register" : "work";
  const screen = await getActivitiesScreen();
  return (
    <Shell active="/data-map/processing-activities" title="Activities">
      <ActivitiesScreen screen={screen} role={role} tab={tab} initialActivity={sp.activity} />
    </Shell>
  );
}
