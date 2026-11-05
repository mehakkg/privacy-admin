import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { AccessChangesView } from "@/components/access/AccessChangesView";
import { ACCESS_CHANGES } from "@/lib/products/accessChanges";
import { getCurrentRole } from "@/lib/session";
import { canOpenProduct } from "@/lib/products/people";

export const dynamic = "force-dynamic";

/** Access changes (Operate › Access). The tracking + evidence layer for access
 *  revocations triggered by privacy events; execution happens in miniOrange IAM
 *  and each row is verified by an IAM receipt (reach-products §5.3). The IAM
 *  contextual links render only if the acting-as person can open IAM (§3). */
export default async function AccessChangesPage() {
  const role = await getCurrentRole();
  const canOpenIam = canOpenProduct(role, "iam");
  return (
    <Shell active="/access/changes" title="Access / Access changes">
      <PageHead title="Access changes" titleTip="Access revoked or granted because of a privacy event, verified system by system. Execution happens in miniOrange IAM; this is the evidence and tracking layer." />
      <p className="cell-sub" style={{ margin: "0 0 16px" }}>Access revoked or granted because of a privacy event, verified system by system from IAM receipts.</p>
      <AccessChangesView initial={ACCESS_CHANGES} canOpenIam={canOpenIam} />
    </Shell>
  );
}
