import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Sources was removed — the DLP is the discovery source now. Systems it finds
 *  appear in Data inventory. This stub keeps the old route alive (never a 404). */
export default function SourcesRedirect() {
  redirect("/discovery/inventory?moved=sources");
}
