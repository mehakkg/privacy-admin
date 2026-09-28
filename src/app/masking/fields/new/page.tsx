import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { EnforcementBanner } from "@/components/masking/EnforcementBanner";
import { CreateField } from "@/components/masking/CreateField";
import { associatedRegionalTemplates } from "@/lib/engines/masking";

export const dynamic = "force-dynamic";

/** SCREEN 4 — create a custom field, blocked live on a code collision. */
export default async function NewFieldPage() {
  const regional = await associatedRegionalTemplates();
  return (
    <Shell active="/masking/fields/new" title="Dynamic Data Masking">
      <PageHead
        crumbs={[{ label: "Masking fields", href: "/masking/fields" }, { label: "New field" }]}
        title="Create a custom field"
        titleTip="A new field's code is checked against every regional template your tenant is associated with. A collision is blocked at creation, because a duplicate code silently fails to resolve at request time."
      />
      <EnforcementBanner />
      <CreateField regionalNames={regional.map((t) => t.name)} />
    </Shell>
  );
}
