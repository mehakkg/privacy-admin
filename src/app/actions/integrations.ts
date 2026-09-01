"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import {
  addDpaReference,
  escalateHealthIssue,
  requestDpaUpdate,
  retryHealthCheck,
  setSystemRoles,
} from "@/lib/engines/integrations";
import type { ActionResult } from "@/app/actions/requests";

async function run(path: string, operation: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await operation();
    revalidatePath(path, "layout");
    revalidatePath("/integrations", "layout");
    return { ok: true };
  } catch (error) {
    const e = error as Error;
    return { ok: false, error: e.message, errorKind: e.name };
  }
}

export async function setSystemRolesAction(
  sourceId: string,
  scanTarget: boolean,
  executionTarget: boolean,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/integrations/connected-systems", () =>
    setSystemRoles(sourceId, scanTarget, executionTarget, actor),
  );
}

export async function addDpaReferenceAction(
  processorId: string,
  dpaId: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/integrations/data-processors", () => addDpaReference(processorId, dpaId, actor));
}

export async function requestDpaUpdateAction(
  processorId: string,
  reason: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/integrations/data-processors", () => requestDpaUpdate(processorId, reason, actor));
}

export async function retryHealthCheckAction(
  targetKind: "system" | "processor",
  id: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/integrations/health-monitoring", () => retryHealthCheck(targetKind, id, actor));
}

export async function escalateHealthAction(
  targetKind: "system" | "processor",
  id: string,
  reason: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/integrations/health-monitoring", () => escalateHealthIssue(targetKind, id, reason, actor));
}
