import { redirect } from "next/navigation";
import { dlpLink } from "@/lib/products/deeplink";

export const dynamic = "force-dynamic";

/** Scan schedules, scope and configuration live in miniOrange DLP (reach-products
 *  §4.1). The old route redirects to the DLP portal (here, its holding page). */
export default function ScanConfigMoved() {
  redirect(dlpLink("Scan configuration", { label: "Data inventory", href: "/data-map/inventory" }));
}
