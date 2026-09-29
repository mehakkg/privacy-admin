import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
/** The rule library is now the drawer's "View template"; go to the table. */
export default function MaskingRulesRedirect() { redirect("/data-flow/protection-rules"); }
