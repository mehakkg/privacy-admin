import { Shell } from "@/components/Shell";
import { getPurposeLibrary } from "@/lib/engines/purposes";
import { PurposeLibrary } from "@/components/activities/PurposeLibrary";

export const dynamic = "force-dynamic";

/** SCREEN 10 — Purpose library. Which purposes exist, and where each is in approval. */
export default async function PurposesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const view = await getPurposeLibrary();
  return (
    <Shell active="/data-map/processing-activities" title="Purposes">
      <PurposeLibrary view={view} segment={sp.segment ?? "needs-attention"} q={sp.q ?? ""} />
    </Shell>
  );
}
