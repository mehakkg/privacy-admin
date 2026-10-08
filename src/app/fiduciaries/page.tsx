import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Fiduciaries moved to Settings › Organization › Entities. Keep the old route
 *  alive with a permanent-style forward + the one-line note on the destination. */
export default function FiduciariesRedirect() {
  redirect("/settings/organization/entities?moved=fiduciaries");
}
