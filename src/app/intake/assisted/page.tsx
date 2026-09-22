import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { AssistedIntakeForm, type AvailableVerification } from "@/components/omnichannel/AssistedIntakeForm";
import { formatDate } from "@/components/ui";

export const dynamic = "force-dynamic";

/** SCREEN 1 — Assisted Request Intake. Submission is blocked until a completed,
 *  unconsumed IdentityVerification is linked. Creates a standard DPRRTicket that
 *  appears in the existing Central Queue with channel_origin visible. */
export default async function AssistedIntakePage() {
  const available = await db.identityVerification.findMany({
    where: { consumed: false, requestId: null },
    orderBy: { verifiedAt: "desc" },
  });
  const verifications: AvailableVerification[] = available.map((v) => ({
    id: v.id, method: v.method,
    detail: v.documentType ?? v.attestingEmployeeId ?? "OTP-verified",
    verifiedAt: formatDate(v.verifiedAt),
  }));

  return (
    <Shell active="/intake/assisted" title="Intake / Assisted request">
      <PageHead title="Assisted request intake" titleTip="Raise a rights request on behalf of a data principal at a branch or over the phone. It cannot be submitted without a linked identity verification." />
      <AssistedIntakeForm verifications={verifications} />
    </Shell>
  );
}
