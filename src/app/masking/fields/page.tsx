import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route → new IA. /masking/fields[?code=X] → /masking[?field=X]. */
export default async function LegacyFieldsRedirect({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  redirect(code ? `/masking?field=${encodeURIComponent(code)}` : "/masking");
}
