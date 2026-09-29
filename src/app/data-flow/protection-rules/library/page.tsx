import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
/** Library folded into the drawer's "View template"; go to the table. */
export default function LibraryRedirect() { redirect("/data-flow/protection-rules"); }
