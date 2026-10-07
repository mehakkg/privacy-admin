import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy Sources search — removed. The DLP is the discovery source now. */
export default function DiscoverySourcesRedirect() {
  redirect("/discovery/inventory?moved=sources");
}
