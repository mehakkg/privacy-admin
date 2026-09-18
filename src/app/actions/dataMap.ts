"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { audited } from "@/lib/engines/audit";
import type { TxClient } from "@/lib/tx";
import type { ActionResult } from "@/app/actions/requests";

const PATH = "/data-map/processing-activities";

async function run(operation: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await operation();
    revalidatePath(PATH, "layout");
    return { ok: true };
  } catch (error) {
    const e = error as Error;
    return { ok: false, error: e.message, errorKind: e.name };
  }
}

/** Create a brand-new activity (its elements are added into it afterward). */
export async function addActivityAction(name: string): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!name.trim()) return { ok: false, error: "Name the activity.", errorKind: "ValidationError" };
  return run(() =>
    audited(
      { actor, action: "activity.created", targetType: "ProcessingActivity", targetId: name.trim(), payload: { name: name.trim() } },
      (tx: TxClient) => tx.processingActivity.create({ data: { activity: name.trim(), origin: "manual" } }),
    ),
  );
}

/** Add a PII element to an activity. Purpose/Processor stay unassigned until a
 *  bundled request is approved — subject type can be set directly. */
export async function addElementAction(activityId: string, elementName: string): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!elementName.trim()) return { ok: false, error: "Name the element.", errorKind: "ValidationError" };
  return run(() =>
    audited(
      { actor, action: "activity.element_added", targetType: "ActivityElement", targetId: elementName.trim(), payload: { activityId, elementName: elementName.trim() } },
      (tx: TxClient) => tx.activityElement.create({ data: { activityId, elementName: elementName.trim() } }),
    ),
  );
}

/**
 * Cross-screen reconciliation: land an unassigned Data Inventory field as a new
 * Element on an existing or new Activity. Closes the loop between a discovered,
 * untagged field and the Processing Activities register. The element is created
 * unassigned — Purpose/Processor still route through the DPO request afterwards.
 */
export async function assignFieldToActivityAction(
  fieldName: string,
  target: { activityId?: string | null; newActivityName?: string | null },
): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!fieldName.trim()) return { ok: false, error: "No field to assign.", errorKind: "ValidationError" };
  if (!target.activityId && !target.newActivityName?.trim()) {
    return { ok: false, error: "Pick an activity or name a new one.", errorKind: "ValidationError" };
  }
  return run(() =>
    audited(
      { actor, action: "activity.field_assigned", targetType: "ActivityElement", targetId: fieldName.trim(), payload: { ...target } },
      async (tx: TxClient) => {
        let activityId = target.activityId ?? null;
        if (!activityId) {
          const created = await tx.processingActivity.create({ data: { activity: target.newActivityName!.trim(), origin: "manual" } });
          activityId = created.id;
        }
        return tx.activityElement.create({ data: { activityId, elementName: fieldName.trim() } });
      },
    ),
  );
}

/** Subject Type is Admin-owned (not governance), so it is set directly. */
export async function setSubjectTypeAction(elementId: string, subjectType: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() =>
    audited(
      { actor, action: "activity.subject_type_set", targetType: "ActivityElement", targetId: elementId, payload: { subjectType } },
      (tx: TxClient) => tx.activityElement.update({ where: { id: elementId }, data: { subjectType: subjectType || null } }),
    ),
  );
}

export interface PurposeProcessorRequest {
  /** An existing approved purpose the admin matched to (preferred over new). */
  existingPurposeTagId?: string | null;
  /** A genuinely-new purpose name proposed for DPO creation. */
  proposedPurposeName?: string | null;
  /** The processor this element's data is shared with, or null for internal. */
  processorId?: string | null;
  /** Admin's PROPOSED retention + lawful basis — the DPO sets the final, locked
   *  values at approval time; these travel in the request as a suggestion only. */
  proposedRetention?: string | null;
  proposedLawfulBasis?: string | null;
}

/**
 * The one path to assigning Purpose/Processor: a bundled request routed to the
 * DPO. Admin never creates a Purpose directly — even picking an existing
 * approved purpose still records the element's Purpose+Processor pairing as a
 * request the DPO approves. Reuses the Escalation object (type purpose_request),
 * the same governance-approval pattern used everywhere else.
 */
