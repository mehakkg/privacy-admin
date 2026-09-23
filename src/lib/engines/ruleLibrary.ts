import { governanceDb } from "@/lib/db";
import { recordAction, type AuditActor } from "@/lib/engines/audit";
import { isCombinedGovernance } from "@/lib/governance";

/**
 * PROTECTION RULE LIBRARY — a template layer in front of rule creation, mirroring
 * the Role Library (system/custom) and Cookie Category (standard/custom) propose→
 * approve pattern. A template only pre-fills the definition; the CISO still
 * reviews and approves, and every tier converges on the same downstream flow.
 * ProtectionRule is governance-locked, so writes go through governanceDb.
 */

function err(name: string, message: string) { return Object.assign(new Error(message), { name }); }

// Template method vocabulary → the rule's ruleType facet.
const METHOD_TO_RULETYPE: Record<string, string> = { masking: "mask", encryption: "encrypt", tokenization: "dlp" };

export interface ProposeRuleInput {
  ruleName: string;
  dataCategory: string;
  method: string; // masking | encryption | tokenization
  strictness: string;
  scope: string;
  definition: string;
  statutoryCitation?: string | null;
  sourceTemplateId?: string | null;
  tier: string; // baseline_pii | dpdp_specific | custom
}

export async function proposeProtectionRule(input: ProposeRuleInput, actor: AuditActor) {
  if (!input.ruleName.trim()) throw err("ValidationError", "Name the rule.");
  if (!input.dataCategory.trim()) throw err("ValidationError", "Choose the PII category the rule protects.");
  if (!input.definition.trim()) throw err("ValidationError", "Describe what the rule does.");
  const ruleType = METHOD_TO_RULETYPE[input.method] ?? input.method;
  const now = new Date();
  await governanceDb.$transaction(async (tx) => {
    await recordAction(tx as never, { actor, action: "protection.rule_proposed", targetType: "ProtectionRule", targetId: input.ruleName.trim(), eventDescription: `Proposed protection rule ${input.ruleName.trim()} (${input.tier}) — awaiting CISO approval`, payload: { tier: input.tier, method: input.method, sourceTemplateId: input.sourceTemplateId ?? null } });
    await tx.protectionRule.create({
      data: {
        ruleName: input.ruleName.trim(),
        dataCategory: input.dataCategory.trim(),
        ruleType,
        strictness: input.strictness,
        scope: "",
        definition: input.definition.trim(),
        // approvedBy/At are placeholders until the CISO actually approves.
        approvedBy: "",
        approvedAt: now,
        status: "pending_ciso_approval",
        proposedBy: actor.label,
        proposedAt: now,
        sourceTemplateId: input.sourceTemplateId ?? null,
        tier: input.tier,
        statutoryCitation: input.statutoryCitation?.trim() || null,
      },
    });
  });
}

export async function decideProtectionRule(id: string, approve: boolean, reason: string, actor: AuditActor) {
  const combined = await isCombinedGovernance();
  if (!(actor.role === "ciso" || (combined && actor.role === "admin"))) {
    throw err("UnauthorisedRulingError", "Only the CISO can approve a protection rule. Switch role to decide.");
  }
  await governanceDb.$transaction(async (tx) => {
    await recordAction(tx as never, { actor, action: approve ? "protection.rule_approved" : "protection.rule_rejected", targetType: "ProtectionRule", targetId: id, eventDescription: `${approve ? "Approved" : "Rejected"} a proposed protection rule`, payload: { selfApproved: combined && actor.role === "admin" } });
    if (approve) await tx.protectionRule.update({ where: { id }, data: { status: "approved", approvedBy: actor.label, approvedAt: new Date() } });
    else await tx.protectionRule.update({ where: { id }, data: { status: "rejected", rejectionReason: reason.trim() || "No reason given." } });
  });
}
