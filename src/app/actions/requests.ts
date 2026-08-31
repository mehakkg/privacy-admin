"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import {
  acknowledgeException,
  confirmManualVerification,
  confirmProcessorAction,
  dispatchProcessorInstruction,
  dispatchSystemExecution,
  raiseFailureEscalation,
  recordRuling,
  requestRetentionOverride,
  resolveIdentity,
  retryExecution,
  runTick,
  sendPreErasureNotice,
  setChecklistItem,
} from "@/lib/engines/execution";
import type { EscalationRuling } from "@/lib/domain";

/**
 * Server actions.
 *
 * Every action is a thin adapter: resolve who is acting, call the engine, let
 * the engine's guards decide. No action reaches Prisma directly, and none of
 * them logs, notifies or checks retention itself — those are properties of the
 * engine operation, so they cannot be skipped by a screen that forgets.
 *
 * Errors are returned as a result object rather than thrown, so a refusal
 * renders as an explanation on the screen the user is already looking at. The
 * refusal itself happens on the server either way.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
  errorKind?: string;
}

async function run(
  path: string,
  operation: () => Promise<unknown>,
): Promise<ActionResult> {
  try {
    await operation();
    revalidatePath(path, "layout");
    return { ok: true };
  } catch (error) {
    const e = error as Error;
    return { ok: false, error: e.message, errorKind: e.name };
  }
}

export async function sendPreNoticeAction(requestId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(`/requests/${requestId}`, () => sendPreErasureNotice(requestId, actor));
}

export async function acknowledgeExceptionAction(
  requestId: string,
  exceptionId: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(`/requests/${requestId}`, () => acknowledgeException(exceptionId, actor));
}

export async function requestOverrideAction(
  requestId: string,
  exceptionId: string,
  reason: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!reason.trim()) {
    return {
      ok: false,
      error:
        "A justification is required. The DPO rules on what you write here, so " +
        "an empty escalation cannot be acted on.",
      errorKind: "ValidationError",
    };
  }
  return run(`/requests/${requestId}`, () =>
    requestRetentionOverride(exceptionId, reason, actor),
  );
}

export async function recordRulingAction(
  requestId: string,
  escalationId: string,
  ruling: EscalationRuling,
  rationale: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(`/requests/${requestId}`, () =>
    recordRuling(escalationId, ruling, rationale, actor),
  );
}

export async function executeSystemAction(
  requestId: string,
  systemId: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(`/requests/${requestId}`, () =>
    dispatchSystemExecution(requestId, systemId, actor),
  );
}

export async function retryExecutionAction(
  requestId: string,
  executionRecordId: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(`/requests/${requestId}`, () => retryExecution(executionRecordId, actor));
}

export async function escalateFailureAction(
  requestId: string,
  executionRecordId: string,
  reason: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!reason.trim()) {
    return { ok: false, error: "Describe what you need ruled on.", errorKind: "ValidationError" };
  }
  return run(`/requests/${requestId}`, () =>
    raiseFailureEscalation(requestId, executionRecordId, reason, actor),
  );
}

export async function instructProcessorAction(
  requestId: string,
  processorId: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(`/requests/${requestId}`, () =>
    dispatchProcessorInstruction(requestId, processorId, actor),
  );
}

export async function confirmProcessorActionAction(
  requestId: string,
  executionRecordId: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(`/requests/${requestId}`, () =>
    confirmProcessorAction(executionRecordId, actor),
  );
}

export async function setChecklistItemAction(
  requestId: string,
  itemId: string,
  checked: boolean,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(`/requests/${requestId}`, () => setChecklistItem(itemId, checked, actor));
}

export async function confirmManualAction(
  requestId: string,
  executionRecordId: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(`/requests/${requestId}`, () =>
    confirmManualVerification(executionRecordId, actor),
  );
}

export async function resolveIdentityAction(
  requestId: string,
  principalId: string,
  note: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!note.trim()) {
    return {
      ok: false,
      error:
        "Record how you established this is the right person. Erasing the wrong " +
        "Data Principal cannot be undone.",
      errorKind: "ValidationError",
    };
  }
  return run(`/requests/${requestId}`, () =>
    resolveIdentity(requestId, principalId, note, actor),
  );
}

export async function runTickAction(): Promise<ActionResult> {
  return run("/requests", () => runTick());
}
