import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The rule library is now the Library tab of Protection rules. */
export default async function LibraryRedirect({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  redirect(`/data-flow/protection-rules?tab=library${type ? `&type=${type}` : ""}`);
}
