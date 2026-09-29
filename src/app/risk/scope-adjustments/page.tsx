import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Scope adjustments folded into Protection rules › Pending changes. */
export default function ScopeAdjustmentsRedirect() {
  redirect("/data-flow/protection-rules?tab=pending");
}
