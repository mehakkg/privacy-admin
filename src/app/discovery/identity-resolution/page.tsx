import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Identity resolution moved to Rights requests › Identity matching. */
export default function IdentityResolutionRedirect() {
  redirect("/requests/identity-matching");
}
