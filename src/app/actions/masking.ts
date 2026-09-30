"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import {
  createField, editTenantRule, proposeChange, proposeException,
  decideChange, withdrawProposal, counterPropose, checkCodeCollision,
  unlockSelfLocked, createAndApplyGroup, reapplyGroup, detachField, validateGroupMembers,
  planRuleForFields, submitRulePlan, setTemplateAssociation, templateFields,
  revertToTemplate, resyncFieldToGroup, createBareField, type BareFieldInput,
  type CreateFieldInput, type RulePatch, type Collision, type CreateGroupInput, type GroupMemberValidation,
  type PlanRow, type SubmitPlanResult, type TemplateFieldRow,
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
  revalidatePath("/data-flow/protection-rules", "layout");
  revalidatePath("/masking", "layout");
  revalidatePath("/audit", "layout");
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

export async function counterProposeAction(id: string, family: string, params: Record<string, unknown>, note: string): Promise<MaskingActionResult> {
  const { actor } = await getSession();
  try { await counterPropose(id, family, params, note, actor); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

export async function checkCollisionAction(code: string): Promise<{ collision: Collision | null }> {
  return { collision: await checkCodeCollision(code) };
}

export async function createBareFieldAction(input: BareFieldInput): Promise<MaskingActionResult> {
  const { actor } = await getSession();
  try { await createBareField(input, actor); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

export async function unlockSelfLockedAction(code: string): Promise<MaskingActionResult> {
  const { actor } = await getSession();
  try { await unlockSelfLocked(code, actor); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

export async function setTemplateAssociationAction(key: string, associated: boolean): Promise<MaskingActionResult> {
  const { actor } = await getSession();
  try { await setTemplateAssociation(key, associated, actor); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

export async function templateFieldsAction(key: string): Promise<{ fields: TemplateFieldRow[] }> {
  return { fields: await templateFields(key) };
}

export async function createGroupAction(input: CreateGroupInput): Promise<MaskingActionResult> {
  const { actor } = await getSession();
  try { await createAndApplyGroup(input, actor); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

export async function reapplyGroupAction(id: string): Promise<MaskingActionResult> {
  const { actor } = await getSession();
  try { await reapplyGroup(id, actor); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

export async function detachFieldAction(id: string, code: string): Promise<MaskingActionResult> {
  const { actor } = await getSession();
  try { await detachField(id, code, actor); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

export async function revertToTemplateAction(code: string): Promise<MaskingActionResult> {
  const { actor } = await getSession();
  try { await revertToTemplate(code, actor); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

export async function resyncFieldToGroupAction(groupId: string, code: string): Promise<MaskingActionResult> {
  const { actor } = await getSession();
  try { await resyncFieldToGroup(groupId, code, actor); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

/** Live pre-validation for the group create form. */
export async function validateGroupAction(family: string, params: Record<string, unknown>, codes: string[]): Promise<{ members: GroupMemberValidation[] }> {
  return { members: await validateGroupMembers(family, params, codes) };
}

/** Live per-field outcome plan for the Create-rule stepper (Step 4). */
export async function planRuleAction(family: string, params: Record<string, unknown>, codes: string[]): Promise<{ plan: PlanRow[] }> {
  return { plan: await planRuleForFields(family, params, codes) };
}

export interface CreateRuleResult extends MaskingActionResult { result?: SubmitPlanResult }
export async function submitRuleAction(family: string, params: Record<string, unknown>, codes: string[], reason: string): Promise<CreateRuleResult> {
  const { actor } = await getSession();
  try { const result = await submitRulePlan(family, params, codes, reason, actor); touch(); return { ok: true, result }; } catch (e) { return fail(e); }
}
