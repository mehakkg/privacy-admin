import { Shell } from "@/components/Shell";
import { getRopaRecs } from "@/lib/engines/ropaRecs";
import { RopaRecommendations } from "@/components/activities/RopaRecommendations";

export const dynamic = "force-dynamic";

/**
 * Suggested activities (renamed from "ROPA recommendations") — activities
 * suggested from DLP-classified data. Accepting one creates a draft activity;
 * it enters the register only after its checks pass and the DPO approves it.
 */
export default async function SuggestedActivitiesPage() {
  const view = await getRopaRecs();
  return (
    <Shell active="/data-map/suggested-activities" title="Suggested activities">
      <RopaRecommendations view={view} />
    </Shell>
  );
}
