import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { CookieCategoryManager, type CatRow } from "@/components/consent/CookieCategoryManager";
import { getCurrentRole } from "@/lib/session";

export const dynamic = "force-dynamic";

/** SCREEN 7 — Cookie Category Creation & Default State. Custom categories beyond
 *  the 4 standard, with the default on/off set in the same place, routed through
 *  DPO approval. */
export default async function CookieCategoriesPage() {
  const [cats, role] = await Promise.all([
    db.cookieCategory.findMany({ orderBy: { name: "asc" } }),
    getCurrentRole(),
  ]);
  const toRow = (c: (typeof cats)[number]): CatRow => ({ id: c.id, name: c.name, description: c.description, defaultState: c.defaultState, status: c.status, custom: c.custom, proposedBy: c.proposedBy });
  const standard = cats.filter((c) => !c.custom).map(toRow);
  const live = cats.filter((c) => c.custom && c.status === "approved").map(toRow);
  const pending = cats.filter((c) => c.status === "pending_dpo_approval").map(toRow);

  return (
    <Shell active="/consent/cookie-categories" title="Consent & Notices / Cookie categories">
      <PageHead title="Cookie categories" titleTip="Create a DPO-approved custom cookie category beyond the four standard ones and set its default on/off state in the same screen. Admin proposes; the DPO approves before it goes live." />
      <CookieCategoryManager standard={standard} pending={pending} live={live} role={role} />
    </Shell>
  );
}
