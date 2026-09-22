import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { QuarantineList, type QuarantineRow } from "@/components/discovery/QuarantineList";
import { getCurrentRole } from "@/lib/session";

export const dynamic = "force-dynamic";

/** SCREEN 4 — High-Risk Quarantine & Share-Approval Gate. Quarantined findings
 *  can't be shared directly — only through an approval routed to DPO/CISO. */
export default async function QuarantinePage() {
  const [fields, role] = await Promise.all([
    db.classifiedField.findMany({ where: { quarantined: true }, include: { source: { select: { name: true } }, shareApprovals: { orderBy: { requestedAt: "desc" }, take: 1 } }, orderBy: { fieldPath: "asc" } }),
    getCurrentRole(),
  ]);

  const rows: QuarantineRow[] = fields.map((f) => {
    const req = f.shareApprovals[0];
    return {
      id: f.id, fieldPath: f.fieldPath, sourceName: f.source.name, detectedType: f.overriddenType ?? f.detectedType,
      request: req ? { id: req.id, status: req.status, approverRole: req.approverRole, requestedBy: req.requestedBy, decidedBy: req.decidedBy, decisionNote: req.decisionNote } : null,
    };
  });

  return (
    <Shell active="/discovery/quarantine" title="Data Map / Quarantine">
      <PageHead title="Quarantine & share approval" titleTip="High-risk findings are isolated automatically. Sharing or releasing one is gated by an explicit approval routed to the DPO or CISO — quarantine means something operationally, not just visually." />
      <QuarantineList rows={rows} role={role} />
    </Shell>
  );
}
