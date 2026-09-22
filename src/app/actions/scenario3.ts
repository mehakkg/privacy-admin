"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import {
  createEvidenceRequest, decideEntry, markSearching, markDelivered,
  createDeletionInstruction, executeDeletion, escalateConflict, recordRuling, executeRuling,
  type EvidenceIntake, type DeletionIntake,
} from "@/lib/engines/scenario3";
import type { ActionResult } from "@/app/actions/requests";

function ok(): ActionResult { return { ok: true }; }
function fail(e: unknown): ActionResult { const err = e as Error; return { ok: false, error: err.message, errorKind: err.name }; }
function touch(...paths: string[]) { for (const p of paths) revalidatePath(p, "layout"); }

export async function createEvidenceRequestAction(input: EvidenceIntake): Promise<ActionResult> {
  try { await createEvidenceRequest({ ...input, source: "manual" }); touch("/audit-trail/evidence"); return ok(); } catch (e) { return fail(e); }
}

export async function markSearchingAction(requestId: string): Promise<ActionResult> {
  try { await markSearching(requestId); touch(`/audit-trail/evidence/${requestId}`); return ok(); } catch (e) { return fail(e); }
}

export async function decideEntryAction(requestId: string, logEntryId: string, confirmed: boolean, isSuggested: boolean): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await decideEntry({ requestId, logEntryId, confirmed, isSuggested }, actor); touch(`/audit-trail/evidence/${requestId}`); return ok(); } catch (e) { return fail(e); }
}

export async function markDeliveredAction(requestId: string, format: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await markDelivered(requestId, format, actor); touch(`/audit-trail/evidence/${requestId}`, "/audit-trail/evidence"); return ok(); } catch (e) { return fail(e); }
}

export async function createDeletionInstructionAction(input: DeletionIntake): Promise<ActionResult> {
  try { await createDeletionInstruction(input); touch("/audit-trail/deletions"); return ok(); } catch (e) { return fail(e); }
}

export async function executeDeletionAction(instructionId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await executeDeletion(instructionId, actor); touch("/audit-trail/deletions", `/audit-trail/deletions/${instructionId}`); return ok(); } catch (e) { return fail(e); }
}

export async function escalateConflictAction(instructionId: string, actionRequested: string, extraEvidence: string[]): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await escalateConflict({ instructionId, actionRequested, extraEvidence }, actor); touch("/audit-trail/deletions", `/audit-trail/deletions/${instructionId}`, "/audit-trail/rulings"); return ok(); } catch (e) { return fail(e); }
}

export async function recordRulingAction(escalationId: string, decision: string, reasoning: string, legalBasis: string, supersedesId?: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await recordRuling({ escalationId, decision, reasoning, legalBasis, supersedesId }, actor); touch("/audit-trail/rulings", `/audit-trail/rulings/${escalationId}`); return ok(); } catch (e) { return fail(e); }
}

export async function executeRulingAction(rulingId: string, escalationId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await executeRuling(rulingId, actor); touch("/audit-trail/rulings", `/audit-trail/rulings/${escalationId}`, "/audit-trail/deletions"); return ok(); } catch (e) { return fail(e); }
}
