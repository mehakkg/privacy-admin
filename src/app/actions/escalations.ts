"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import type { TxClient } from "@/lib/tx";
import { getSession } from "@/lib/session";
import { audited } from "@/lib/engines/audit";
import type { ActionResult } from "@/app/actions/requests";

/**
 * Rule on an escalation.
 *
 * Ruling authority follows the role switcher: only an actor whose current role
 * IS the escalation's routed-to role may record a ruling. The raising role —
 * and every other role — is refused server-side, so the read-only "awaiting
 * ruling" state cannot be bypassed by anyone, however elevated.
 *
 * A role that no one is assigned to (e.g. Legal, before it is staffed) cannot be
 * acted-as through the switcher at all, so its escalations simply stay queued —
 * the vacant-role state needs no special block here, it falls out of the same
 * rule.
 */
export async function ruleEscalationAction(
  escalationId: string,
  decision: string,
  rationale: string,
): Promise<ActionResult> {
  const { actor } = await getSession();

  if (!decision.trim()) {
    return { ok: false, error: "Choose a decision.", errorKind: "ValidationError" };
  }
  if (!rationale.trim()) {
    return {
      ok: false,
      error: "Reasoning is required — a ruling has to say why, not only what.",
      errorKind: "ValidationError",
    };
  }

  const escalation = await db.escalation.findUniqueOrThrow({ where: { id: escalationId } });

  if (escalation.status !== "open") {
    return { ok: false, error: "This escalation has already been ruled.", errorKind: "StateError" };
  }
  if (actor.role !== escalation.targetRole) {
    return {
      ok: false,
      error:
        `Only the routed-to role can rule on this. It is routed to ` +
        `${escalation.targetRole.toUpperCase()}; you are acting as ${actor.role.toUpperCase()}. ` +
        `Switch to the routed-to role to record a ruling.`,
      errorKind: "UnauthorisedRulingError",
    };
  }

  try {
    await audited(
      {
        actor,
        action: "escalation.ruled",
        targetType: "Escalation",
        targetId: escalationId,
        payload: {
          reference: escalation.referenceCode ?? escalation.id,
          type: escalation.type,
          decision,
          rationale,
          ruledBy: actor.label,
        },
      },
      (tx: TxClient) =>
        tx.escalation.update({
          where: { id: escalationId },
          data: {
            status: "ruled",
            ruling: decision,
            rulingRationale: rationale,
            ruledByActorId: actor.id ?? null,
            ruledAt: new Date(),
          },
        }),
    );
    revalidatePath("/escalations", "layout");
    return { ok: true };
  } catch (error) {
    const e = error as Error;
    return { ok: false, error: e.message, errorKind: e.name };
  }
}
