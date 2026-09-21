"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { audited } from "@/lib/engines/audit";
import { deprovisionUser } from "@/lib/engines/access";
import type { TxClient } from "@/lib/tx";
import type { ActionResult } from "@/app/actions/requests";

/**
 * Account-level deactivation from Settings → Users. This is NOT a role edit: it
 * flips the account status AND calls the SAME cross-system revocation flow used by
 * Identity & Access offboarding (deprovisionUser) — it never shortcuts that
 * checklist and never touches role assignments directly here.
 */
export async function deactivateAccountAction(userId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try {
    await audited(
      { actor, action: "account.deactivated", targetType: "InternalUser", targetId: userId, payload: {} },
      (tx: TxClient) => tx.internalUser.update({ where: { id: userId }, data: { accountStatus: "deactivated" } }),
    );
    // Reuse the existing offboarding revocation engine — do not duplicate it.
    await deprovisionUser(userId, actor);
    revalidatePath("/settings/users", "layout");
    revalidatePath("/access/deprovisioning", "layout");
    return { ok: true };
  } catch (error) {
    const e = error as Error;
    return { ok: false, error: e.message, errorKind: e.name };
  }
}

/** Reactivate the account. Account-level only — does NOT restore any revoked
 *  access; roles are re-granted in Identity & Access if needed. */
export async function reactivateAccountAction(userId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try {
    await audited(
      { actor, action: "account.reactivated", targetType: "InternalUser", targetId: userId, payload: {} },
      (tx: TxClient) => tx.internalUser.update({ where: { id: userId }, data: { accountStatus: "active" } }),
    );
    revalidatePath("/settings/users", "layout");
    return { ok: true };
  } catch (error) {
    const e = error as Error;
    return { ok: false, error: e.message, errorKind: e.name };
  }
}
