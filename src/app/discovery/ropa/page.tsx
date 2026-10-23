import { Shell } from "@/components/Shell";
import { getRopaRecs } from "@/lib/engines/ropaRecs";
import { RopaRecommendations } from "@/components/activities/RopaRecommendations";

export const dynamic = "force-dynamic";

/**
 * ROPA recommendations (Data Map redesign) — suggested activities generated from
 * DLP-classified data. Nothing enters the register until accepted + DPO-approved;
 * evidence shows masked samples only.
 */
export default async function RopaPage() {
  const view = await getRopaRecs();
  return (
    <Shell active="/discovery/ropa" title="ROPA recommendations">
      <RopaRecommendations view={view} />
    </Shell>
  );
}
