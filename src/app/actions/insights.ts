"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { audited } from "@/lib/engines/audit";
import { deprovisionAccount } from "@/lib/engines/access";
import type { TxClient } from "@/lib/tx";
import type { ActionResult } from "@/app/actions/requests";

const PATH = "/access/insights";

/** Org-configurable dormancy threshold per account type (human vs service). */
export async function setDormancyThresholdAction(accountType: string, days: number): Promise<ActionResult> {
  const { actor } = await getSession();
  if (accountType !== "human" && accountType !== "service") return { ok: false, error: "Unknown account type.", errorKind: "ValidationError" };
  if (!Number.isFinite(days) || days < 1) return { ok: false, error: "Threshold must be a positive number of days.", errorKind: "ValidationError" };
  try {
    await audited(
      { actor, action: "insights.threshold_set", targetType: "DormancyThreshold", targetId: accountType, payload: { days } },
      (tx: TxClient) => tx.dormancyThreshold.upsert({ where: { accountType }, update: { thresholdDays: Math.round(days), updatedBy: actor.label }, create: { accountType, thresholdDays: Math.round(days), updatedBy: actor.label } }),
    );
    revalidatePath(PATH, "layout");
    return { ok: true };
  } catch (error) { const e = error as Error; return { ok: false, error: e.message, errorKind: e.name }; }
}

export interface InvestigationDecision {
  accountId: string;
  decision: "retained" | "revoked";
  justification: string;
  classification: string;
}

/** One investigation decision. Justification required for EITHER decision; a
 *  Revoke routes through the existing cross-system revocation flow. */
export async function decideInvestigationAction(input: InvestigationDecision): Promise<ActionResult> {
  return decideMany([input]);
}

/** Bulk-investigate: apply per-account decisions (client resolves shared default
 *  + per-row overrides into this list) in one call, each still recorded. */
export async function bulkInvestigateAction(inputs: InvestigationDecision[]): Promise<ActionResult> {
  return decideMany(inputs);
}

async function decideMany(inputs: InvestigationDecision[]): Promise<ActionResult> {
  const { actor } = await getSession();
  if (inputs.length === 0) return { ok: false, error: "Nothing selected.", errorKind: "ValidationError" };
  if (inputs.some((i) => !i.justification.trim())) return { ok: false, error: "A justification is required for every decision — Retain and Revoke alike.", errorKind: "ValidationError" };
  try {
    for (const i of inputs) {
      await audited(
        { actor, action: i.decision === "revoked" ? "investigation.revoked" : "investigation.retained", targetType: "SystemAccount", targetId: i.accountId, payload: { classification: i.classification } },
        (tx: TxClient) => tx.investigationRecord.create({
          data: { accountId: i.accountId, systemSuggestedClassification: i.classification, decision: i.decision, justification: i.justification.trim(), decidedBy: actor.label, decidedAt: new Date() },
        }),
      );
      if (i.decision === "revoked") {
        // Reuse the existing cross-system revocation — do not build a second one.
        await deprovisionAccount(i.accountId, actor);
      }
    }
    revalidatePath(PATH, "layout");
    revalidatePath("/access/deprovisioning", "layout");
    return { ok: true };
  } catch (error) { const e = error as Error; return { ok: false, error: e.message, errorKind: e.name }; }
}
