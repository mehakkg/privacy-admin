"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import {
  deprovisionAccount,
  deprovisionUser,
  grantAccess,
  recordDisposition,
  retryRevocation,
  terminateSession,
} from "@/lib/engines/access";
import {
  correctDrift,
  requestBaselineChange,
  updateRolePermissions,
} from "@/lib/guards/baselineGate";
import type { Disposition } from "@/lib/domain";
import type { ActionResult } from "@/app/actions/requests";

/**
 * Scenario 2 server actions. Same shape as the Scenario 1 adapters: resolve the
 * acting identity, call the engine, let the guards decide, and return refusals
 * as data so they render where the user is already looking.
 */

async function run(
  path: string,
  operation: () => Promise<unknown>,
): Promise<ActionResult> {
  try {
    await operation();
    revalidatePath(path, "layout");
    revalidatePath("/access", "layout");
    return { ok: true };
  } catch (error) {
    const e = error as Error;
    return { ok: false, error: e.message, errorKind: e.name };
  }
}

export async function grantAccessAction(
  accountId: string,
  roleId: string,
  scopeCategories: string[],
  expiresInDays: number | null,
): Promise<ActionResult> {
  const { actor } = await getSession();
  const expiresAt =
    expiresInDays === null
      ? null
      : new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  return run("/access/provisioning", () =>
    grantAccess(accountId, roleId, scopeCategories, expiresAt, actor),
  );
}

export async function deprovisionUserAction(userId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(`/access/users/${userId}`, () => deprovisionUser(userId, actor));
}

export async function deprovisionAccountAction(
  accountId: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/access/dormant", () => deprovisionAccount(accountId, actor));
}

export async function retryRevocationAction(recordId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/access/verification", () => retryRevocation(recordId, actor));
}

export async function terminateSessionAction(
  sessionId: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/access/verification", () => terminateSession(sessionId, actor));
}

export async function recordDispositionAction(
  accountId: string,
  disposition: Disposition,
  justification: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/access/dormant", () =>
    recordDisposition(accountId, disposition, justification, actor),
  );
}

export async function updateRoleAction(
  roleId: string,
  permissions: string[],
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/access/roles", () => updateRolePermissions(roleId, permissions, actor));
}

export async function correctDriftAction(roleId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/access/roles", () => correctDrift(roleId, actor));
}

export async function requestBaselineChangeAction(
  roleId: string,
  requested: string[],
  reason: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!reason.trim()) {
    return {
      ok: false,
      error: "Explain why the role needs to be wider. The CISO rules on this.",
      errorKind: "ValidationError",
    };
  }
  return run("/access/roles", () =>
    requestBaselineChange(roleId, requested, reason, actor),
  );
}
