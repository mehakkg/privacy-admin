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
