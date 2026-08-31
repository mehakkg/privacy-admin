import { db } from "@/lib/db";
import type { TxClient } from "@/lib/tx";
import { audited, type AuditActor } from "@/lib/engines/audit";
import { emit } from "@/lib/engines/notification";
import { decodeObject, encodeObject } from "@/lib/codec/json";
import type { CompletionState } from "@/lib/domain";

/**
 * DISCOVERY & CLASSIFICATION ENGINE
 *
 * Discovery is continuous, not a task with an end. The shape here follows from
 * that: a living inventory is the source of truth, a triage queue surfaces what
 * needs a decision today, and per-source drill-down owns configuration and
 * history. Nothing is modelled as a one-time run.
 *
 * Reuses the existing engines rather than growing parallel ones:
 *   - every override, resolution and bulk action goes through `audited()`
 *   - a merge across systems uses the SAME three-state completion model as
 *     erasure and revocation, because it is the same problem: a write that
 *     several systems confirm separately is not done when the first one
 *     returns success.
 */

// ---------------------------------------------------------------------------
// Source coverage
// ---------------------------------------------------------------------------

/**
 * Never-scanned and stale are different problems with different follow-ups —
 * a setup gap versus a maintenance gap — so they are separate states rather
 * than one "not current" bucket.
 */
export type CoverageState =
  | "never_scanned"
  | "stale"
  | "current"
  | "running"
  | "failed"
  | "awaiting_approval";

export const COVERAGE_LABEL: Record<CoverageState, string> = {
  never_scanned: "Never scanned",
  stale: "Stale",
  current: "Current",
  running: "Scanning",
  failed: "Last scan failed",
  awaiting_approval: "Awaiting approval",
};

export const COVERAGE_TONE: Record<CoverageState, "green" | "yellow" | "red" | "gray" | "blue" | "purple"> = {
  never_scanned: "red",
  stale: "yellow",
  current: "green",
  running: "blue",
  failed: "red",
  awaiting_approval: "purple",
};

/** A scan older than this is stale. Organisational policy, not statutory. */
export const STALE_AFTER_DAYS = 30;

