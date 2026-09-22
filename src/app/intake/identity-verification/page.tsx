import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { IdentityVerificationForm, type VerifiedRow } from "@/components/omnichannel/IdentityVerificationForm";

export const dynamic = "force-dynamic";

/** SCREEN 2 — In-person identity verification. A verified record here is the
 *  hard prerequisite for creating an assisted request (Screen 1). */
export default async function IdentityVerificationPage() {
  const [docTypeRows, recent] = await Promise.all([
    db.idDocumentType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.identityVerification.findMany({ orderBy: { verifiedAt: "desc" }, take: 8 }),
  ]);
  const docTypes = docTypeRows.map((d) => ({ label: d.label, note: d.note }));
  const rows: VerifiedRow[] = recent.map((v) => ({
    id: v.id, method: v.method, documentType: v.documentType, attestingEmployeeId: v.attestingEmployeeId,
    verifiedAt: v.verifiedAt.toISOString(), consumed: v.consumed,
  }));

  return (
    <Shell active="/intake/identity-verification" title="Intake / Identity verification">
      <PageHead title="In-person identity verification" titleTip="Document the data principal's identity before an assisted request can be raised. No 'verified' state is reachable without a specific method path completed." />
      <IdentityVerificationForm docTypes={docTypes} recent={rows} />
    </Shell>
  );
}