export async function requestPurposeProcessorAction(
  elementId: string,
  req: PurposeProcessorRequest,
): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!req.existingPurposeTagId && !req.proposedPurposeName?.trim()) {
    return { ok: false, error: "Pick an existing purpose or propose a new one.", errorKind: "ValidationError" };
  }
  return run(() =>
    audited(
      {
        actor,
        action: "activity.purpose_processor_requested",
        targetType: "ActivityElement",
        targetId: elementId,
        payload: { ...req },
      },
      async (tx: TxClient) => {
        const el = await tx.activityElement.findUniqueOrThrow({ where: { id: elementId }, include: { activity: true } });
        await tx.escalation.create({
          data: {
            type: "purpose_request",
            sourceRole: "admin",
            targetRole: "dpo",
            reason: req.existingPurposeTagId
              ? `Assign approved purpose to “${el.elementName}” in ${el.activity.activity}`
              : `New purpose “${req.proposedPurposeName?.trim()}” for “${el.elementName}” in ${el.activity.activity}`,
            contextJson: JSON.stringify({
              elementId,
              elementName: el.elementName,
              activity: el.activity.activity,
              existingPurposeTagId: req.existingPurposeTagId ?? null,
              proposedPurposeName: req.proposedPurposeName?.trim() ?? null,
              processorId: req.processorId ?? null,
              proposedRetention: req.proposedRetention?.trim() || null,
              proposedLawfulBasis: req.proposedLawfulBasis || null,
            }),
          },
        });
        return tx.activityElement.update({ where: { id: elementId }, data: { requestState: "requested" } });
      },
    ),
  );
}

/**
 * Lifecycle: Admin sets Active / Under review directly (both are Admin-owned
 * operational states). Moving to Archived is NOT done here — it needs a DPO
 * ruling, so it routes through requestArchiveAction instead and is refused here.
 */
export async function setLifecycleStateAction(activityId: string, state: string): Promise<ActionResult> {
  const { actor } = await getSession();
  if (state === "archived") {
    return { ok: false, error: "Archiving needs DPO approval — use “Request archive”.", errorKind: "PolicyError" };
  }
  if (state !== "active" && state !== "under_review") {
    return { ok: false, error: "Unknown lifecycle state.", errorKind: "ValidationError" };
  }
  return run(() =>
    audited(
      { actor, action: "activity.lifecycle_set", targetType: "ProcessingActivity", targetId: activityId, payload: { state } },
      (tx: TxClient) => tx.processingActivity.update({ where: { id: activityId }, data: { lifecycleState: state } }),
    ),
  );
}

/**
 * Request to archive an activity — a DPO-approved action, same escalation pattern
 * as Purpose/Processor. Refused while any element is still "requested — awaiting
 * DPO": an activity with an open assignment request cannot be archived out from
 * under it. Admin never flips lifecycle to archived directly.
 */
export async function requestArchiveAction(activityId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() =>
    audited(
      { actor, action: "activity.archive_requested", targetType: "ProcessingActivity", targetId: activityId, payload: {} },
      async (tx: TxClient) => {
        const activity = await tx.processingActivity.findUniqueOrThrow({ where: { id: activityId }, include: { elements: true } });
        const pending = activity.elements.filter((e) => e.requestState === "requested").length;
        if (pending > 0) {
          throw Object.assign(new Error(`${pending} element${pending === 1 ? " is" : "s are"} still awaiting a DPO ruling — resolve those before requesting archive.`), { name: "StateError" });
        }
        await tx.escalation.create({
          data: {
            type: "activity_archive",
            sourceRole: "admin",
            targetRole: "dpo",
            reason: `Archive processing activity “${activity.activity}”`,
            contextJson: JSON.stringify({ activityId, activity: activity.activity }),
          },
        });
        return tx.processingActivity.update({ where: { id: activityId }, data: { lifecycleState: "under_review" } });
      },
    ),
  );
}

/** Entity/business-unit tag — a link into the Fiduciary registry. Admin-owned
 *  (not a governance-locked attribute), so it is set directly. */
export async function setEntityAction(activityId: string, entityId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() =>
    audited(
      { actor, action: "activity.entity_set", targetType: "ProcessingActivity", targetId: activityId, payload: { entityId: entityId || null } },
      (tx: TxClient) => tx.processingActivity.update({ where: { id: activityId }, data: { entityId: entityId || null } }),
    ),
  );
}

const LEGAL_BASES = ["consent", "legitimate_use", "contractual_necessity"] as const;

export interface ProposedPurpose {
  name: string;
  description: string;
  legalBasis: string;
}

/**
 * Propose a brand-new Purpose for an element when nothing in the approved catalog
 * fits. Creates a Purpose row with status = pending_dpo_approval (never approved),
 * linked to the element for DPO context, and marks the element "requested —
 * awaiting DPO". It does not appear in Approved Policy or the existing-purpose
 * picker until the DPO ratifies it.
 */
