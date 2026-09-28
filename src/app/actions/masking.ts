"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import {
  createField, editTenantRule, proposeChange, proposeException,
  decideChange, withdrawProposal, checkCodeCollision,
  type CreateFieldInput, type RulePatch, type Collision,
} from "@/lib/engines/masking";

/**
 * Masking policy server actions — thin adapters over the engine. Refusals return
 * a result object (never thrown to the client). `NeedsApproval` and `FloorError`
 * carry through their kind so the drawer can route to a proposal or explain the
 * floor rather than showing a generic failure.
 */

export interface MaskingActionResult {
  ok: boolean;
  error?: string;
  errorKind?: string;
  collision?: Collision | null;
}

function fail(e: unknown): MaskingActionResult {
  const err = e as Error;
  return { ok: false, error: err.message, errorKind: err.name };
}

function touch() {
  revalidatePath("/masking", "layout");
  revalidatePath("/masking/audit", "layout");
  revalidatePath("/masking/rules", "layout");
}

export async function createFieldAction(input: CreateFieldInput): Promise<MaskingActionResult> {
  const { actor } = await getSession();
  try { await createField(input, actor); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

export async function editTenantRuleAction(code: string, patches: RulePatch[]): Promise<MaskingActionResult> {
  const { actor } = await getSession();
  try { await editTenantRule(code, patches, actor); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

export async function proposeChangeAction(code: string, before: RulePatch[], after: RulePatch[], reason: string): Promise<MaskingActionResult> {
  const { actor } = await getSession();
  try { await proposeChange(code, before, after, reason, actor); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

export async function proposeExceptionAction(code: string, role: string, purpose: string, durationMinutes: number, reason: string): Promise<MaskingActionResult> {
  const { actor } = await getSession();
  try { await proposeException(code, role, purpose, durationMinutes, reason, actor); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

export async function decideChangeAction(id: string, approve: boolean, note: string): Promise<MaskingActionResult> {
  const { actor } = await getSession();
  try { await decideChange(id, approve, note, actor); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

export async function withdrawProposalAction(id: string): Promise<MaskingActionResult> {
  const { actor } = await getSession();
  try { await withdrawProposal(id, actor); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

export async function checkCollisionAction(code: string): Promise<{ collision: Collision | null }> {
  return { collision: await checkCodeCollision(code) };
}
