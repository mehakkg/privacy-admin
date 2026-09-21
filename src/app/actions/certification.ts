"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { audited } from "@/lib/engines/audit";
import { deprovisionUser } from "@/lib/engines/access";
import type { TxClient } from "@/lib/tx";
import type { ActionResult } from "@/app/actions/requests";

const PATH = "/access/assessments";

/** Generate a certification campaign — snapshots all ACTIVE assignments into
 *  CertificationItems (a snapshot, not a live view). Reviewer derived from the
 *  role (its owner) as the scoping identity. */
export async function generateCampaignAction(): Promise<ActionResult> {
  const { actor } = await getSession();
  try {
    const assignments = await db.roleAssignment.findMany({ where: { status: "active" }, include: { role: true } });
    if (assignments.length === 0) return { ok: false, error: "No active assignments to certify.", errorKind: "ValidationError" };
    const now = new Date();
    const due = new Date(now.getTime() + 14 * 86_400_000);
    const q = Math.floor(now.getMonth() / 3) + 1;
    await audited(
      { actor, action: "assessment.campaign_created", targetType: "CertificationCampaign", targetId: "new", payload: { items: assignments.length } },
      async (tx: TxClient) => {
        const campaign = await tx.certificationCampaign.create({
          data: { name: `Q${q} ${now.getFullYear()} access certification`, scheduledFor: now, dueDate: due, status: "in_progress" },
        });
        for (const a of assignments) {
          await tx.certificationItem.create({
            data: {
              campaignId: campaign.id, assignmentId: a.id,
              reviewerId: a.role.name, // owner of the role reviews it
              originalGrantContextJson: JSON.stringify({
                user: a.userName, role: a.role.name,
                approvedBy: a.role.baselineApprovedBy, grantedAt: a.grantedAt.toISOString(), justification: a.justification,
              }),
            },
          });
        }
        return campaign;
      },
    );
    revalidatePath(PATH, "layout");
    return { ok: true };
  } catch (error) { const e = error as Error; return { ok: false, error: e.message, errorKind: e.name }; }
}

/** Certify or revoke one item. Certify is one-click; Revoke requires a
 *  justification and routes through the existing cross-system revocation flow. */
export async function decideCertificationItemAction(itemId: string, decision: "certified" | "revoked", justification: string): Promise<ActionResult> {
  if (decision === "revoked" && !justification.trim()) return { ok: false, error: "A justification is required to revoke.", errorKind: "ValidationError" };
  return decideItems([{ itemId, decision, justification }]);
}

export async function bulkCertifyAction(items: { itemId: string; decision: "certified" | "revoked"; justification: string }[]): Promise<ActionResult> {
  if (items.some((i) => i.decision === "revoked" && !i.justification.trim())) return { ok: false, error: "A justification is required for every revoke.", errorKind: "ValidationError" };
  return decideItems(items);
}

async function decideItems(items: { itemId: string; decision: "certified" | "revoked"; justification: string }[]): Promise<ActionResult> {
  const { actor } = await getSession();
  try {
    for (const it of items) {
      await audited(
        { actor, action: it.decision === "revoked" ? "assessment.revoked" : "assessment.certified", targetType: "CertificationItem", targetId: it.itemId, payload: {} },
        async (tx: TxClient) => {
          const item = await tx.certificationItem.update({
            where: { id: it.itemId },
            data: { decision: it.decision, justification: it.justification.trim() || null, decidedAt: new Date() },
            include: { assignment: true },
          });
          if (it.decision === "revoked") {
            await tx.roleAssignment.update({ where: { id: item.assignmentId }, data: { status: "revoked" } });
          }
          return item;
        },
      );
      if (it.decision === "revoked") {
        // Route into the existing cross-system revocation where the person exists.
        const item = await db.certificationItem.findUnique({ where: { id: it.itemId }, include: { assignment: true } });
        if (item) {
          const user = await db.internalUser.findFirst({ where: { fullName: item.assignment.userName } });
          if (user) await deprovisionUser(user.id, actor);
        }
      }
    }
    revalidatePath(PATH, "layout");
    return { ok: true };
  } catch (error) { const e = error as Error; return { ok: false, error: e.message, errorKind: e.name }; }
}

/** Mark a campaign complete — refused while ANY item is still unreviewed, no
 *  matter how close to 100%. */
export async function markCampaignCompleteAction(campaignId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try {
    const remaining = await db.certificationItem.count({ where: { campaignId, decision: null } });
    if (remaining > 0) return { ok: false, error: `${remaining} item${remaining === 1 ? "" : "s"} still need a decision — a campaign can't be completed with any item unreviewed.`, errorKind: "StateError" };
    await audited(
      { actor, action: "assessment.campaign_completed", targetType: "CertificationCampaign", targetId: campaignId, payload: {} },
      (tx: TxClient) => tx.certificationCampaign.update({ where: { id: campaignId }, data: { status: "complete" } }),
    );
    revalidatePath(PATH, "layout");
    return { ok: true };
  } catch (error) { const e = error as Error; return { ok: false, error: e.message, errorKind: e.name }; }
}
