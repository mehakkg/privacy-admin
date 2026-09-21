"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { autoAssignAll, reassign, addSubtask, setSubtaskStatus, requestExtension, runDprrTick } from "@/lib/engines/dprr";
import type { ActionResult } from "@/app/actions/requests";

const QUEUE = "/requests/sla";
function paths(requestId?: string) {
  return [QUEUE, "/requests", ...(requestId ? [`/requests/sla/${requestId}`] : [])];
}
function run(op: () => Promise<unknown>, requestId?: string): Promise<ActionResult> {
  return (async () => {
    try {
      await op();
      for (const p of paths(requestId)) revalidatePath(p, "layout");
      return { ok: true };
    } catch (error) {
      const e = error as Error;
      return { ok: false, error: e.message, errorKind: e.name };
    }
  })();
}

/** Run the auto-assignment router across every open request. */
export async function autoAssignAction(): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() => autoAssignAll(actor));
}

export async function reassignAction(requestId: string, actorId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!actorId) return { ok: false, error: "Pick an assignee.", errorKind: "ValidationError" };
  return run(() => reassign(requestId, actorId, actor), requestId);
}

export async function addSubtaskAction(
  requestId: string,
  input: { title: string; team: string; assignedTo: string; dueDate: string },
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() => addSubtask(requestId, input, actor), requestId);
}

export async function setSubtaskStatusAction(subtaskId: string, status: string, requestId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() => setSubtaskStatus(subtaskId, status, requestId, actor), requestId);
}

export async function requestExtensionAction(
  requestId: string,
  input: { newDeadline: string; justification: string },
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() => requestExtension(requestId, input, actor), requestId);
}

/** System tick — re-evaluates automatic Board escalation + SLA notifications. */
export async function runDprrTickAction(): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() => runDprrTick(actor));
}
