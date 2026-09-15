"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { audited } from "@/lib/engines/audit";
import type { TxClient } from "@/lib/tx";
import type { ActionResult } from "@/app/actions/requests";

const PATH = "/discovery/ropa";
const keyOf = (sourceId: string, purposeTagId: string | null, subject: string | null) =>
  `${sourceId}|${purposeTagId ?? ""}|${subject ?? ""}`;

/**
 * Recompute suggestions from current approved ClassifiedField state — a grouping
 * by (source, purpose, subject type). Idempotent and non-destructive of human
 * decisions: a pending grouping is refreshed, an ACCEPTED one is left alone, and
 * a DISMISSED one only reappears if a genuinely new field has joined its group.
 * Stale pending groupings (no fields any more) are cleared.
 */
export async function refreshRopaSuggestionsAction(): Promise<ActionResult> {
  const { actor } = await getSession();
  try {
    const fields = await db.classifiedField.findMany({
      where: { reviewState: "approved" },
      select: { id: true, sourceId: true, purposeTagId: true, dataSubjectType: true },
    });
    const groups = new Map<string, { sourceId: string; purposeTagId: string | null; dataSubjectType: string | null; fieldIds: string[] }>();
    for (const f of fields) {
      const key = keyOf(f.sourceId, f.purposeTagId, f.dataSubjectType);
      const g = groups.get(key) ?? { sourceId: f.sourceId, purposeTagId: f.purposeTagId, dataSubjectType: f.dataSubjectType, fieldIds: [] };
      g.fieldIds.push(f.id);
      groups.set(key, g);
    }

    const existing = await db.ropaSuggestion.findMany();
    const byKey = new Map(existing.map((s) => [keyOf(s.sourceId, s.purposeTagId, s.dataSubjectType), s]));
    const currentKeys = new Set(groups.keys());

    await audited(
      { actor, action: "ropa.suggestions_refreshed", targetType: "RopaSuggestion", targetId: "all", payload: { groups: groups.size } },
      async (tx: TxClient) => {
        for (const [key, g] of groups) {
          const prev = byKey.get(key);
          const fieldIdsJson = JSON.stringify([...g.fieldIds].sort());
          if (!prev) {
            await tx.ropaSuggestion.create({ data: { sourceId: g.sourceId, purposeTagId: g.purposeTagId, dataSubjectType: g.dataSubjectType, fieldIdsJson, status: "pending" } });
          } else if (prev.status === "pending") {
            await tx.ropaSuggestion.update({ where: { id: prev.id }, data: { fieldIdsJson, generatedAt: new Date() } });
          } else if (prev.status === "dismissed") {
            const prevSet = new Set<string>(JSON.parse(prev.fieldIdsJson || "[]"));
            const grew = g.fieldIds.some((id) => !prevSet.has(id));
            if (grew) await tx.ropaSuggestion.update({ where: { id: prev.id }, data: { status: "pending", fieldIdsJson, dismissedReason: null, generatedAt: new Date() } });
          }
          // accepted → never touched
        }
        for (const s of existing) {
          if (s.status === "pending" && !currentKeys.has(keyOf(s.sourceId, s.purposeTagId, s.dataSubjectType))) {
            await tx.ropaSuggestion.delete({ where: { id: s.id } });
          }
        }
      },
    );
    revalidatePath(PATH, "layout");
    return { ok: true };
  } catch (error) {
    const e = error as Error;
    return { ok: false, error: e.message, errorKind: e.name };
  }
}

/**
 * Accept — the human decision point. Creates a real ProcessingActivity (origin
 * "ropa_suggested" so the register shows provenance) plus one ActivityElement
 * per field in the grouping, and links back via activityId.
 */
export async function acceptRopaSuggestionAction(id: string): Promise<ActionResult> {
  const { actor } = await getSession();
  try {
    await audited(
      { actor, action: "ropa.suggestion_accepted", targetType: "RopaSuggestion", targetId: id, payload: {} },
      async (tx: TxClient) => {
        const s = await tx.ropaSuggestion.findUniqueOrThrow({ where: { id }, include: { source: true, purposeTag: true } });
        if (s.status !== "pending") throw Object.assign(new Error("Only a pending suggestion can be accepted."), { name: "StateError" });
        const fieldIds = JSON.parse(s.fieldIdsJson || "[]") as string[];
        const fields = await tx.classifiedField.findMany({ where: { id: { in: fieldIds } }, select: { fieldPath: true } });
        const name = s.purposeTag ? `${s.purposeTag.name} — ${s.source.name}` : `Processing at ${s.source.name}`;
        const activity = await tx.processingActivity.create({
          data: { activity: name, purposeTagId: s.purposeTagId, subjectType: s.dataSubjectType, origin: "ropa_suggested" },
        });
        for (const f of fields) {
          await tx.activityElement.create({ data: { activityId: activity.id, elementName: f.fieldPath, purposeTagId: s.purposeTagId, subjectType: s.dataSubjectType, requestState: "none" } });
        }
        return tx.ropaSuggestion.update({ where: { id }, data: { status: "accepted", activityId: activity.id } });
      },
    );
    revalidatePath(PATH, "layout");
    revalidatePath("/data-map/processing-activities", "layout");
    return { ok: true };
  } catch (error) {
    const e = error as Error;
    return { ok: false, error: e.message, errorKind: e.name };
  }
}

/** Dismiss — a reason is required, same evidentiary standard as every other
 *  rejection path. Won't reappear on the next refresh unless its fields change. */
export async function dismissRopaSuggestionAction(id: string, reason: string): Promise<ActionResult> {
  const { actor } = await getSession();
  if (!reason.trim()) return { ok: false, error: "A reason is required to dismiss a suggestion.", errorKind: "ValidationError" };
  try {
    await audited(
      { actor, action: "ropa.suggestion_dismissed", targetType: "RopaSuggestion", targetId: id, payload: { reason: reason.trim() } },
      (tx: TxClient) => tx.ropaSuggestion.update({ where: { id }, data: { status: "dismissed", dismissedReason: reason.trim() } }),
    );
    revalidatePath(PATH, "layout");
    return { ok: true };
  } catch (error) {
    const e = error as Error;
    return { ok: false, error: e.message, errorKind: e.name };
  }
}