export function coverageOf(
  source: {
    dpoApprovedForScanning: boolean;
    scanStatus: string;
    lastScanned: Date | null;
  },
  now: Date = new Date(),
): CoverageState {
  if (!source.dpoApprovedForScanning) return "awaiting_approval";
  if (source.scanStatus === "running") return "running";
  if (source.scanStatus === "failed") return "failed";
  if (!source.lastScanned) return "never_scanned";

  const ageDays = (now.getTime() - source.lastScanned.getTime()) / 86_400_000;
  return ageDays > STALE_AFTER_DAYS ? "stale" : "current";
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

export interface ScanStage {
  stage: string;
  state: "pending" | "running" | "done" | "failed";
  detail?: string;
}

export class ScanNotApprovedError extends Error {
  constructor(sourceName: string) {
    super(
      `${sourceName} has not been approved for scanning by the DPO. Discovery ` +
        `scope is a governance decision, so a source Admin can connect is not ` +
        `automatically one Admin may scan.`,
    );
    this.name = "ScanNotApprovedError";
  }
}

/**
 * Deterministic simulated outcome, keyed off the source's own configuration —
 * the same approach as connectors/simulated.ts, so a demo is reproducible.
 */
function scanOutcome(source: { name: string; connectionState: string; kind: string }) {
  if (source.connectionState === "failed") {
    return {
      status: "failed" as const,
      failureStage: "connect",
      failureReason:
        `The credentials stored for ${source.name} were rejected. The service ` +
        `account password expired on the source system.`,
      failureAction:
        "Rotate the service-account password on the source, update it under " +
        "Integrations, then re-run the scan.",
    };
  }
  if (source.kind === "file_share") {
    // Large shares routinely time out part-way; partial is the honest result.
    return {
      status: "partial" as const,
      failureStage: "enumerate",
      failureReason:
        "Enumeration timed out after 45 minutes with roughly a third of the " +
        "share still unread. What was read has been classified.",
      failureAction:
        "Set an off-peak window in Scan Config and re-run, or reduce scan " +
        "depth to shallow for a first pass.",
    };
  }
  return {
    status: "completed" as const,
    failureStage: null,
    failureReason: null,
    failureAction: null,
  };
}

const STAGES = ["connect", "enumerate", "sample", "classify", "reconcile"];

/**
 * Run a scan. Refuses without DPO approval — enforced here rather than only in
 * the UI, so the rule holds regardless of which route reached it.
 */
export async function runScan(sourceId: string, actor: AuditActor) {
  const source = await db.discoverySource.findUniqueOrThrow({ where: { id: sourceId } });
  if (!source.dpoApprovedForScanning) throw new ScanNotApprovedError(source.name);

  const outcome = scanOutcome(source);
  const now = new Date();

  const previousFields = await db.classifiedField.count({ where: { sourceId } });

  const stages: ScanStage[] = STAGES.map((stage) => {
    if (!outcome.failureStage) return { stage, state: "done" };
    const failedIdx = STAGES.indexOf(outcome.failureStage);
    const idx = STAGES.indexOf(stage);
    if (idx < failedIdx) return { stage, state: "done" };
    if (idx === failedIdx)
      return { stage, state: outcome.status === "failed" ? "failed" : "done", detail: outcome.failureReason ?? undefined };
    return {
      stage,
      state: outcome.status === "failed" ? "pending" : "done",
    };
  });

  const found = outcome.status === "failed" ? 0 : previousFields;

  const run = await audited(
    {
      actor,
      action: "discovery.scan_run",
      targetType: "DiscoverySource",
      targetId: sourceId,
      payload: {
        source: source.name,
        outcome: outcome.status,
        failureStage: outcome.failureStage,
        fieldsFound: found,
      },
    },
    async (tx: TxClient) => {
      await tx.discoverySource.update({
        where: { id: sourceId },
        data: {
          scanStatus: outcome.status === "completed" ? "scanned" : outcome.status,
          lastScanned: outcome.status === "failed" ? source.lastScanned : now,
          scanFailureDetail: outcome.failureReason,
        },
      });

      return tx.scanRun.create({
        data: {
          sourceId,
          status: outcome.status,
          startedAt: now,
          completedAt: now,
          stagesJson: encodeObject(stages),
          fieldsFound: found,
          fieldsNew: 0,
          fieldsChanged: 0,
          fieldsRemoved: 0,
          failureStage: outcome.failureStage,
          failureReason: outcome.failureReason,
          failureAction: outcome.failureAction,
        },
      });
    },
  );

  if (outcome.status !== "completed") {
    await emit(db, {
      kind: "discovery.scan_failed",
      sourceName: source.name,
      stage: outcome.failureStage ?? "unknown",
      partial: outcome.status === "partial",
    });
  }

  return run;
}

export function readStages(json: string): ScanStage[] {
  return decodeObject<ScanStage[]>(json) ?? [];
}

// ---------------------------------------------------------------------------
// Classification review
// ---------------------------------------------------------------------------

export class MissingOverrideReasonError extends Error {
  constructor() {
    super(
      "A reason is required when overriding a classification. Without it, the " +
        "next reviewer cannot tell a considered correction from a mistake.",
    );
    this.name = "MissingOverrideReasonError";
  }
}

export async function approveFields(fieldIds: string[], actor: AuditActor) {
  return audited(
    {
      actor,
      action: "discovery.classifications_approved",
      targetType: "ClassifiedField",
      targetId: fieldIds.join(","),
      payload: { count: fieldIds.length, fieldIds },
    },
    (tx: TxClient) =>
      tx.classifiedField.updateMany({
        where: { id: { in: fieldIds } },
        data: {
          reviewState: "approved",
          reviewedByActorId: actor.id ?? null,
          reviewedAt: new Date(),
          lastVerified: new Date(),
          driftFlag: false,
        },
      }),
  );
}

export async function overrideField(
  fieldId: string,
  newType: string,
  reason: string,
  actor: AuditActor,
) {
  if (!reason.trim()) throw new MissingOverrideReasonError();

  const field = await db.classifiedField.findUniqueOrThrow({
    where: { id: fieldId },
    include: { source: true },
  });

  return audited(
    {
      actor,
      action: "discovery.classification_overridden",
      targetType: "ClassifiedField",
      targetId: fieldId,
      payload: {
        source: field.source.name,
        field: field.fieldPath,
        detectedType: field.detectedType,
        overriddenTo: newType,
        reason,
        // An override on a HIGH-confidence detection is evidence the detector
        // is wrong about that pattern, not just about this row.
        wasHighConfidence: field.confidence === "high",
      },
    },
    (tx: TxClient) =>
      tx.classifiedField.update({
        where: { id: fieldId },
        data: {
          reviewState: "overridden",
          overriddenType: newType,
          overrideReason: reason,
          highConfidenceOverride: field.confidence === "high",
          reviewedByActorId: actor.id ?? null,
          reviewedAt: new Date(),
          lastVerified: new Date(),
          driftFlag: false,
        },
      }),
  );
}

/** Purpose tags come only from the DPO-approved taxonomy — never free text. */
export async function assignPurpose(
  fieldId: string,
  purposeTagId: string,
  actor: AuditActor,
) {
  const [field, tag] = await Promise.all([
    db.classifiedField.findUniqueOrThrow({ where: { id: fieldId } }),
    db.purposeTag.findUniqueOrThrow({ where: { id: purposeTagId } }),
  ]);

  if (tag.status !== "approved") {
    throw new Error(
      `${tag.name} is not an approved purpose. Only purposes the DPO has ` +
        `approved can be assigned here.`,
    );
  }

  return audited(
    {
      actor,
      action: "discovery.purpose_assigned",
      targetType: "ClassifiedField",
      targetId: fieldId,
      payload: { field: field.fieldPath, purpose: tag.name },
    },
    (tx: TxClient) =>
      tx.classifiedField.update({
        where: { id: fieldId },
        data: { purposeTagId },
      }),
  );
}

// ---------------------------------------------------------------------------
// Bulk actions — partial success is reported per item
// ---------------------------------------------------------------------------

export interface BulkOutcome {
  attempted: number;
  succeeded: string[];
  failed: { id: string; reason: string }[];
}

/**
 * Applies an operation across items and reports EXACTLY which succeeded and
 * which did not.
 *
 * A blanket "bulk action failed" when nineteen of twenty worked is both wrong
 * and dangerous: it invites the operator to re-run the whole batch, which is
 * how the successful nineteen get acted on twice.
 */
export async function bulkApply<T extends { id: string }>(
  items: T[],
  operation: (item: T) => Promise<unknown>,
): Promise<BulkOutcome> {
  const succeeded: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const item of items) {
    try {
      await operation(item);
      succeeded.push(item.id);
    } catch (error) {
      failed.push({ id: item.id, reason: (error as Error).message });
    }
  }

  return { attempted: items.length, succeeded, failed };
}

