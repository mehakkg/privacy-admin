import { redirect } from "next/navigation";
import { dlpLink } from "@/lib/products/deeplink";

export const dynamic = "force-dynamic";

/**
 * Policy violations are owned by miniOrange DLP (reach-products §4.2) and are no
 * longer a DPDP page. The old route redirects to the DLP portal (here, its
 * holding page), which names the object.
 */
export default function PolicyViolationsMoved() {
  redirect(dlpLink("Policy violations", { label: "Data inventory", href: "/data-map/inventory" }));
}
