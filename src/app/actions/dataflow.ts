"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { audited } from "@/lib/engines/audit";
import { emit } from "@/lib/engines/notification";
import { encodeList, encodeObject } from "@/lib/codec/json";
import type { TxClient } from "@/lib/tx";
import type { ActionResult } from "@/app/actions/requests";

async function run(path: string, operation: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await operation();
    revalidatePath(path, "layout");
    return { ok: true };
  } catch (error) {
    const e = error as Error;
    return { ok: false, error: e.message, errorKind: e.name };
  }
}

// --- Flow map --------------------------------------------------------------

export async function addConnectionAction(
  fromNodeId: string,
  toNodeId: string,
  dataCategory: string,
  purposeTagId: string | null,
): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!fromNodeId || !toNodeId) {
    return { ok: false, error: "Both a source and a destination are required.", errorKind: "ValidationError" };
  }
  return run("/data-flow/map", () =>
    audited(
      {
        actor,
        action: "dataflow.connection_added",
        targetType: "DataFlowConnection",
        targetId: `${fromNodeId}->${toNodeId}`,
        payload: { fromNodeId, toNodeId, dataCategory, purposeTagId, manual: true },
      },
      (tx: TxClient) =>
        tx.dataFlowConnection.create({
          data: {
            fromNodeId,
            toNodeId,
            dataCategoriesJson: encodeList(dataCategory ? [dataCategory] : []),
            purposeTagId,
            status: purposeTagId ? "documented" : "undisclosed",
            manual: true,
          },
        }),
    ),
  );
}

export async function linkDpiaAction(connectionId: string, dpiaRef: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/data-flow/map", () =>
    audited(
      {
        actor,
        action: "dataflow.dpia_linked",
        targetType: "DataFlowConnection",
        targetId: connectionId,
        payload: { dpiaRef },
      },
      (tx: TxClient) =>
        tx.dataFlowConnection.update({
          where: { id: connectionId },
          // Linking a DPIA resolves the undisclosed state.
          data: { dpiaRef, status: "documented" },
        }),
    ),
  );
}

export async function flagFlowForReviewAction(
  connectionId: string,
  fromLabel: string,
  toLabel: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  const context = { connectionId, flow: `${fromLabel} → ${toLabel}`, raisedBy: actor.label };
  const r = await run("/data-flow/map", () =>
    audited(
      {
        actor,
        action: "dataflow.flagged_for_review",
        targetType: "DataFlowConnection",
        targetId: connectionId,
        payload: context,
      },
      (tx: TxClient) =>
        tx.escalation.create({
          data: {
            sourceRole: actor.role,
            targetRole: "dpo",
            reason: `Undisclosed data flow: ${fromLabel} → ${toLabel}. No purpose or DPIA is linked.`,
            contextJson: encodeObject(context),
            status: "open",
          },
        }),
    ),
  );
  if (r.ok) {
    await emit(db, {
      kind: "escalation.raised",
      requestId: null,
      requestRef: `Undisclosed flow — ${fromLabel} → ${toLabel}`,
      reason: "Undisclosed data flow flagged for DPO review",
      targetRole: "dpo",
    });
  }
  return r;
}

// --- Protection rules ------------------------------------------------------

export async function saveRuleScopeAction(
  ruleId: string,
  systemIds: string[],
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run("/data-flow/protection-rules", () =>
    audited(
      {
        actor,
        action: "protection.scope_saved",
        targetType: "ProtectionRuleScope",
        targetId: ruleId,
        payload: { ruleId, systemIds },
      },
      (tx: TxClient) =>
        tx.protectionRuleScope.upsert({
          where: { ruleId },
          create: { ruleId, systemsJson: encodeList(systemIds), updatedBy: actor.label },
          update: { systemsJson: encodeList(systemIds), updatedBy: actor.label },
        }),
    ),
  );
}

