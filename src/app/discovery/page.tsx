import { redirect } from "next/navigation";
import { dlpLink } from "@/lib/products/deeplink";

export const dynamic = "force-dynamic";

/**
 * Discovery scans are owned by miniOrange DLP (reach-products §4.2). DPDP reads
 * from DLP but no longer hosts the scans page; the old Data Governance route
 * redirects to the DLP portal (here, its holding page).
 */
export default function DiscoveryScansMoved() {
  redirect(dlpLink("Discovery scans", { label: "Data inventory", href: "/data-map/inventory" }));
}
