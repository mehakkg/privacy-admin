import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** A single legacy source's detail — Sources is gone; forward to Data inventory. */
export default function DiscoverySourceDetailRedirect() {
  redirect("/discovery/inventory?moved=sources");
}
