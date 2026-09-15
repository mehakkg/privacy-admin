"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { audited } from "@/lib/engines/audit";
import type { TxClient } from "@/lib/tx";
import type { ActionResult } from "@/app/actions/requests";

const CONFIG = "/vendor-risk/configuration";
const OWNERS = new Set(["dpo", "legal"]);

async function guard(): Promise<{ actor: Awaited<ReturnType<typeof getSession>>["actor"] } | { error: ActionResult }> {
  const { actor, role } = await getSession();
  if (!OWNERS.has(role)) return { error: { ok: false, error: "TPRM configuration is set by the DPO/Legal.", errorKind: "ForbiddenError" } };
  return { actor };
}
function done(): ActionResult { revalidatePath(CONFIG, "layout"); return { ok: true }; }
function caught(e: unknown): ActionResult { const err = e as Error; return { ok: false, error: err.message, errorKind: err.name }; }

// --- Risk appetite rules ---------------------------------------------------

export async function createRuleAction(categoryPattern: string, baselineRating: string): Promise<ActionResult> {
  const g = await guard(); if ("error" in g) return g.error;
  if (!categoryPattern.trim()) return { ok: false, error: "A category pattern is required.", errorKind: "ValidationError" };
  try {
    await audited({ actor: g.actor, action: "tprm.rule_created", targetType: "RiskAppetiteRule", targetId: categoryPattern.trim(), payload: { baselineRating } },
      async (tx: TxClient) => {
        const max = await tx.riskAppetiteRule.aggregate({ _max: { sortOrder: true } });
        return tx.riskAppetiteRule.create({ data: { categoryPattern: categoryPattern.trim(), baselineRating, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
      });
    return done();
  } catch (e) { return caught(e); }
}

export async function updateRuleAction(id: string, categoryPattern: string, baselineRating: string): Promise<ActionResult> {
  const g = await guard(); if ("error" in g) return g.error;
  try {
    await audited({ actor: g.actor, action: "tprm.rule_updated", targetType: "RiskAppetiteRule", targetId: id, payload: { categoryPattern, baselineRating } },
      (tx: TxClient) => tx.riskAppetiteRule.update({ where: { id }, data: { categoryPattern: categoryPattern.trim(), baselineRating } }));
    return done();
  } catch (e) { return caught(e); }
}

export async function deleteRuleAction(id: string): Promise<ActionResult> {
  const g = await guard(); if ("error" in g) return g.error;
  try {
    await audited({ actor: g.actor, action: "tprm.rule_deleted", targetType: "RiskAppetiteRule", targetId: id, payload: {} },
      (tx: TxClient) => tx.riskAppetiteRule.delete({ where: { id } }));
    return done();
  } catch (e) { return caught(e); }
}

/** Swap a rule with its neighbour — first-match-wins order is meaningful. */
export async function moveRuleAction(id: string, dir: "up" | "down"): Promise<ActionResult> {
  const g = await guard(); if ("error" in g) return g.error;
  try {
    await audited({ actor: g.actor, action: "tprm.rule_reordered", targetType: "RiskAppetiteRule", targetId: id, payload: { dir } },
      async (tx: TxClient) => {
        const rules = await tx.riskAppetiteRule.findMany({ orderBy: { sortOrder: "asc" } });
        const i = rules.findIndex((r) => r.id === id);
        const j = dir === "up" ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= rules.length) return;
        await tx.riskAppetiteRule.update({ where: { id: rules[i].id }, data: { sortOrder: rules[j].sortOrder } });
        await tx.riskAppetiteRule.update({ where: { id: rules[j].id }, data: { sortOrder: rules[i].sortOrder } });
      });
    return done();
  } catch (e) { return caught(e); }
}

// --- Questionnaire templates -----------------------------------------------

export async function createTemplateAction(name: string, forTiers: string[], description: string): Promise<ActionResult> {
  const g = await guard(); if ("error" in g) return g.error;
  if (!name.trim()) return { ok: false, error: "Name the template.", errorKind: "ValidationError" };
  try {
    await audited({ actor: g.actor, action: "tprm.template_created", targetType: "QuestionnaireTemplate", targetId: name.trim(), payload: { forTiers } },
      (tx: TxClient) => tx.questionnaireTemplate.create({ data: { name: name.trim(), forTiers: forTiers.join(","), description: description.trim() } }));
    return done();
  } catch (e) { return caught(e); }
}

export async function toggleTemplateActiveAction(id: string, active: boolean): Promise<ActionResult> {
  const g = await guard(); if ("error" in g) return g.error;
  try {
    await audited({ actor: g.actor, action: "tprm.template_toggled", targetType: "QuestionnaireTemplate", targetId: id, payload: { active } },
      (tx: TxClient) => tx.questionnaireTemplate.update({ where: { id }, data: { active } }));
    return done();
  } catch (e) { return caught(e); }
}

export async function deleteTemplateAction(id: string): Promise<ActionResult> {
  const g = await guard(); if ("error" in g) return g.error;
  try {
    await audited({ actor: g.actor, action: "tprm.template_deleted", targetType: "QuestionnaireTemplate", targetId: id, payload: {} },
      async (tx: TxClient) => { await tx.templateQuestion.deleteMany({ where: { templateId: id } }); return tx.questionnaireTemplate.delete({ where: { id } }); });
    return done();
  } catch (e) { return caught(e); }
}

export async function addQuestionAction(templateId: string, section: string, label: string): Promise<ActionResult> {
  const g = await guard(); if ("error" in g) return g.error;
  if (!label.trim()) return { ok: false, error: "Write the question.", errorKind: "ValidationError" };
  try {
    await audited({ actor: g.actor, action: "tprm.question_added", targetType: "QuestionnaireTemplate", targetId: templateId, payload: { section } },
      async (tx: TxClient) => {
        const max = await tx.templateQuestion.aggregate({ where: { templateId }, _max: { sortOrder: true } });
        return tx.templateQuestion.create({ data: { templateId, section: section.trim() || "General", label: label.trim(), sortOrder: (max._max.sortOrder ?? 0) + 1 } });
      });
    return done();
  } catch (e) { return caught(e); }
}

export async function removeQuestionAction(questionId: string): Promise<ActionResult> {
  const g = await guard(); if ("error" in g) return g.error;
  try {
    await audited({ actor: g.actor, action: "tprm.question_removed", targetType: "TemplateQuestion", targetId: questionId, payload: {} },
      (tx: TxClient) => tx.templateQuestion.delete({ where: { id: questionId } }));
    return done();
  } catch (e) { return caught(e); }
}
