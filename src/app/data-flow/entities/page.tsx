import { redirect } from "next/navigation";

// Entity Configuration was promoted out of Data Flow & Protection Rules and
// renamed to Fiduciaries, now a top-level CONFIGURE section. This redirect keeps
// any old link working.
export default function EntitiesMoved() {
  redirect("/fiduciaries");
}
