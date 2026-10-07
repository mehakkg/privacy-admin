import { ExternalLink } from "lucide-react";
import { Shell } from "@/components/Shell";
import { PageHead, Notice } from "@/components/ui";
import { MovedNote } from "@/components/MovedNote";

export const dynamic = "force-dynamic";

/**
 * Quarantine is managed in the DLP now. When the DLP exposes quarantine status,
 * it would show read-only in Data inventory; our connected DLP does not, so this
 * is the "Managed in DLP" fallback the spec calls for — never a 404.
 */
export default async function QuarantineRedirectPage({ searchParams }: { searchParams: Promise<{ moved?: string }> }) {
  const { moved } = await searchParams;
  return (
    <Shell active="/discovery/inventory" title="Data Map / Quarantine">
      <PageHead title="Quarantine" titleTip="High-risk findings are isolated and released in the DLP. Privacy Admin shows quarantine read-only in Data inventory only where the DLP exposes it." />
      <MovedNote moved={moved} />
      <Notice tone="info" title="Managed in DLP">
        Quarantine candidates and their release approvals are handled in the DLP. The connected DLP doesn&rsquo;t expose quarantine status, so there is nothing to show here in Privacy Admin.
        <div style={{ marginTop: 10 }}>
          <a className="btn sm" href="#" aria-label="Open in DLP (opens the external DLP console)">Open in DLP <ExternalLink size={13} /></a>
        </div>
      </Notice>
    </Shell>
  );
}
