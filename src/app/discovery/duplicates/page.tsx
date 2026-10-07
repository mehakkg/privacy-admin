import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Near-duplicate resolution moved to Rights requests › Identity matching. */
export default function DuplicatesRedirect() {
  redirect("/requests/identity-matching?moved=review-queue");
}
