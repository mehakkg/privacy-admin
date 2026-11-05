import { redirect } from "next/navigation";
import { dlpLink } from "@/lib/products/deeplink";

export const dynamic = "force-dynamic";

/**
 * The user-directory findings for data are owned by miniOrange DLP
 * (reach-products §4.2) and are no longer a DPDP page. The old route redirects
 * to the DLP portal (here, its holding page).
 */
export default function UserDirectoryMoved() {
  redirect(dlpLink("User directory"));
}
