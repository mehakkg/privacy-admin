import { Shell } from "@/components/Shell";
import { getPurposesView } from "@/lib/engines/purposes";
import { getCurrentRole } from "@/lib/session";
import { PurposesScreen } from "@/components/activities/PurposesScreen";

export const dynamic = "force-dynamic";

/** Purposes (Master spec Part D) — a summary strip + My work / All purposes tabs
 *  and a detail pane. Why personal data is processed, where each purpose sits in
 *  approval, and whether a consent purpose is in a published notice. */
export default async function PurposesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [sp, view, role] = await Promise.all([searchParams, getPurposesView(), getCurrentRole()]);
  return (
    <Shell active="/data-map/purposes" title="Purposes">
      <PurposesScreen view={view} role={role} tab={sp.tab ?? ""} initialPurpose={sp.purpose} />
    </Shell>
  );
}
