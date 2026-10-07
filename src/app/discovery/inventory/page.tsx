import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { getInventory, type InventoryParams } from "@/lib/engines/inventory";
import { InventoryView } from "@/components/inventory/InventoryView";

export const dynamic = "force-dynamic";

/**
 * Data inventory. Top-level page: no breadcrumb. Shows what the DLP found
 * (read-only) and lets Admin add purpose / data category / subject type.
 * Discovery, scanning and classification happen in the DLP, never here.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const params: InventoryParams = {
    segment: sp.segment === "new" || sp.segment === "all" || sp.segment === "attention" ? sp.segment : undefined,
    q: sp.q, system: sp.system, sensitivity: sp.sensitivity, status: sp.status,
    dataType: sp.dataType, dataCategory: sp.dataCategory, purpose: sp.purpose, subject: sp.subject, provenance: sp.provenance,
  };
  const [view, categories] = await Promise.all([
    getInventory(params),
    db.dataCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <Shell active="/discovery/inventory" title="Data inventory">
      <InventoryView
        view={view}
        params={params}
        moved={sp.moved}
        categories={categories.map((c) => ({ id: c.name, name: c.name }))}
        subjectTypes={["customer", "employee", "vendor", "minor"]}
      />
    </Shell>
  );
}
