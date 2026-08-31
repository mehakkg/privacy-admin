import { db } from "@/lib/db";
import { decodeList } from "@/lib/codec/json";
import { RETENTION_BLOCKING_STATUSES, type RetentionReviewStatus } from "@/lib/domain";
import { RETENTION_OVERRIDE_BASIS } from "@/lib/dpdp/statute";

/**
 * RETENTION GATE (acceptance criterion 4)
 *
 * Legal-retention exceptions must be surfaced BEFORE any deletion action is
 * reachable — not discovered afterwards, when the data is already gone.
 *
 * The gate is enforced on the server, in front of every execution mutation.
 * Ordering the screens so retention comes first is a convenience for the
 * person; `assertRetentionReviewed` is what makes it true. Navigating straight
 * to the execution URL, or replaying a stale form post, still fails.
 *
 * Legal basis: DPDP Act 2023 s.8(7) proviso — erasure is required on withdrawal
 * of consent or once the specified purpose is served, EXCEPT where retention is
 * necessary for compliance with any law in force. That exception is scoped to
 * the data the law actually requires, which is why exceptions carry field paths
 * and deletion is partial rather than all-or-nothing.
 */

export class RetentionGateError extends Error {
  readonly unreviewed: number;
  readonly citation = RETENTION_OVERRIDE_BASIS.citation;

  constructor(unreviewed: number) {
    super(
      `Execution is blocked: ${unreviewed} legal-retention obligation${unreviewed === 1 ? "" : "s"} ` +
        `for this Data Principal ${unreviewed === 1 ? "has" : "have"} not been reviewed. ` +
        `Review them before any deletion action (${RETENTION_OVERRIDE_BASIS.citation}).`,
    );
    this.name = "RetentionGateError";
    this.unreviewed = unreviewed;
  }
}

export interface RetentionPosture {
  /** True when no unreviewed exception stands in the way of execution. */
  clear: boolean;
  unreviewedCount: number;
  exceptions: {
    id: string;
    dataCategory: string;
    fieldPaths: string[];
    legalBasis: string;
    statuteRef: string;
    expiryCondition: string;
    expiresAt: Date | null;
    reviewStatus: RetentionReviewStatus;
    autoFlagged: boolean;
    /** Whether these fields must be withheld from deletion. */
    withholds: boolean;
  }[];
  /** Union of every field path that must be excluded from deletion. */
  protectedFields: string[];
}

/**
 * A retention exception withholds its fields unless a DPO ruling has released
 * them. `overridden` is only reachable through a ruling (see escalationGate).
 */
function withholds(status: RetentionReviewStatus): boolean {
  return status !== "overridden";
}

export async function getRetentionPosture(
  principalId: string | null,
  requestId?: string,
): Promise<RetentionPosture> {
  if (!principalId) {
    return { clear: true, unreviewedCount: 0, exceptions: [], protectedFields: [] };
  }

  const rows = await db.retentionException.findMany({
    where: {
      principalId,
      ...(requestId ? { OR: [{ requestId }, { requestId: null }] } : {}),
    },
    orderBy: { dataCategory: "asc" },
  });

  const exceptions = rows.map((row) => {
    const reviewStatus = row.reviewStatus as RetentionReviewStatus;
    return {
      id: row.id,
      dataCategory: row.dataCategory,
      fieldPaths: decodeList(row.fieldPathsJson),
      legalBasis: row.legalBasis,
      statuteRef: row.statuteRef,
      expiryCondition: row.expiryCondition,
      expiresAt: row.expiresAt,
      reviewStatus,
      autoFlagged: row.autoFlagged,
      withholds: withholds(reviewStatus),
    };
  });

  const unreviewedCount = exceptions.filter((e) =>
    RETENTION_BLOCKING_STATUSES.includes(e.reviewStatus),
  ).length;

  const protectedFields = [
    ...new Set(exceptions.filter((e) => e.withholds).flatMap((e) => e.fieldPaths)),
  ].sort();

  return {
    clear: unreviewedCount === 0,
    unreviewedCount,
    exceptions,
    protectedFields,
  };
}

/**
 * Call at the top of every execution mutation. Throws rather than returning a
 * flag, so a caller cannot proceed by ignoring the result.
 */
export async function assertRetentionReviewed(
  principalId: string | null,
  requestId?: string,
): Promise<RetentionPosture> {
  const posture = await getRetentionPosture(principalId, requestId);
  if (!posture.clear) throw new RetentionGateError(posture.unreviewedCount);
  return posture;
}

/**
 * The field paths that must be withheld from a deletion against a given set of
 * data categories. Execution payloads carry this as `excludedFields`, which is
 * what makes field-level partial deletion the default shape rather than a
 * special case bolted on beside an all-or-nothing delete.
 */
export function excludedFieldsFor(
  posture: RetentionPosture,
  dataCategories: readonly string[],
): string[] {
  return [
    ...new Set(
      posture.exceptions
        .filter((e) => e.withholds && dataCategories.includes(e.dataCategory))
        .flatMap((e) => e.fieldPaths),
    ),
  ].sort();
}
