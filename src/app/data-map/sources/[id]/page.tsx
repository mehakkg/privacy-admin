import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** A single source's detail — Sources is gone; forward to Data inventory. */
export default function SourceDetailRedirect() {
  redirect("/discovery/inventory?moved=sources");
}
