import { redirect } from "next/navigation";
import { iamLink } from "@/lib/products/deeplink";

export const dynamic = "force-dynamic";

/**
 * Personal-data access review (dormant/orphaned detection + the RBAC matrix) is
 * owned by miniOrange IAM (reach-products §5.1/§5.2) and is no longer a DPDP
 * page — it's deep-linked from Access changes. The old route redirects to the
 * IAM portal (here, its holding page).
 */
export default function AccessReviewMoved() {
  redirect(iamLink("Access review campaigns", { label: "Access changes", href: "/access/changes" }));
}
