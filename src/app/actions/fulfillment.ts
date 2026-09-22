"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { createFulfillmentRequest, confirmScope, executeFulfillment, verifyManualSystem, retrySystem, escalateSystem, compileCompletion, type FulfillmentIntake } from "@/lib/engines/fulfillment";
import type { ActionResult } from "@/app/actions/requests";

function ok(): ActionResult { return { ok: true }; }
function fail(e: unknown): ActionResult { const err = e as Error; return { ok: false, error: err.message, errorKind: err.name }; }
function touch(id?: string) { revalidatePath("/fulfillment", "layout"); if (id) revalidatePath(`/fulfillment/${id}`, "layout"); revalidatePath("/audit-trail/deletions", "layout"); }

export async function createFulfillmentRequestAction(input: FulfillmentIntake): Promise<ActionResult> {
  try { await createFulfillmentRequest({ ...input, source: "manual" }); touch(); return ok(); } catch (e) { return fail(e); }
}

export async function confirmScopeAction(requestId: string, manualAdds: { name: string; note: string }[]): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await confirmScope(requestId, manualAdds, actor); touch(requestId); return ok(); } catch (e) { return fail(e); }
}

export async function executeFulfillmentAction(requestId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await executeFulfillment(requestId, actor); touch(requestId); return ok(); } catch (e) { return fail(e); }
}

export async function verifyManualSystemAction(systemId: string, note: string, requestId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await verifyManualSystem(systemId, note, actor); touch(requestId); return ok(); } catch (e) { return fail(e); }
}

export async function retrySystemAction(systemId: string, requestId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await retrySystem(systemId, actor); touch(requestId); return ok(); } catch (e) { return fail(e); }
}

export async function escalateSystemAction(systemId: string, requestId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await escalateSystem(systemId, actor); touch(requestId); return ok(); } catch (e) { return fail(e); }
}

export async function compileCompletionAction(requestId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await compileCompletion(requestId, actor); touch(requestId); return ok(); } catch (e) { return fail(e); }
}
