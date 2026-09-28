import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route → new IA. /masking/fields/new → /masking?add=1. */
export default function LegacyNewFieldRedirect() {
  redirect("/masking?add=1");
}
