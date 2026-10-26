import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Retired route — "ROPA recommendations" is now "Suggested activities". */
export default function RopaRedirect() {
  redirect("/data-map/suggested-activities");
}
