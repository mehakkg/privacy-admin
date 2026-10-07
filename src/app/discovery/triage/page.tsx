import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Review queue was removed — its four jobs moved to where they belong. This stub
 * keeps the old route alive (never a 404) and forwards each tab to its new home.
 * The `moved` flag shows the one-line relocation note on the destination.
 */
export default async function ReviewQueueRedirect({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const dest: Record<string, string> = {
    unclassified: "/discovery/inventory?filter=not-classified&moved=review-queue",
    quarantine: "/discovery/quarantine?moved=review-queue",
    duplicates: "/requests/identity-matching?moved=review-queue",
    scripts: "/consent/cookies?tab=monitoring&moved=review-queue",
  };
  redirect(dest[type ?? ""] ?? "/discovery/inventory?filter=not-classified&moved=review-queue");
}
