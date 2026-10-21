import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Connection health (Settings). Every system the platform depends on, and whether
 *  it's answering. Reuses the existing DLP/processor health fixtures so the
 *  dashboard alerts and this page agree. Full table + drawer land next milestone. */
export default function ConnectionHealthPage() {
  return (
    <Shell active="/integrations/health" title="Settings / Connection health">
      <PageHead title="Connection health" titleTip="Every system the platform depends on, and whether it's answering." />
      <p className="cell-sub" style={{ margin: "0 0 16px" }}>Every system the platform depends on, and whether it&rsquo;s answering.</p>
      <div className="empty">Connection health is being built in this release.</div>
    </Shell>
  );
}