export async function proposeNewPurposeAction(elementId: string, input: ProposedPurpose): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!input.name.trim()) return { ok: false, error: "Name the purpose.", errorKind: "ValidationError" };
  if (!input.description.trim()) return { ok: false, error: "A one-line description is required.", errorKind: "ValidationError" };
  if (!(LEGAL_BASES as readonly string[]).includes(input.legalBasis)) return { ok: false, error: "Choose a legal basis.", errorKind: "ValidationError" };
  return run(() =>
    audited(
      { actor, action: "purpose.proposed", targetType: "PurposeTag", targetId: input.name.trim(), payload: { elementId, legalBasis: input.legalBasis } },
      async (tx: TxClient) => {
        await tx.activityElement.findUniqueOrThrow({ where: { id: elementId } });
        await tx.purposeTag.create({
          data: {
            name: input.name.trim(),
            description: input.description.trim(),
            status: "pending_dpo_approval",
            approvedBy: "—",
            approvedAt: new Date(),
            lawfulBasis: input.legalBasis,
            proposedBy: actor.label,
            proposedAt: new Date(),
            linkedElementId: elementId,
          },
        });
        return tx.activityElement.update({ where: { id: elementId }, data: { requestState: "requested" } });
      },
    ),
  );
}

/**
 * DPO/CISO ratifies a proposed purpose. It flips to approved (so it appears in
 * Approved Policy and the existing-purpose picker for every element), and the
 * element it was proposed for is assigned it. Legal basis is NOT editable here —
 * it is part of the proposal being approved.
 */
export async function approvePurposeAction(purposeId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  if (actor.role !== "dpo" && actor.role !== "ciso") {
    return { ok: false, error: "Only the DPO or CISO can approve a purpose. Switch role to approve.", errorKind: "UnauthorisedRulingError" };
  }
  try {
    await audited(
      { actor, action: "purpose.approved", targetType: "PurposeTag", targetId: purposeId, payload: { approvedBy: actor.label } },
      async (tx: TxClient) => {
        const p = await tx.purposeTag.findUniqueOrThrow({ where: { id: purposeId } });
        if (p.status !== "pending_dpo_approval") throw Object.assign(new Error("Only a pending purpose can be approved."), { name: "StateError" });
        const purpose = await tx.purposeTag.update({ where: { id: purposeId }, data: { status: "approved", approvedBy: actor.label, approvedAt: new Date() } });
        if (p.linkedElementId) {
          await tx.activityElement.updateMany({ where: { id: p.linkedElementId }, data: { purposeTagId: purpose.id, requestState: "none" } });
        }
        return purpose;
      },
    );
    revalidatePath(PATH, "layout");
    revalidatePath("/governance", "layout");
    revalidatePath("/access/approval-queue", "layout");
    return { ok: true };
  } catch (error) {
    const e = error as Error;
    return { ok: false, error: e.message, errorKind: e.name };
  }
}

/** DPO/CISO rejects a proposed purpose. It is marked rejected (never shown in
 *  Approved Policy), the reason is stored, and the element reverts to Unassigned. */
export async function rejectPurposeAction(purposeId: string, reason: string): Promise<ActionResult> {
  const { actor } = await getSession();
  if (actor.role !== "dpo" && actor.role !== "ciso") {
    return { ok: false, error: "Only the DPO or CISO can reject a purpose. Switch role to decide.", errorKind: "UnauthorisedRulingError" };
  }
  if (!reason.trim()) return { ok: false, error: "A rejection needs a reason.", errorKind: "ValidationError" };
  try {
    await audited(
      { actor, action: "purpose.rejected", targetType: "PurposeTag", targetId: purposeId, payload: { reason: reason.trim() } },
      async (tx: TxClient) => {
        const p = await tx.purposeTag.findUniqueOrThrow({ where: { id: purposeId } });
        if (p.linkedElementId) {
          await tx.activityElement.updateMany({ where: { id: p.linkedElementId, requestState: "requested" }, data: { requestState: "none" } });
        }
        return tx.purposeTag.update({ where: { id: purposeId }, data: { status: "rejected", rejectionReason: reason.trim() } });
      },
    );
    revalidatePath(PATH, "layout");
    revalidatePath("/access/approval-queue", "layout");
    return { ok: true };
  } catch (error) {
    const e = error as Error;
    return { ok: false, error: e.message, errorKind: e.name };
  }
}

export interface NewElementInput {
  name: string;
  /** none = leave unassigned; existing = request an approved purpose; propose = propose a new one. */
  purposeMode: "none" | "existing" | "propose";
  existingPurposeTagId?: string | null;
  processorId?: string | null;
  proposed?: ProposedPurpose | null;
}

