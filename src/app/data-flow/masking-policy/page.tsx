import Link from "next/link";
import { PageHead } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { Home } from "@/components/maskingpolicy/Home";
import { Workspace } from "@/components/maskingpolicy/Workspace";
import { Review } from "@/components/maskingpolicy/Review";
import { Live } from "@/components/maskingpolicy/Live";
import { VersionView } from "@/components/maskingpolicy/VersionView";
import { Versions } from "@/components/maskingpolicy/Versions";

export const dynamic = "force-dynamic";

type SP = { view?: string; version?: string; versions?: string; focus?: string; n?: string; see?: string };

/**
 * MASKING POLICY (DDM Console). View-driven: Home, Draft Workspace, Review,
 * Live confirmation, Version view, All versions. PII catalog at /catalog.
 */
export default async function MaskingPolicyPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;

  let body: React.ReactNode;
  if (sp.version) body = <VersionView number={Number(sp.version)} />;
  else if (sp.versions) body = <Versions />;
  else if (sp.view === "live" && sp.n) body = <Live number={Number(sp.n)} />;
  else if (sp.view === "review") body = <Review />;
  else if (sp.view === "workspace") body = <Workspace focus={sp.focus} />;
  else body = <Home see={sp.see} />;

  const showHead = !(sp.view === "live");
  return (
    <Shell active="/data-flow/masking-policy" title="Masking policy">
      {showHead && (
        <PageHead
          title="Masking policy"
          subtitle="Decide how much each audience sees, and know it's right before it goes live."
          actions={<span className="row" style={{ gap: 14 }}><Link href="/data-flow/masking-policy/catalog" className="row-link">Data catalog</Link><Link href="/data-flow/masking-policy/audit" className="row-link">Audit trail</Link></span>}
        />
      )}
      {body}
    </Shell>
  );
}
