import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Masking policy folded into Protection rules › By field. */
export default async function MaskingRedirect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams({ tab: "by-field" });
  for (const k of ["field", "add", "created", "q", "family", "governedBy", "sensitivity", "channel", "status"]) if (sp[k]) q.set(k, sp[k]!);
  redirect(`/data-flow/protection-rules?${q.toString()}`);
}
