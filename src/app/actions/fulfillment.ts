"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { confirmScope, executeFulfillment, verifyManualSystem, retrySystem, escalateSystem, compileCompletion } from "@/lib/engines/fulfillment";
import type { ActionResult } from "@/app/actions/requests";

function ok(): ActionResult { return { ok: true }; }
function fail(e: unknown): ActionResult { const err = e as Error; return { ok: false, error: err.message, errorKind: err.name }; }
function touch(id: string) { revalidatePath("/fulfillment", "layout"); revalidatePath(`/fulfillment/${id}`, "layout"); revalidatePath("/audit-trail/deletions", "layout"); }

export async function confirmScopeAction(instructionId: string, manualAdds: { name: string; note: string }[]): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await confirmScope(instructionId, manualAdds, actor); touch(instructionId); return ok(); } catch (e) { return fail(e); }
}

export async function executeFulfillmentAction(instructionId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await executeFulfillment(instructionId, actor); touch(instructionId); return ok(); } catch (e) { return fail(e); }
}

export async function verifyManualSystemAction(statusId: string, note: string, instructionId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await verifyManualSystem(statusId, note, actor); touch(instructionId); return ok(); } catch (e) { return fail(e); }
}

export async function retrySystemAction(statusId: string, instructionId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await retrySystem(statusId, actor); touch(instructionId); return ok(); } catch (e) { return fail(e); }
}

export async function escalateSystemAction(statusId: string, instructionId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await escalateSystem(statusId, actor); touch(instructionId); return ok(); } catch (e) { return fail(e); }
}

export async function compileCompletionAction(instructionId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await compileCompletion(instructionId, actor); touch(instructionId); return ok(); } catch (e) { return fail(e); }
}