/** Both request flows create an Escalation — routed to CISO here, not DPO. */
export async function requestRuleAction(
  dataCategory: string,
  reason: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!reason.trim()) {
    return { ok: false, error: "Explain why the rule is needed.", errorKind: "ValidationError" };
  }
  const context = { dataCategory, reason: reason.trim(), requestedBy: actor.label, kind: "new_rule" };
  const r = await run("/data-flow/protection-rules", () =>
    audited(
      {
        actor,
        action: "protection.rule_requested",
        targetType: "ProtectionRule",
        targetId: dataCategory,
        payload: context,
      },
      (tx: TxClient) =>
        tx.escalation.create({
          data: {
            sourceRole: actor.role,
            targetRole: "ciso",
            reason: `New protection rule requested for ${dataCategory}: ${reason.trim()}`,
            contextJson: encodeObject(context),
            status: "open",
          },
        }),
    ),
  );
  if (r.ok) {
    await emit(db, {
      kind: "escalation.raised",
      requestId: null,
      requestRef: `New protection rule — ${dataCategory}`,
      reason: reason.trim(),
      targetRole: "ciso",
    });
  }
  return r;
}

export async function requestExceptionAction(
  ruleId: string,
  ruleName: string,
  process: string,
  reason: string,
  narrowedScope: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!process.trim() || !reason.trim()) {
    return { ok: false, error: "Name the blocked process and why an exception is needed.", errorKind: "ValidationError" };
  }
  const context = { ruleId, ruleName, process: process.trim(), reason: reason.trim(), narrowedScope: narrowedScope.trim(), requestedBy: actor.label, kind: "rule_exception" };
  const r = await run("/data-flow/protection-rules", () =>
    audited(
      {
        actor,
        action: "protection.exception_requested",
        targetType: "ProtectionRule",
        targetId: ruleId,
        payload: context,
      },
      async (tx: TxClient) => {
        await tx.protectionRuleException.create({
          data: { ruleId, process: process.trim(), narrowedScope: narrowedScope.trim(), status: "requested" },
        });
        return tx.escalation.create({
          data: {
            sourceRole: actor.role,
            targetRole: "ciso",
            reason: `Exception to "${ruleName}" for ${process.trim()}: ${reason.trim()}`,
            contextJson: encodeObject(context),
            status: "open",
          },
        });
      },
    ),
  );
  if (r.ok) {
    await emit(db, {
      kind: "escalation.raised",
      requestId: null,
      requestRef: `Rule exception — ${ruleName}`,
      reason: reason.trim(),
      targetRole: "ciso",
    });
  }
  return r;
}

// --- Entities --------------------------------------------------------------

export async function addEntityAction(
  name: string,
  kind: string,
  parentId: string | null,
  sdfStatus: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!name.trim()) return { ok: false, error: "An entity name is required.", errorKind: "ValidationError" };
  return run("/data-flow/entities", () =>
    audited(
      {
        actor,
        action: "entity.created",
        targetType: "Entity",
        targetId: name.trim(),
        payload: { name: name.trim(), kind, parentId, sdfStatus },
      },
      (tx: TxClient) =>
        tx.entity.create({
          data: {
            name: name.trim(),
            kind,
            hierarchyParentId: parentId,
            sdfStatus,
            sdfHistoryJson: encodeObject([{ status: sdfStatus, note: "Set at creation", at: new Date().toISOString() }]),
          },
        }),
    ),
  );
}

export async function mapUserAction(
  userName: string,
  entityId: string,
  accessScope: string,
  additionalEntities: string[],
  justification: string,
): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!userName.trim() || !entityId) {
    return { ok: false, error: "A user and a home entity are required.", errorKind: "ValidationError" };
  }
  if (accessScope === "cross" && !justification.trim()) {
    return {
      ok: false,
      error: "Cross-entity access needs a justification — it is the deliberate exception, not the default.",
      errorKind: "ValidationError",
    };
  }
  return run("/data-flow/entities", () =>
    audited(
      {
        actor,
        action: "entity.user_mapped",
        targetType: "EntityUserMapping",
        targetId: userName.trim(),
        payload: { userName: userName.trim(), entityId, accessScope, additionalEntities, justification },
      },
      (tx: TxClient) =>
        tx.entityUserMapping.create({
          data: {
            userName: userName.trim(),
            entityId,
            accessScope,
            additionalEntitiesJson: encodeList(additionalEntities),
            justification: justification.trim() || null,
          },
        }),
    ),
  );
}
