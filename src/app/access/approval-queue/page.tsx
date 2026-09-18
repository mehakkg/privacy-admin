import { db } from "@/lib/db";
import { PageHead, Stat } from "@/components/ui";
import { ApprovalQueue, type QueueItem } from "@/components/access/approvalQueue";
import { getCurrentRole } from "@/lib/session";
import { decodeList } from "@/lib/codec/json";
import { isCombinedGovernance } from "@/lib/governance";

export const dynamic = "force-dynamic";

/** SCREEN 3 — Approval Queue. One queue for pending custom roles AND proposed
 *  purposes awaiting a DPO/CISO decision. */
export default async function ApprovalQueuePage() {
  const role = await getCurrentRole();
  const combined = await isCombinedGovernance();

  const [pendingRoles, pendingPurposes] = await Promise.all([
    db.rBACRole.findMany({ where: { status: "pending_dpo_approval" }, orderBy: { baselineApprovedAt: "asc" } }),
    db.purposeTag.findMany({ where: { status: "pending_dpo_approval" }, orderBy: { proposedAt: "asc" } }),
  ]);

  // Resolve each proposed purpose's linked element for DPO context.
  const elementIds = pendingPurposes.map((p) => p.linkedElementId).filter(Boolean) as string[];
  const elements = elementIds.length
    ? await db.activityElement.findMany({ where: { id: { in: elementIds } }, include: { activity: true } })
    : [];
  const elementById = new Map(elements.map((e) => [e.id, e]));

  const roleItems: QueueItem[] = pendingRoles.map((r) => ({
    id: r.id, kind: "role", name: r.name, description: r.description,
    requester: r.createdBy ?? "Admin", submittedAt: r.baselineApprovedAt.toISOString(),
    capabilityIds: decodeList(r.capabilitiesJson),
  }));

  const purposeItems: QueueItem[] = pendingPurposes.map((p) => {
    const el = p.linkedElementId ? elementById.get(p.linkedElementId) : null;
    return {
      id: p.id, kind: "purpose", name: p.name, description: p.description,
      requester: p.proposedBy ?? "Admin", submittedAt: (p.proposedAt ?? p.approvedAt).toISOString(),
      legalBasis: p.lawfulBasis,
      linkedElement: el ? { name: el.elementName, activity: el.activity.activity } : null,
    };
  });

  const items = [...roleItems, ...purposeItems].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  const overdue = items.filter((i) => (Date.now() - new Date(i.submittedAt).getTime()) / 3_600_000 > 48).length;

  return (
    <div className="stack">
      <PageHead
        title="Approval queue"
        titleTip="Custom role requests and proposed purposes awaiting DPO/CISO approval, in one queue. Role approval is disabled until the full capability set has been reviewed; every decision is logged automatically."
      />

      <div className="stat-row">
        <Stat label="Awaiting decision" value={items.length} tone={items.length ? "yellow" : undefined} />
        <Stat label="Roles" value={roleItems.length} />
        <Stat label="Purposes" value={purposeItems.length} />
        <Stat label="Past 48h SLA" value={overdue} tone={overdue ? "red" : undefined} />
      </div>

      <ApprovalQueue items={items} actingRole={role} combined={combined} />
    </div>
  );
}
