import { db } from "@/lib/db";
import { decodeList } from "@/lib/codec/json";
import type {
  CompletionState,
  ExecutionStatus,
  ExecutionMode,
  VerificationMethod,
} from "@/lib/domain";

/**
 * COMPLETION VERIFICATION ENGINE (acceptance criterion 1)
 *
 * The single source of truth for "how far along is this request".
 *
 * Completion is DERIVED on every read from the execution records and the data
 * location map. It is never stored, and there is no boolean `complete` column
 * anywhere in the schema — a stored flag is exactly how a request comes to be
 * reported done when only the primary database actually confirmed.
 *
 * The rule:
 *
 *   verified  every target in the location map has a verified execution record,
 *             AND every in-scope processor instruction is delivered and
 *             confirmed, AND coverage of the location map is itself complete
 *   partial   at least one target verified, but not all
 *   pending   nothing verified yet
 *
 * `failed` is reported ALONGSIDE the three states, never folded into them: a
 * request with four verified systems and one hard failure is "partially
 * complete with a failure", and collapsing that to either "partial" or "failed"
 * loses the half that someone has to act on.
 *
 * Coverage is the second half of the guarantee. If the location map is stale,
 * or a system is unreachable and we cannot say whether it holds this person's
 * data, then "every known target confirmed" is not the same as "every target
 * confirmed" — so `verified` is withheld and the reason is stated.
 */

/** Locations rediscovered longer ago than this are treated as unproven. */
const COVERAGE_FRESHNESS_DAYS = 90;

export interface TargetCompletion {
  targetId: string;
  kind: "system" | "processor";
  name: string;
  /** Execution mode in play for this target. */
  mode: ExecutionMode | null;
  status: ExecutionStatus;
  executionRecordId: string | null;
  dataCategories: string[];
  recordCount: number;
  /** Fields withheld under a retention exception — a partial, field-level delete. */
  excludedFields: string[];
  scheduledFor: Date | null;
  dispatchedAt: Date | null;
  deliveredAt: Date | null;
  confirmedAt: Date | null;
  confirmedBy: string | null;
  verificationMethod: VerificationMethod | null;
  /** Full diagnostics. Shown to Admin — see criterion 7. */
  failureCode: string | null;
  failureDetail: string | null;
  failureRawResponse: string | null;
  attempt: number;
  /** Location inventory is out of date for this target. */
  stale: boolean;
  requiresManualVerification: boolean;
}

export interface CoverageAssessment {
  complete: boolean;
  /** Plain-language reasons coverage cannot be called complete. */
  reasons: string[];
  knownTargets: number;
  staleTargets: number;
  unreachableSystems: string[];
}

export interface RequestCompletion {
  requestId: string;
  state: CompletionState;
  /** Reported alongside `state`, never merged into it. */
  hasFailures: boolean;
  coverage: CoverageAssessment;
  totals: {
    targets: number;
    verified: number;
    pending: number;
    partial: number;
    failed: number;
  };
  targets: TargetCompletion[];
  failures: TargetCompletion[];
  /** Why the request is not `verified`, when it is not. */
  blockedBy: string[];
}

