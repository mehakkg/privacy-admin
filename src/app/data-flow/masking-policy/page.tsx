import Link from "next/link";
import { PageHead } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { Home } from "@/components/maskingpolicy/Home";
import { Workspace } from "@/components/maskingpolicy/Workspace";
import { Review } from "@/components/maskingpolicy/Review";
import { VersionView } from "@/components/maskingpolicy/VersionView";

export const dynamic = "force-dynamic";

type SP = { view?: string; version?: string; activated?: string };

/**
 * MASKING POLICY (DDM Console). One route, view-driven: Home (state of
 * protection), the Draft Workspace, Review & activate, and a read-only Version
 * view. The PII Catalog lives at /masking-policy/catalog.
 */
export default async function MaskingPolicyPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const version = sp.version ? Number(sp.version) : null;

  let body: React.ReactNode;
  let subtitle = "Decide how much each audience sees, and know it's right before it goes live.";
  if (version != null) { body = <VersionView number={version} />; subtitle = "A past version, read-only."; }
  else if (sp.view === "review") { body = <Review />; subtitle = "Review the impact, then activate."; }
  else if (sp.view === "workspace") { body = <Workspace />; subtitle = "Draft workspace — changes autosave."; }
  else { body = <Home activated={sp.activated ? Number(sp.activated) : undefined} />; }

  return (
    <Shell active="/data-flow/masking-policy" title="Masking policy">
      <PageHead
        crumbs={[{ label: "Governance" }, { label: "Masking policy" }]}
        title="Masking policy"
        subtitle={subtitle}
        actions={<Link href="/data-flow/masking-policy/catalog" className="row-link">PII catalog</Link>}
      />
      {body}
    </Shell>
  );
}
