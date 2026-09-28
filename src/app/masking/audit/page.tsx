import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Masking events live in the single hash-chained Audit log now. This route
 * redirects to the Audit log pre-filtered to the masking module, preserving any
 * field deep link.
 */
export default async function MaskingAuditRedirect({ searchParams }: { searchParams: Promise<{ field?: string }> }) {
  const { field } = await searchParams;
  redirect(`/audit?module=masking${field ? `&field=${encodeURIComponent(field)}` : ""}`);
}