export async function resolveTriageItems(
  itemIds: string[],
  resolution: "resolved" | "dismissed" | "escalated",
  actor: AuditActor,
): Promise<BulkOutcome> {
  const items = await db.triageItem.findMany({ where: { id: { in: itemIds } } });

  const outcome = await bulkApply(items, (item) =>
    audited(
      {
        actor,
        action: `discovery.triage_${resolution}`,
        targetType: "TriageItem",
        targetId: item.id,
        payload: { type: item.type, priority: item.priority },
      },
      (tx: TxClient) =>
        tx.triageItem.update({
          where: { id: item.id },
          data: {
            status: resolution,
            resolvedAt: new Date(),
            resolvedByActorId: actor.id ?? null,
          },
        }),
    ),
  );

  // Items that were requested but did not come back from the database failed
  // too, and saying so is the difference between a report and a guess.
  const foundIds = new Set(items.map((i) => i.id));
  for (const id of itemIds) {
    if (!foundIds.has(id)) {
      outcome.failed.push({ id, reason: "No longer exists — it may have been resolved by someone else." });
      outcome.attempted += 1;
    }
  }

  return outcome;
}

// ---------------------------------------------------------------------------
// Duplicates — merge uses the three-state model
// ---------------------------------------------------------------------------

export interface MergeCompletion {
  pairId: string;
  state: CompletionState;
  hasFailures: boolean;
  totals: { systems: number; verified: number; failed: number; pending: number };
  steps: {
    id: string;
    systemName: string;
    status: string;
    referencesUpdated: number;
    failureCode: string | null;
    failureDetail: string | null;
  }[];
  blockedBy: string[];
}

/**
 * Derived, never stored. A merge is "verified" only once every system holding a
 * reference has confirmed it updated — the same rule as erasure across systems,
 * for the same reason.
 */
