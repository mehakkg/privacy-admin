"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { proposeProtectionRule, decideProtectionRule, type ProposeRuleInput } from "@/lib/engines/ruleLibrary";
import type { ActionResult } from "@/app/actions/requests";

function fail(e: unknown): ActionResult { const err = e as Error; return { ok: false, error: err.message, errorKind: err.name }; }
function touch() { revalidatePath("/data-flow/protection-rules/library", "layout"); revalidatePath("/data-flow/protection-rules", "layout"); revalidatePath("/governance", "layout"); }

export async function proposeProtectionRuleAction(input: ProposeRuleInput): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await proposeProtectionRule(input, actor); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

export async function decideProtectionRuleAction(id: string, approve: boolean, reason: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await decideProtectionRule(id, approve, reason, actor); touch(); return { ok: true }; } catch (e) { return fail(e); }
}