export async function computeCompletion(
  requestId: string,
  now: Date = new Date(),
): Promise<RequestCompletion> {
  const request = await db.dataPrincipalRequest.findUniqueOrThrow({
    where: { id: requestId },
    select: { id: true, principalId: true },
  });

  const [locations, executions, systems] = await Promise.all([
    request.principalId
      ? db.dataLocation.findMany({
          where: { principalId: request.principalId },
          include: { system: true, processor: true },
        })
      : Promise.resolve([]),
    db.executionRecord.findMany({
      where: { requestId },
      include: {
        system: true,
        processor: true,
        confirmedBy: { select: { name: true } },
      },
    }),
    db.connectedSystem.findMany(),
  ]);

  const executionByTarget = new Map<string, (typeof executions)[number]>();
  for (const record of executions) {
    const key = record.systemId ?? record.processorId;
    if (key) executionByTarget.set(key, record);
  }

  const freshnessCutoff = new Date(
    now.getTime() - COVERAGE_FRESHNESS_DAYS * 24 * 60 * 60 * 1000,
  );

  const targets: TargetCompletion[] = locations.map((location) => {
    const isSystem = Boolean(location.systemId);
    const targetId = (location.systemId ?? location.processorId)!;
    const record = executionByTarget.get(targetId) ?? null;
    const stale =
      location.stale || location.discoveredAt.getTime() < freshnessCutoff.getTime();

    return {
      targetId,
      kind: isSystem ? "system" : "processor",
      name: location.system?.name ?? location.processor?.name ?? "Unknown",
      mode: (record?.mode as ExecutionMode | undefined) ?? null,
      status: (record?.status as ExecutionStatus | undefined) ?? "pending",
      executionRecordId: record?.id ?? null,
      dataCategories: decodeList(location.dataCategoriesJson),
      recordCount: location.recordCount,
      excludedFields: decodeList(record?.excludedFieldsJson),
      scheduledFor: record?.scheduledFor ?? null,
      dispatchedAt: record?.dispatchedAt ?? null,
      deliveredAt: record?.deliveredAt ?? null,
      confirmedAt: record?.confirmedAt ?? null,
      confirmedBy: record?.confirmedBy?.name ?? null,
      verificationMethod:
        (record?.verificationMethod as VerificationMethod | null) ?? null,
      failureCode: record?.failureCode ?? null,
      failureDetail: record?.failureDetail ?? null,
      failureRawResponse: record?.failureRawResponse ?? null,
      attempt: record?.attempt ?? 0,
      stale,
      requiresManualVerification: location.system ? !location.system.hasApi : false,
    };
  });

  // -- Coverage -------------------------------------------------------------
  // "Every known target confirmed" only equals "every target confirmed" if we
  // are confident the map of targets is itself complete.
  const staleTargets = targets.filter((t) => t.stale);
  const coveredSystemIds = new Set(
    locations.filter((l) => l.systemId).map((l) => l.systemId!),
  );
  const unreachableSystems = systems
    .filter(
      (s) =>
        !coveredSystemIds.has(s.id) &&
        (s.connectionStatus === "down" || s.connectionStatus === "degraded"),
    )
    .map((s) => s.name);

  const coverageReasons: string[] = [];
  if (staleTargets.length > 0) {
    coverageReasons.push(
      `${staleTargets.length} location${staleTargets.length === 1 ? "" : "s"} last discovered over ${COVERAGE_FRESHNESS_DAYS} days ago — the inventory may be out of date.`,
    );
  }
  if (unreachableSystems.length > 0) {
    coverageReasons.push(
      `${unreachableSystems.join(", ")} could not be scanned, so we cannot say whether it holds this person's data.`,
    );
  }
  if (targets.length === 0) {
    coverageReasons.push(
      "No data locations have been discovered for this Data Principal yet.",
    );
  }

  const coverage: CoverageAssessment = {
    complete: coverageReasons.length === 0,
    reasons: coverageReasons,
    knownTargets: targets.length,
    staleTargets: staleTargets.length,
    unreachableSystems,
  };

  // -- Roll-up --------------------------------------------------------------
  const totals = {
    targets: targets.length,
    verified: targets.filter((t) => t.status === "verified").length,
    pending: targets.filter((t) => t.status === "pending").length,
    partial: targets.filter((t) => t.status === "partial").length,
    failed: targets.filter((t) => t.status === "failed").length,
  };

  const failures = targets.filter((t) => t.status === "failed");
  const allVerified = totals.targets > 0 && totals.verified === totals.targets;

  const blockedBy: string[] = [];
  if (!coverage.complete) blockedBy.push(...coverage.reasons);
  for (const target of targets) {
    if (target.status === "verified") continue;
    if (target.status === "failed") {
      blockedBy.push(`${target.name} failed: ${target.failureCode ?? "unknown error"}.`);
    } else if (target.status === "partial") {
      blockedBy.push(`${target.name} reported only partial execution.`);
    } else if (target.scheduledFor && target.scheduledFor > now) {
      blockedBy.push(
        `${target.name} is scheduled for ${target.scheduledFor.toISOString().slice(0, 10)} (backup rotation).`,
      );
    } else if (target.requiresManualVerification) {
      blockedBy.push(`${target.name} has no API and awaits manual verification.`);
    } else {
      blockedBy.push(`${target.name} has not confirmed.`);
    }
  }

  const state: CompletionState =
    allVerified && coverage.complete
      ? "verified"
      : totals.verified > 0 || totals.partial > 0
        ? "partial"
        : "pending";

  return {
    requestId,
    state,
    hasFailures: failures.length > 0,
    coverage,
    totals,
    targets,
    failures,
    blockedBy,
  };
}

/** Roll-up label for lists. Keeps the failure visible next to the state. */
export function completionSummary(completion: RequestCompletion): string {
  const base = `${completion.totals.verified}/${completion.totals.targets} confirmed`;
  return completion.hasFailures
    ? `${base} · ${completion.totals.failed} failed`
    : base;
}
