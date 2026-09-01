"use server";

import { revalidatePath } from "next/cache";
import { db, governanceDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import { recordAction } from "@/lib/engines/audit";
import { emit } from "@/lib/engines/notification";
import { encodeObject } from "@/lib/codec/json";
import type { ActionResult } from "@/app/actions/requests";

/**
 * Purpose taxonomy.
 *
 * The DPO owns this object. These actions give the DPO a real edit path while
 * keeping Admin's absence of one intact: every mutating action asserts the
 * acting role is DPO before touching `governanceDb`, so an Admin call is
 * refused at the action boundary — and even if that check were somehow bypassed,
 * the ordinary `db` client Admin's code uses still refuses governance writes.
 *
 * Admin's only route to a new purpose is `requestPurposeAction`, which raises an
 * Escalation to the DPO. Admin never creates a governance object directly.
 */

class NotGovernanceOwnerError extends Error {
  constructor() {
    super(
      "Only the Data Protection Officer can edit the purpose taxonomy. Switch " +
        "to Acting as: DPO, or use Request new purpose to raise it.",
    );
    this.name = "NotGovernanceOwnerError";
  }
}

export async function createPurposeAction(
  name: string,
  description: string,
  status: string,
): Promise<ActionResult> {
  const { role, actor } = await getSession();
  if (role !== "dpo") {
    return { ok: false, error: new NotGovernanceOwnerError().message, errorKind: "NotGovernanceOwnerError" };
  }
  if (!name.trim()) {
    return { ok: false, error: "A purpose name is required.", errorKind: "ValidationError" };
  }

  try {
    await governanceDb.$transaction(async (tx) => {
      await recordAction(tx as never, {
        actor,
        action: "governance.purpose_created",
        targetType: "PurposeTag",
        targetId: name.trim(),
        payload: { name: name.trim(), description, status, approvedBy: actor.label },
      });
      await tx.purposeTag.create({
        data: {
          name: name.trim(),
          description: description.trim(),
          status: status || "approved",
          approvedBy: actor.label,
          approvedAt: new Date(),
        },
      });
    });
    revalidatePath("/governance", "layout");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message, errorKind: (error as Error).name };
  }
}

export async function setPurposeStatusAction(
  id: string,
  status: string,
): Promise<ActionResult> {
  const { role, actor } = await getSession();
  if (role !== "dpo") {
    return { ok: false, error: new NotGovernanceOwnerError().message, errorKind: "NotGovernanceOwnerError" };
  }

  try {
    await governanceDb.$transaction(async (tx) => {
      const before = await tx.purposeTag.findUniqueOrThrow({ where: { id } });
      await recordAction(tx as never, {
        actor,
        action: "governance.purpose_status_changed",
        targetType: "PurposeTag",
        targetId: id,
        payload: { name: before.name, from: before.status, to: status },
      });
      await tx.purposeTag.update({ where: { id }, data: { status } });
    });
    revalidatePath("/governance", "layout");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message, errorKind: (error as Error).name };
  }
}

/**
 * Admin's path: request a new purpose. Raises an Escalation to the DPO rather
 * than creating anything — the whole point of the governance boundary.
 */
export async function requestPurposeAction(
  name: string,
  reason: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!name.trim()) {
    return { ok: false, error: "Name the purpose you need.", errorKind: "ValidationError" };
  }

  const context = {
    requestedPurpose: name.trim(),
    requestedBy: actor.label,
    reason: reason.trim(),
  };

  try {
    await db.$transaction(async (tx) => {
      await recordAction(tx as never, {
        actor,
        action: "governance.purpose_requested",
        targetType: "PurposeTag",
        targetId: name.trim(),
        payload: context,
      });
      await tx.escalation.create({
        data: {
          sourceRole: actor.role,
          targetRole: "dpo",
          reason: reason.trim() || `Requesting a new purpose: ${name.trim()}`,
          contextJson: encodeObject(context),
          status: "open",
        },
      });
    });

    await emit(db, {
      kind: "escalation.raised",
      requestId: null,
      requestRef: `New purpose — ${name.trim()}`,
      reason: reason.trim() || "New purpose requested",
      targetRole: "dpo",
    });

    revalidatePath("/governance", "layout");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message, errorKind: (error as Error).name };
  }
}
