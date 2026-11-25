import { Shell } from "@/components/Shell";
import { VersionReview } from "@/components/caseflow/VersionReview";

export const dynamic = "force-dynamic";

/**
 * Version Review (Govern phase) — DPO reviews a submitted workflow version as a
 * diff against the live version and approves & publishes, or sends it back. The
 * slice drives the WF-DR-01 v4 approval regardless of id.
 */
export default function VersionReviewPage() {
  return (
    <Shell active="/approvals" title="Version review">
      <VersionReview />
    </Shell>
  );
}
