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
        // Purpose-first: clear the pending state on every segment using this purpose.
        await tx.activityPurpose.updateMany({ where: { purposeTagId: purposeId }, data: { requestState: "none" } });
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
        // Purpose-first: a segment whose proposed purpose was rejected reverts to
        // "Decide later" (purpose cleared) so the elements stay but need a new purpose.
        await tx.activityPurpose.updateMany({ where: { purposeTagId: purposeId }, data: { purposeTagId: null, requestState: "none" } });
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

// -- PURPOSE-FIRST structure: Activity → Purpose segment → Elements ----------

export interface ProposedPurposeFull { name: string; description: string; legalBasis: string; retention: string }
export interface NewElementLink { name: string; classifiedFieldId?: string | null }
export interface NewSegmentInput {
  /** existing = use an approved purpose; propose = propose a new one; none = "Decide later". */
  purposeMode: "existing" | "propose" | "none";
  existingPurposeTagId?: string | null;
  proposed?: ProposedPurposeFull | null;
  /** Processor for THIS purpose (moved from the element). Null = internal. */
  processorId?: string | null;
  elements: NewElementLink[];
}

function validateSegment(seg: NewSegmentInput): string | null {
  if (seg.purposeMode === "existing" && !seg.existingPurposeTagId) return "Pick a purpose, or propose one, or choose Decide later.";
  if (seg.purposeMode === "propose") {
    const p = seg.proposed;
    if (!p?.name.trim() || !p?.description.trim() || !(LEGAL_BASES as readonly string[]).includes(p?.legalBasis ?? "")) return "Complete the proposed purpose (name, description, legal basis).";
    if (!p.retention.trim()) return "A proposed purpose needs a retention period.";
  }
  return null;
}

/** Create one purpose segment (+ its element links) under an activity, inside a tx. */
async function createSegment(tx: TxClient, activityId: string, seg: NewSegmentInput, actorLabel: string) {
  let purposeTagId: string | null = null;
  let requestState = "none";
  if (seg.purposeMode === "existing") {
    purposeTagId = seg.existingPurposeTagId ?? null;
  } else if (seg.purposeMode === "propose" && seg.proposed) {
    const purpose = await tx.purposeTag.create({
      data: {
        name: seg.proposed.name.trim(), description: seg.proposed.description.trim(), status: "pending_dpo_approval",
        approvedBy: "—", approvedAt: new Date(), lawfulBasis: seg.proposed.legalBasis, retention: seg.proposed.retention.trim() || null,
        proposedBy: actorLabel, proposedAt: new Date(),
      },
    });
    purposeTagId = purpose.id;
    requestState = "requested"; // purpose (and its processor/retention) await the DPO
  }
  const segment = await tx.activityPurpose.create({ data: { activityId, purposeTagId, processorId: seg.processorId ?? null, requestState } });
  for (const el of seg.elements) {
    if (!el.name.trim()) continue;
    await tx.activityPurposeElement.create({ data: { activityPurposeId: segment.id, fieldName: el.name.trim(), classifiedFieldId: el.classifiedFieldId ?? null } });
  }
  return segment;
}

/**
 * Add Activity, purpose-first: create the activity, then one or more PURPOSE
 * segments, each carrying its processor and its elements — you declare why before
 * what. Committed in one transaction so the new row lands already grouped.
 */
export async function createActivityWithPurposesAction(input: {
  name: string;
  entityId?: string | null;
  description?: string | null;
  segments: NewSegmentInput[];
}): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!input.name.trim()) return { ok: false, error: "Name the activity.", errorKind: "ValidationError" };
  for (const seg of input.segments) {
    const err = validateSegment(seg);
    if (err) return { ok: false, error: err, errorKind: "ValidationError" };
  }
  return run(() =>
    audited(
      { actor, action: "activity.created", targetType: "ProcessingActivity", targetId: input.name.trim(), payload: { purposes: input.segments.length } },
      async (tx: TxClient) => {
        const activity = await tx.processingActivity.create({
          data: { activity: input.name.trim(), entityId: input.entityId || null, description: input.description?.trim() || null, origin: "manual", lifecycleState: "active" },
        });
        for (const seg of input.segments) await createSegment(tx, activity.id, seg, actor.label);
        return activity;
      },
    ),
  );
}

/** Add a purpose segment (+ its elements) to an existing activity. */
export async function addPurposeSegmentAction(activityId: string, seg: NewSegmentInput): Promise<ActionResult> {
  const { actor } = await getSession();
  const err = validateSegment(seg);
  if (err) return { ok: false, error: err, errorKind: "ValidationError" };
  return run(() =>
    audited(
      { actor, action: "activity.purpose_added", targetType: "ProcessingActivity", targetId: activityId, payload: { purposeMode: seg.purposeMode } },
      (tx: TxClient) => createSegment(tx, activityId, seg, actor.label),
    ),
  );
}

/** Link one more element/field under an existing purpose segment. */
export async function addElementToPurposeAction(segmentId: string, el: NewElementLink): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!el.name.trim()) return { ok: false, error: "Name the field.", errorKind: "ValidationError" };
  return run(() =>
    audited(
      { actor, action: "activity.element_linked", targetType: "ActivityPurposeElement", targetId: el.name.trim(), payload: { segmentId } },
      (tx: TxClient) => tx.activityPurposeElement.create({ data: { activityPurposeId: segmentId, fieldName: el.name.trim(), classifiedFieldId: el.classifiedFieldId ?? null } }),
    ),
  );
}

/** Remove one element linkage (does not touch the underlying field record). */
export async function removePurposeElementAction(linkId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() =>
    audited(
      { actor, action: "activity.element_unlinked", targetType: "ActivityPurposeElement", targetId: linkId, payload: {} },
      (tx: TxClient) => tx.activityPurposeElement.delete({ where: { id: linkId } }),
    ),
  );
}

/** Remove a whole purpose segment (and its element linkages) from an activity. */
export async function removePurposeSegmentAction(segmentId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() =>
    audited(
      { actor, action: "activity.purpose_removed", targetType: "ActivityPurpose", targetId: segmentId, payload: {} },
      (tx: TxClient) => tx.activityPurpose.delete({ where: { id: segmentId } }),
    ),
  );
}
