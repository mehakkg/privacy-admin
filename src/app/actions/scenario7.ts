"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { investigateException, proposeScopeAdjustment, decideScopeAdjustment, acceptCounterProposal, connectRiskSource, createAcquiredEntity, bulkMapUsersToEntity } from "@/lib/engines/scenario7";
import type { ActionResult } from "@/app/actions/requests";

function fail(e: unknown): ActionResult { const err = e as Error; return { ok: false, error: err.message, errorKind: err.name }; }
function touch(...p: string[]) { for (const x of p) revalidatePath(x, "layout"); }
const RULE = "/risk/scope-adjustments";

export async function investigateExceptionAction(exceptionId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await investigateException(exceptionId, actor); touch(RULE); return { ok: true }; } catch (e) { return fail(e); }
}
export async function proposeScopeAdjustmentAction(exceptionId: string, proposedScope: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await proposeScopeAdjustment(exceptionId, proposedScope, actor); touch(RULE); return { ok: true }; } catch (e) { return fail(e); }
}
export async function decideScopeAdjustmentAction(proposalId: string, decision: "approve" | "deny" | "counter", counterScope: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await decideScopeAdjustment(proposalId, decision, counterScope, actor); touch(RULE); return { ok: true }; } catch (e) { return fail(e); }
}
export async function acceptCounterProposalAction(proposalId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await acceptCounterProposal(proposalId, actor); touch(RULE); return { ok: true }; } catch (e) { return fail(e); }
}
export async function connectRiskSourceAction(sourceId: string, metrics: string[]): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await connectRiskSource(sourceId, metrics, actor); touch("/analytics/risk-sources"); return { ok: true }; } catch (e) { return fail(e); }
}
export async function createAcquiredEntityAction(name: string, rawUsers: string): Promise<ActionResult & { failed?: string[]; imported?: number }> {
  const { actor } = await getSession();
  try { const r = await createAcquiredEntity(name, rawUsers, actor); touch("/settings/entity-setup", "/access/entity-mapping"); return { ok: true, failed: r.failed, imported: r.imported }; } catch (e) { return fail(e); }
}
export async function bulkMapUsersToEntityAction(entityId: string, userNames: string[]): Promise<ActionResult & { mapped?: number; flagged?: { userName: string; conflictEntity: string }[] }> {
  const { actor } = await getSession();
  try { const r = await bulkMapUsersToEntity(entityId, userNames, actor); touch("/access/entity-mapping"); return { ok: true, mapped: r.mapped, flagged: r.flagged }; } catch (e) { return fail(e); }
}
