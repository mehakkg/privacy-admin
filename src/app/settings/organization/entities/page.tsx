import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Retired route — "Entities" is now the Fiduciaries tab on Organization. */
export default function EntitiesRedirect() {
  redirect("/settings/organization?tab=fiduciaries");
}
