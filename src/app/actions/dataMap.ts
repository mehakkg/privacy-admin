"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
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
            }),
          },
        });
        return tx.activityElement.update({ where: { id: elementId }, data: { requestState: "requested" } });
      },
    ),
  );
}