export async function computeMergeCompletion(pairId: string): Promise<MergeCompletion> {
  const steps = await db.mergeStep.findMany({
    where: { duplicatePairId: pairId },
    include: { system: true },
    orderBy: { id: "asc" },
  });

  const totals = {
    systems: steps.length,
    verified: steps.filter((s) => s.status === "verified").length,
    failed: steps.filter((s) => s.status === "failed").length,
    pending: steps.filter((s) => s.status === "pending").length,
  };

  const blockedBy = steps
    .filter((s) => s.status !== "verified")
    .map((s) =>
      s.status === "failed"
        ? `${s.system.name}: ${s.failureCode ?? "failed"} — references there still point at both records.`
        : `${s.system.name}: not yet confirmed.`,
    );

  const state: CompletionState =
    totals.systems > 0 && totals.verified === totals.systems
      ? "verified"
      : totals.verified > 0
        ? "partial"
        : "pending";

  return {
    pairId,
    state,
    hasFailures: totals.failed > 0,
    totals,
    steps: steps.map((s) => ({
      id: s.id,
      systemName: s.system.name,
      status: s.status,
      referencesUpdated: s.referencesUpdated,
      failureCode: s.failureCode,
      failureDetail: s.failureDetail,
    })),
    blockedBy,
  };
}

export async function resolveDuplicate(
  pairId: string,
  resolution: "merge" | "keep_both" | "keep_one",
  keptFieldId: string | null,
  actor: AuditActor,
) {
  const pair = await db.duplicatePair.findUniqueOrThrow({
    where: { id: pairId },
    include: { fieldA: true, fieldB: true },
  });

  const result = await audited(
    {
      actor,
      action: `discovery.duplicate_${resolution}`,
      targetType: "DuplicatePair",
      targetId: pairId,
      payload: {
        fieldA: pair.fieldA.fieldPath,
        fieldB: pair.fieldB.fieldPath,
        similarity: pair.similarityScore,
        resolution,
        keptFieldId,
      },
    },
    async (tx: TxClient) => {
      await tx.triageItem.updateMany({
        where: { duplicatePairId: pairId, status: "open" },
        data: { status: "resolved", resolvedAt: new Date(), resolvedByActorId: actor.id ?? null },
      });

      return tx.duplicatePair.update({
        where: { id: pairId },
        data: {
          resolution,
          keptFieldId,
          resolvedAt: new Date(),
          resolvedByActorId: actor.id ?? null,
        },
      });
    },
  );

  // Only a merge has to propagate. Keep-both changes nothing downstream, which
  // is part of why it must stay the cheap option.
  if (resolution === "merge") {
    const systems = await db.connectedSystem.findMany({ where: { hasApi: true } });
    for (const system of systems) {
      const ok = system.connectionStatus === "healthy";
      await db.mergeStep.create({
        data: {
          duplicatePairId: pairId,
          systemId: system.id,
          status: ok ? "verified" : "failed",
          referencesUpdated: ok ? 1 : 0,
          confirmedAt: ok ? new Date() : null,
          failureCode: ok ? null : "ERR_UNREACHABLE",
          failureDetail: ok
            ? null
            : `${system.name} did not respond, so references there still point at both records.`,
        },
      });
    }

    const completion = await computeMergeCompletion(pairId);
    if (completion.state !== "verified") {
      await emit(db, {
        kind: "discovery.merge_incomplete",
        fieldPath: pair.fieldA.fieldPath,
        remaining: completion.totals.systems - completion.totals.verified,
      });
    }
  }

  return result;
}

export async function resolveRot(
  candidateId: string,
  resolution: "quarantine" | "delete" | "retain",
  reason: string,
  actor: AuditActor,
) {
  const candidate = await db.rOTCandidate.findUniqueOrThrow({
    where: { id: candidateId },
    include: { field: { include: { source: true } } },
  });

  return audited(
    {
      actor,
      action: `discovery.rot_${resolution}`,
      targetType: "ROTCandidate",
      targetId: candidateId,
      payload: {
        field: candidate.field.fieldPath,
        source: candidate.field.source.name,
        businessValueScore: candidate.businessValueScore,
        resolution,
        reason,
      },
    },
    async (tx: TxClient) => {
      await tx.triageItem.updateMany({
        where: { fieldId: candidate.fieldId, type: "rot", status: "open" },
        data: { status: "resolved", resolvedAt: new Date(), resolvedByActorId: actor.id ?? null },
      });

      return tx.rOTCandidate.update({
        where: { id: candidateId },
        data: {
          resolution,
          resolutionReason: reason,
          resolvedAt: new Date(),
          resolvedByActorId: actor.id ?? null,
        },
      });
    },
  );
}
