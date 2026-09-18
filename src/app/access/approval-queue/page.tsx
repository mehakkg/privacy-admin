import { db } from "@/lib/db";
import { PageHead, Stat } from "@/components/ui";
import { ApprovalQueue, type QueueItem } from "@/components/access/approvalQueue";
import { getCurrentRole } from "@/lib/session";
import { decodeList } from "@/lib/codec/json";

export const dynamic = "force-dynamic";

/** SCREEN 3 — Approval Queue. Pending custom roles awaiting a DPO/CISO decision. */
export default async function ApprovalQueuePage() {
  const role = await getCurrentRole();
  const pending = await db.rBACRole.findMany({
    where: { status: "pending_dpo_approval" },
    orderBy: { baselineApprovedAt: "asc" },
  });

  const items: QueueItem[] = pending.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    requester: r.createdBy ?? "Admin",
    capabilityIds: decodeList(r.capabilitiesJson),
    submittedAt: r.baselineApprovedAt.toISOString(),
  }));

  const overdue = items.filter((i) => (Date.now() - new Date(i.submittedAt).getTime()) / 3_600_000 > 48).length;

  return (
    <div className="stack">
      <PageHead
        title="Approval queue"
        titleTip="Custom role requests awaiting DPO/CISO approval. Approval is disabled until the full capability set has been reviewed, and every decision is logged automatically."
      />

      <div className="stat-row">
        <Stat label="Awaiting decision" value={items.length} tone={items.length ? "yellow" : undefined} />
        <Stat label="Past 48h SLA" value={overdue} tone={overdue ? "red" : undefined} />
      </div>

      <ApprovalQueue items={items} actingRole={role} />
    </div>
  );
}
