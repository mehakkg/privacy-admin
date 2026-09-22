import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { TxClient } from "@/lib/tx";
import { canonicalise, encodeObject } from "@/lib/codec/json";
import type { ActorRole } from "@/lib/domain";

/**
 * AUDIT LOGGING ENGINE (acceptance criterion 2)
 *
 * Two properties this module is responsible for:
 *
 *  AUTOMATIC — `recordAction` writes the audit entry inside the SAME database
 *  transaction as the mutation it describes. Callers use `audited()`, which
 *  takes the mutation as a callback; there is no way to run the mutation
 *  through this helper and skip the log, and no separate "write to audit log"
 *  step anywhere in the UI.
 *
 *  IMMUTABLE — entries are hash-chained. Each entry stores a sha256 over its
 *  own canonical content INCLUDING the previous entry's hash, so altering or
 *  removing any historical entry breaks every hash after it. `verifyChain()`
 *  walks the chain and reports the first break, which makes tamper-evidence
 *  something we can demonstrate rather than assert. Update and delete are
 *  refused at the client layer (see lib/db.ts).
 *
 * Deleting the underlying personal data never deletes the record that it was
 * deleted: `targetId` is a plain string column, not a foreign key, so no
 * cascade can reach an audit entry.
 */

export const GENESIS_HASH = "0".repeat(64);

export interface AuditActor {
  id?: string | null;
  label: string;
  role: ActorRole;
}

export interface AuditInput {
  actor: AuditActor;
  /** Dotted verb, e.g. "execution.dispatched", "retention.override_requested". */
  action: string;
  targetType: string;
  targetId: string;
  requestId?: string | null;
  payload?: Record<string, unknown>;
  evidenceRef?: string | null;
  /** Customer-centric denormalisation for the unified audit search (not hashed). */
  customerId?: string | null;
  eventDescription?: string | null;
}

function hashEntry(fields: {
  timestamp: Date;
  actorLabel: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  requestId: string | null;
  payloadJson: string;
  evidenceRef: string | null;
  prevHash: string;
}): string {
  return createHash("sha256").update(canonicalise(fields)).digest("hex");
}

/**
 * Append one entry. Pass the transaction client so the entry and the mutation
 * it describes commit or roll back together — an action that did not happen
 * must not leave an audit trail, and an action that happened must always leave
 * one.
 */
export async function recordAction(
  tx: TxClient,
  input: AuditInput,
): Promise<{ id: string; seq: number; payloadHash: string }> {
  const previous = await tx.auditLogEntry.findFirst({
    orderBy: { seq: "desc" },
    select: { payloadHash: true },
  });

  const timestamp = new Date();
  const payloadJson = encodeObject(input.payload ?? {});
  const prevHash = previous?.payloadHash ?? GENESIS_HASH;

  const fields = {
    timestamp,
    actorLabel: input.actor.label,
    actorRole: input.actor.role,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    requestId: input.requestId ?? null,
    payloadJson,
    evidenceRef: input.evidenceRef ?? null,
    prevHash,
  };

  const entry = await tx.auditLogEntry.create({
    data: {
      ...fields,
      actorId: input.actor.id ?? null,
      payloadHash: hashEntry(fields),
      // Denormalised, non-hashed columns for the unified audit search.
      customerId: input.customerId ?? null,
      sourceModule: input.action.split(".")[0] || null,
      eventType: input.action,
      eventDescription: input.eventDescription ?? null,
    },
    select: { id: true, seq: true, payloadHash: true },
  });

  return entry;
}

/**
 * Run a mutation and log it atomically.
 *
 * Engine and server-action code mutates through this helper rather than
 * touching `db` directly, which is what makes logging automatic instead of
 * something a caller has to remember.
 */
export async function audited<T>(
  input: AuditInput | ((result: never) => AuditInput),
  mutation: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    const result = await mutation(tx);
    const entry =
      typeof input === "function"
        ? (input as (r: T) => AuditInput)(result)
        : input;
    await recordAction(tx, entry);
    return result;
  });
}

export interface ChainVerification {
  ok: boolean;
  entriesChecked: number;
  /** seq of the first entry that fails verification, if any. */
  brokenAtSeq: number | null;
  reason: string | null;
}

/**
 * Walk the chain from the beginning, recomputing each hash and checking that
 * every entry links to its predecessor. Reports the FIRST break: everything
 * after a break is untrustworthy, so there is no value in listing it all.
 */
export async function verifyChain(): Promise<ChainVerification> {
  const entries = await db.auditLogEntry.findMany({ orderBy: { seq: "asc" } });

  let expectedPrev = GENESIS_HASH;

  for (const entry of entries) {
    if (entry.prevHash !== expectedPrev) {
      return {
        ok: false,
        entriesChecked: entries.length,
        brokenAtSeq: entry.seq,
        reason: `Entry ${entry.seq} links to ${entry.prevHash.slice(0, 12)}… but the previous entry hashes to ${expectedPrev.slice(0, 12)}…. An entry has been removed or reordered.`,
      };
    }

    const recomputed = hashEntry({
      timestamp: entry.timestamp,
      actorLabel: entry.actorLabel,
      actorRole: entry.actorRole,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      requestId: entry.requestId,
      payloadJson: entry.payloadJson,
      evidenceRef: entry.evidenceRef,
      prevHash: entry.prevHash,
    });

    if (recomputed !== entry.payloadHash) {
      return {
        ok: false,
        entriesChecked: entries.length,
        brokenAtSeq: entry.seq,
        reason: `Entry ${entry.seq} does not match its recorded hash. Its contents have been altered since it was written.`,
      };
    }

    expectedPrev = entry.payloadHash;
  }

  return {
    ok: true,
    entriesChecked: entries.length,
    brokenAtSeq: null,
    reason: null,
  };
}

export interface AuditQuery {
  requestId?: string;
  targetId?: string;
  customerId?: string;
  action?: string;
  actorRole?: string;
  from?: Date;
  to?: Date;
  search?: string;
  take?: number;
}

export async function searchAuditLog(query: AuditQuery = {}) {
  const where: Prisma.AuditLogEntryWhereInput = {};

  if (query.requestId) where.requestId = query.requestId;
  if (query.targetId) where.targetId = query.targetId;
  if (query.customerId) where.customerId = query.customerId;
  if (query.action) where.action = { contains: query.action };
  if (query.actorRole) where.actorRole = query.actorRole;
  if (query.from || query.to) {
    where.timestamp = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }
  if (query.search) {
    where.OR = [
      { action: { contains: query.search } },
      { targetId: { contains: query.search } },
      { actorLabel: { contains: query.search } },
      { payloadJson: { contains: query.search } },
    ];
  }

  return db.auditLogEntry.findMany({
    where,
    orderBy: { seq: "desc" },
    take: query.take ?? 200,
  });
}
