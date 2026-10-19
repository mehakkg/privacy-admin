import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Data inventory moved to the Data map root. Redirect, preserving query params. */
export default async function MovedInventory({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v != null) as [string, string][]).toString();
  redirect(`/data-map/inventory${qs ? `?${qs}` : ""}`);
}
