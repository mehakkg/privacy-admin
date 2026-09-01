import { redirect } from "next/navigation";

/**
 * Revocation verification is now a tab inside Deprovisioning — verifying a
 * revocation completed is a state of that workflow, not a separate object.
 * This route is kept as a redirect so any existing link still lands correctly.
 */
export default function VerificationRedirect() {
  redirect("/access/deprovisioning?view=verify");
}
