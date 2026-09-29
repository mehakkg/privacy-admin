import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
/** Pending approvals are a Status filter on the Protection rules table. */
export default function ScopeAdjustmentsRedirect() { redirect("/data-flow/protection-rules?status=pending"); }
