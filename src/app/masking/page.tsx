import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Masking policy folded into the single Protection rules table. */
export default async function MaskingRedirect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const k of ["field", "add", "created", "q", "family", "governedBy", "sensitivity", "channel", "status", "group"]) if (sp[k]) q.set(k, sp[k]!);
  const s = q.toString();
  redirect(s ? `/data-flow/protection-rules?${s}` : "/data-flow/protection-rules");
}