/** Shared: attach a purpose choice to a freshly-created element inside a tx. */
async function attachElementPurpose(
  tx: TxClient,
  activityName: string,
  elementId: string,
  elementName: string,
  el: NewElementInput,
  actorLabel: string,
) {
  if (el.purposeMode === "existing" && el.existingPurposeTagId) {
    await tx.escalation.create({
      data: {
        type: "purpose_request", sourceRole: "admin", targetRole: "dpo",
        reason: `Assign approved purpose to “${elementName}” in ${activityName}`,
        contextJson: JSON.stringify({ elementId, elementName, activity: activityName, existingPurposeTagId: el.existingPurposeTagId, processorId: el.processorId ?? null }),
      },
    });
    await tx.activityElement.update({ where: { id: elementId }, data: { requestState: "requested" } });
  } else if (el.purposeMode === "propose" && el.proposed) {
    await tx.purposeTag.create({
      data: {
        name: el.proposed.name.trim(), description: el.proposed.description.trim(), status: "pending_dpo_approval",
        approvedBy: "—", approvedAt: new Date(), lawfulBasis: el.proposed.legalBasis,
        proposedBy: actorLabel, proposedAt: new Date(), linkedElementId: elementId,
      },
    });
    await tx.activityElement.update({ where: { id: elementId }, data: { requestState: "requested" } });
  }
}

/** Add one element to an existing activity, with its purpose choice attached in
 *  the same modal (existing request / new-purpose proposal / leave unassigned). */
export async function addElementWithPurposeAction(activityId: string, el: NewElementInput): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!el.name.trim()) return { ok: false, error: "Name the element.", errorKind: "ValidationError" };
  if (el.purposeMode === "existing" && !el.existingPurposeTagId) return { ok: false, error: "Pick a purpose, or choose to propose one.", errorKind: "ValidationError" };
  if (el.purposeMode === "propose" && (!el.proposed?.name.trim() || !el.proposed?.description.trim() || !(LEGAL_BASES as readonly string[]).includes(el.proposed?.legalBasis ?? ""))) {
    return { ok: false, error: "Complete the proposed purpose.", errorKind: "ValidationError" };
  }
  return run(() =>
    audited(
      { actor, action: "activity.element_added", targetType: "ActivityElement", targetId: el.name.trim(), payload: { activityId, purposeMode: el.purposeMode } },
      async (tx: TxClient) => {
        const activity = await tx.processingActivity.findUniqueOrThrow({ where: { id: activityId } });
        const element = await tx.activityElement.create({ data: { activityId, elementName: el.name.trim() } });
        await attachElementPurpose(tx, activity.activity, element.id, el.name.trim(), el, actor.label);
        return element;
      },
    ),
  );
}

/**
 * Add Activity, the guided way: create the activity AND its first element(s) in
 * one continuous action, each element optionally carrying a purpose request
 * (existing) or a new-purpose proposal — all in a single transaction so the new
 * row lands in the table already showing its correct rollup state.
 */
export async function createActivityWithElementsAction(input: {
  name: string;
  entityId?: string | null;
  description?: string | null;
  elements: NewElementInput[];
}): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!input.name.trim()) return { ok: false, error: "Name the activity.", errorKind: "ValidationError" };
  for (const el of input.elements) {
    if (!el.name.trim()) return { ok: false, error: "Every element needs a name.", errorKind: "ValidationError" };
    if (el.purposeMode === "existing" && !el.existingPurposeTagId) return { ok: false, error: `Pick a purpose for “${el.name.trim()}”, or choose to propose one.`, errorKind: "ValidationError" };
    if (el.purposeMode === "propose") {
      if (!el.proposed?.name.trim() || !el.proposed?.description.trim() || !(LEGAL_BASES as readonly string[]).includes(el.proposed?.legalBasis ?? "")) {
        return { ok: false, error: `Complete the proposed purpose for “${el.name.trim()}”.`, errorKind: "ValidationError" };
      }
    }
  }
  return run(() =>
    audited(
      { actor, action: "activity.created", targetType: "ProcessingActivity", targetId: input.name.trim(), payload: { elements: input.elements.length } },
      async (tx: TxClient) => {
        const activity = await tx.processingActivity.create({
          data: { activity: input.name.trim(), entityId: input.entityId || null, description: input.description?.trim() || null, origin: "manual", lifecycleState: "active" },
        });
        for (const el of input.elements) {
          const element = await tx.activityElement.create({ data: { activityId: activity.id, elementName: el.name.trim() } });
          await attachElementPurpose(tx, activity.activity, element.id, el.name.trim(), el, actor.label);
        }
        return activity;
      },
    ),
  );
}
