import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Access changes (Operate › Access). Tracking + evidence layer for access
 *  revocations/grants triggered by privacy events; execution happens in miniOrange
 *  IAM. Full queue + drawer land in the next milestone. */
export default function AccessChangesPage() {
  return (
    <Shell active="/access/changes" title="Access / Access changes">
      <PageHead title="Access changes" titleTip="Access revoked or granted because of a privacy event, verified system by system. Execution happens in miniOrange IAM; this is the evidence and tracking layer." />
      <p className="cell-sub" style={{ margin: "0 0 16px" }}>Access revoked or granted because of a privacy event, verified system by system.</p>
      <div className="empty">The access-change queue is being built in this release.</div>
    </Shell>
  );
}
