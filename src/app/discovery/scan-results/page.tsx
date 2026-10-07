import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Undisclosed-scripts findings live on the website/cookie scan page now. */
export default function ScanResultsRedirect() {
  redirect("/consent/cookies?tab=monitoring&moved=review-queue");
}
