import { redirect } from "next/navigation";
import { iamLink } from "@/lib/products/deeplink";

export const dynamic = "force-dynamic";

/**
 * Dormant accounts are owned by miniOrange IAM (reach-products §5.1/§5.2) and are
 * no longer a DPDP page — they're deep-linked from Access changes. The old route
 * redirects to the IAM portal (here, its holding page).
 */
export default function DormantAccountsMoved() {
  redirect(iamLink("Dormant accounts", { label: "Access changes", href: "/access/changes" }));
}
