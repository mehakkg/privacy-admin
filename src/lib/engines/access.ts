import { db } from "@/lib/db";
import type { TxClient } from "@/lib/tx";
import { audited, type AuditActor } from "@/lib/engines/audit";
import { emit } from "@/lib/engines/notification";
import { decodeList, encodeList } from "@/lib/codec/json";
import type { CompletionState, Disposition } from "@/lib/domain";
import { COMPLETION_STATE_LABEL } from "@/lib/domain";

/**
 * ACCESS LIFECYCLE ENGINE (Scenario 2)
 *
 * Staff access to systems holding personal data. The DPDP duty in play is
 * s.8(4) — reasonable security safeguards — and the practical failure it guards
 * against is access that outlives its reason: an offboarded employee whose token
 * still works, a role that quietly widened, an account nobody owns.
 *
 * The engine deliberately reuses Scenario 1's discipline rather than inventing a
 * parallel one:
 *
 *   - Revocation across N systems is the SAME three-state problem as erasure
 *     across N systems. `computeRevocationCompletion` mirrors
 *     engines/completion.ts, and there is no boolean "revoked" column.
 *   - Killing a grant is not killing a session. A revocation that removed the
 *     role but left a live token is PARTIAL, and says so.
 *   - Every mutation goes through `audited()`, so the trail is automatic.
 *   - Widening a role beyond its CISO-approved baseline is a governance change,
 *     not a technical one, and is refused (see guards/baselineGate.ts).
 */

// ---------------------------------------------------------------------------
// Revocation completion — the three-state model, applied to access
// ---------------------------------------------------------------------------

export interface RevocationTarget {
  accountId: string;
  recordId: string | null;
  systemName: string;
  username: string;
  status: "pending" | "partial" | "verified" | "failed";
  grantsRevoked: number;
  sessionsKilled: number;
  /** The usual reason a revocation is only partial. */
  sessionsRemaining: number;
  confirmedAt: Date | null;
  failureCode: string | null;
  failureDetail: string | null;
  failureRawResponse: string | null;
  attempt: number;
}

export interface RevocationCompletion {
  userId: string;
  userName: string;
  state: CompletionState;
  hasFailures: boolean;
  totals: {
    accounts: number;
    verified: number;
    pending: number;
    partial: number;
    failed: number;
    sessionsStillLive: number;
  };
  targets: RevocationTarget[];
  failures: RevocationTarget[];
  blockedBy: string[];
}

/**
 * Derived on every read, never stored.
 *
 * `verified` requires every account revoked AND no live session anywhere. An
 * offboarding reported complete while a refresh token still works is the exact
 * failure this shape exists to prevent.
 */
export async function computeRevocationCompletion(
  userId: string,
  now: Date = new Date(),
): Promise<RevocationCompletion> {
  const user = await db.internalUser.findUniqueOrThrow({
    where: { id: userId },
    include: {
      accounts: {
        include: {
          system: true,
          sessions: true,
          grants: true,
          revocations: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });

  const targets: RevocationTarget[] = user.accounts.map((account) => {
    const record = account.revocations[0] ?? null;
    const liveSessions = account.sessions.filter(
      (s) => !s.terminatedAt && (!s.expiresAt || s.expiresAt > now),
    ).length;

    return {
      accountId: account.id,
      recordId: record?.id ?? null,
      systemName: account.system.name,
      username: account.username,
      status:
        (record?.status as RevocationTarget["status"] | undefined) ?? "pending",
      grantsRevoked: record?.grantsRevoked ?? 0,
      sessionsKilled: record?.sessionsKilled ?? 0,
      sessionsRemaining: liveSessions,
      confirmedAt: record?.confirmedAt ?? null,
      failureCode: record?.failureCode ?? null,
      failureDetail: record?.failureDetail ?? null,
      failureRawResponse: record?.failureRawResponse ?? null,
      attempt: record?.attempt ?? 0,
    };
  });

  const totals = {
    accounts: targets.length,
    verified: targets.filter((t) => t.status === "verified").length,
    pending: targets.filter((t) => t.status === "pending").length,
    partial: targets.filter((t) => t.status === "partial").length,
    failed: targets.filter((t) => t.status === "failed").length,
    sessionsStillLive: targets.reduce((sum, t) => sum + t.sessionsRemaining, 0),
  };

  const blockedBy: string[] = [];
  for (const target of targets) {
    if (target.status === "verified" && target.sessionsRemaining === 0) continue;

    if (target.status === "failed") {
      blockedBy.push(
        `${target.systemName}: revocation failed — ${target.failureCode ?? "unknown error"}.`,
      );
    } else if (target.sessionsRemaining > 0) {
      blockedBy.push(
        `${target.systemName}: ${target.sessionsRemaining} session or token is still live, so this account can still reach personal data.`,
      );
    } else if (target.status === "pending") {
      blockedBy.push(`${target.systemName}: access has not been revoked yet.`);
    } else {
      blockedBy.push(`${target.systemName}: revocation reported only partial.`);
    }
  }

  const allClear =
    totals.accounts > 0 &&
    totals.verified === totals.accounts &&
    totals.sessionsStillLive === 0;

  const state: CompletionState = allClear
    ? "verified"
    : totals.verified > 0 || totals.partial > 0
      ? "partial"
      : "pending";

  return {
    userId,
    userName: user.fullName,
    state,
    hasFailures: totals.failed > 0,
    totals,
    targets,
    failures: targets.filter((t) => t.status === "failed"),
    blockedBy,
  };
}

// ---------------------------------------------------------------------------
// Least-privilege analysis
// ---------------------------------------------------------------------------

export interface GrantAnalysis {
  grantId: string;
  roleName: string;
  scopeCategories: string[];
  baselineCategories: string[];
  /** Categories this grant reaches that the role's baseline does not allow. */
  excessCategories: string[];
  overBroad: boolean;
  expired: boolean;
}

/**
 * A grant is over-broad when it reaches data categories the role's CISO-approved
 * baseline does not cover. This is what makes "least privilege" a check rather
 * than an intention.
 */
export function analyseGrant(
  grant: { id: string; scopeCategoriesJson: string; expiresAt: Date | null },
  role: { name: string; baselineCategoriesJson: string },
  now: Date = new Date(),
): GrantAnalysis {
  const scopeCategories = decodeList(grant.scopeCategoriesJson);
  const baselineCategories = decodeList(role.baselineCategoriesJson);
  const excessCategories = scopeCategories.filter(
    (c) => !baselineCategories.includes(c),
  );

  return {
    grantId: grant.id,
    roleName: role.name,
    scopeCategories,
    baselineCategories,
    excessCategories,
    overBroad: excessCategories.length > 0,
    expired: Boolean(grant.expiresAt && grant.expiresAt < now),
  };
}

// ---------------------------------------------------------------------------
// Provisioning
// ---------------------------------------------------------------------------

export class OverBroadGrantError extends Error {
  readonly excess: string[];

  constructor(roleName: string, excess: string[]) {
    super(
      `Cannot grant ${roleName} with access to ${excess.join(", ")}: ` +
        `${excess.length === 1 ? "that category is" : "those categories are"} outside the ` +
        `role's approved baseline. Widening a role beyond its baseline is a ` +
        `governance change, not a provisioning one — ask the CISO to revise the ` +
        `baseline first.`,
    );
    this.name = "OverBroadGrantError";
    this.excess = excess;
  }
}

/**
 * Grant a role on an account, scoped to specific data categories.
 *
 * Refuses a scope wider than the role's baseline. Least privilege is enforced at
 * the point of granting rather than caught later by an audit — an over-broad
 * grant that exists for a week has already been an exposure for a week.
 */
export async function grantAccess(
  accountId: string,
  roleId: string,
  scopeCategories: string[],
  expiresAt: Date | null,
  actor: AuditActor,
) {
  const [account, role] = await Promise.all([
    db.systemAccount.findUniqueOrThrow({
      where: { id: accountId },
      include: { system: true, user: true },
    }),
    db.rBACRole.findUniqueOrThrow({ where: { id: roleId } }),
  ]);

  const baseline = decodeList(role.baselineCategoriesJson);
  const excess = scopeCategories.filter((c) => !baseline.includes(c));
  if (excess.length > 0) throw new OverBroadGrantError(role.name, excess);

  return audited(
    {
      actor,
      action: "access.granted",
      targetType: "SystemAccount",
      targetId: accountId,
      payload: {
        user: account.user.fullName,
        system: account.system.name,
        role: role.name,
        scopeCategories,
        baselineCategories: baseline,
        expiresAt: expiresAt?.toISOString() ?? null,
        leastPrivilege: true,
      },
    },
    (tx: TxClient) =>
      tx.accessGrant.create({
        data: {
          accountId,
          roleId,
          scopeCategoriesJson: encodeList(scopeCategories),
          grantedAt: new Date(),
          grantedByActorId: actor.id ?? null,
          expiresAt,
        },
      }),
  );
}

// ---------------------------------------------------------------------------
// Deprovisioning
// ---------------------------------------------------------------------------

/**
 * Simulated revocation outcome, driven by the system's own configuration — the
 * same deterministic approach as connectors/simulated.ts.
 *
 * The interesting case is `degraded`: the API accepts the role removal but
 * cannot reach the session store, so the grants go and the tokens stay. That is
 * a PARTIAL revocation, and reporting it as done is the failure mode.
 */
function revokeAgainst(system: {
  name: string;
  hasApi: boolean;
  connectionStatus: string;
}): {
  status: "pending" | "partial" | "verified" | "failed";
  killsSessions: boolean;
  failureCode: string | null;
  failureDetail: string | null;
  failureRawResponse: string | null;
} {
  if (!system.hasApi) {
    return {
      status: "pending",
      killsSessions: false,
      failureCode: null,
      failureDetail: null,
      failureRawResponse: null,
    };
  }

  switch (system.connectionStatus) {
    case "healthy":
      return {
        status: "verified",
        killsSessions: true,
        failureCode: null,
        failureDetail: null,
        failureRawResponse: null,
      };
    case "degraded":
      return {
        status: "partial",
        killsSessions: false,
        failureCode: null,
        failureDetail:
          "Roles were removed, but the session store did not respond, so " +
          "existing tokens remain valid until they expire.",
        failureRawResponse: null,
      };
    default:
      return {
        status: "failed",
        killsSessions: false,
        failureCode: "ERR_CONN_REFUSED",
        failureDetail:
          `Connection to ${system.name} was refused. The service account token ` +
          `expired on the integration host, so the revocation endpoint rejected ` +
          `the request.`,
        failureRawResponse: JSON.stringify(
          {
            httpStatus: 401,
            error: "invalid_token",
            error_description: "Token expired at 2026-08-21T02:14:07Z",
            endpoint: "POST /v2/accounts/revoke",
            correlationId: "cid-3d71fa22",
          },
          null,
          2,
        ),
      };
  }
}

export interface DeprovisionResult {
  batchId: string;
  accountsProcessed: number;
}

/**
 * Revoke every account belonging to a user, in one batch.
 *
 * Grants and sessions are handled separately and counted separately, because
 * they fail separately. The completion engine then reports the honest position.
 */
export async function deprovisionUser(
  userId: string,
  actor: AuditActor,
): Promise<DeprovisionResult> {
  const user = await db.internalUser.findUniqueOrThrow({
    where: { id: userId },
    include: {
      accounts: {
        include: { system: true, grants: true, sessions: true },
      },
    },
  });

  const before = await computeRevocationCompletion(userId);
  const batchId = `batch_${Date.now().toString(36)}`;
  const now = new Date();

  for (const account of user.accounts) {
    const outcome = revokeAgainst(account.system);
    const liveGrants = account.grants.filter((g) => !g.revokedAt);
    const liveSessions = account.sessions.filter((s) => !s.terminatedAt);

    const existing = await db.revocationRecord.findFirst({
      where: { accountId: account.id },
      orderBy: { createdAt: "desc" },
    });

    await audited(
      {
        actor,
        action: "access.revocation_dispatched",
        targetType: "SystemAccount",
        targetId: account.id,
        payload: {
          batchId,
          user: user.fullName,
          system: account.system.name,
          username: account.username,
          grantsTargeted: liveGrants.length,
          sessionsTargeted: liveSessions.length,
          outcome: outcome.status,
          sessionsActuallyKilled: outcome.killsSessions ? liveSessions.length : 0,
          failureCode: outcome.failureCode,
        },
      },
      async (tx: TxClient) => {
        // A failed call changes nothing on the target system, so nothing local
        // should change either — recording a revocation that did not happen is
        // how a system comes to believe access is gone when it is not.
        if (outcome.status !== "failed") {
          await tx.accessGrant.updateMany({
            where: { accountId: account.id, revokedAt: null },
            data: { revokedAt: now },
          });

          if (outcome.killsSessions) {
            await tx.activeSession.updateMany({
              where: { accountId: account.id, terminatedAt: null },
              data: { terminatedAt: now, terminatedByActorId: actor.id ?? null },
            });
          }

          await tx.systemAccount.update({
            where: { id: account.id },
            data: {
              status: outcome.status === "verified" ? "revoked" : "disabled",
            },
          });
        }

        const payload = {
          batchId,
          status: outcome.status,
          mode: account.system.hasApi ? "api" : "manual",
          grantsRevoked: outcome.status === "failed" ? 0 : liveGrants.length,
          sessionsKilled: outcome.killsSessions ? liveSessions.length : 0,
          sessionsRemaining: outcome.killsSessions ? 0 : liveSessions.length,
          dispatchedAt: now,
          confirmedAt: outcome.status === "verified" ? now : null,
          confirmedByActorId: outcome.status === "verified" ? (actor.id ?? null) : null,
          verificationMethod: outcome.status === "verified" ? "api_ack" : null,
          failureCode: outcome.failureCode,
          failureDetail: outcome.failureDetail,
          failureRawResponse: outcome.failureRawResponse,
        };

        return existing
          ? tx.revocationRecord.update({
              where: { id: existing.id },
              data: { ...payload, attempt: { increment: 1 } },
            })
          : tx.revocationRecord.create({ data: { accountId: account.id, ...payload } });
      },
    );

    if (outcome.status === "failed") {
      await emit(db, {
        kind: "access.revocation_failed",
        userName: user.fullName,
        systemName: account.system.name,
        failureCode: outcome.failureCode ?? "unknown",
      });
    }
  }

  await audited(
    {
      actor,
      action: "access.deprovision_batch",
      targetType: "InternalUser",
      targetId: userId,
      payload: { batchId, accounts: user.accounts.length },
    },
    (tx: TxClient) =>
      tx.internalUser.update({
        where: { id: userId },
        data: { employmentStatus: "offboarded", leftAt: user.leftAt ?? now },
      }),
  );

  const after = await computeRevocationCompletion(userId);
  if (before.state !== after.state) {
    await emit(db, {
      kind: "access.revocation_state_changed",
      userName: user.fullName,
      from: COMPLETION_STATE_LABEL[before.state],
      to: COMPLETION_STATE_LABEL[after.state],
      sessionsStillLive: after.totals.sessionsStillLive,
    });
  }

  return { batchId, accountsProcessed: user.accounts.length };
}

/** Retry one account's revocation after the underlying cause is fixed. */
export async function retryRevocation(recordId: string, actor: AuditActor) {
  const record = await db.revocationRecord.findUniqueOrThrow({
    where: { id: recordId },
    include: { account: { include: { system: true, user: true } } },
  });

  return deprovisionAccount(record.account.id, actor);
}

/** Revoke a single account (used by retry and by disposition = revoke). */
export async function deprovisionAccount(accountId: string, actor: AuditActor) {
  const account = await db.systemAccount.findUniqueOrThrow({
    where: { id: accountId },
    include: { system: true, user: true, grants: true, sessions: true },
  });

  const outcome = revokeAgainst(account.system);
  const now = new Date();
  const liveGrants = account.grants.filter((g) => !g.revokedAt);
  const liveSessions = account.sessions.filter((s) => !s.terminatedAt);

  const existing = await db.revocationRecord.findFirst({
    where: { accountId },
    orderBy: { createdAt: "desc" },
  });

  const result = await audited(
    {
      actor,
      action: "access.revocation_retried",
      targetType: "SystemAccount",
      targetId: accountId,
      payload: {
        system: account.system.name,
        username: account.username,
        previousFailureCode: existing?.failureCode ?? null,
        outcome: outcome.status,
      },
    },
    async (tx: TxClient) => {
      if (outcome.status !== "failed") {
        await tx.accessGrant.updateMany({
          where: { accountId, revokedAt: null },
          data: { revokedAt: now },
        });
        if (outcome.killsSessions) {
          await tx.activeSession.updateMany({
            where: { accountId, terminatedAt: null },
            data: { terminatedAt: now, terminatedByActorId: actor.id ?? null },
          });
        }
        await tx.systemAccount.update({
          where: { id: accountId },
          data: { status: outcome.status === "verified" ? "revoked" : "disabled" },
        });
      }

      const payload = {
        status: outcome.status,
        mode: account.system.hasApi ? "api" : "manual",
        grantsRevoked: outcome.status === "failed" ? 0 : liveGrants.length,
        sessionsKilled: outcome.killsSessions ? liveSessions.length : 0,
        sessionsRemaining: outcome.killsSessions ? 0 : liveSessions.length,
        dispatchedAt: now,
        confirmedAt: outcome.status === "verified" ? now : null,
        confirmedByActorId: outcome.status === "verified" ? (actor.id ?? null) : null,
        verificationMethod: outcome.status === "verified" ? "api_ack" : null,
        failureCode: outcome.failureCode,
        failureDetail: outcome.failureDetail,
        failureRawResponse: outcome.failureRawResponse,
      };

      return existing
        ? tx.revocationRecord.update({
            where: { id: existing.id },
            data: { ...payload, attempt: { increment: 1 } },
          })
        : tx.revocationRecord.create({
            data: { accountId, batchId: `single_${now.getTime().toString(36)}`, ...payload },
          });
    },
  );

  if (outcome.status === "failed") {
    await emit(db, {
      kind: "access.revocation_failed",
      userName: account.user.fullName,
      systemName: account.system.name,
      failureCode: outcome.failureCode ?? "unknown",
    });
  }

  return result;
}

/**
 * Terminate one live session or token.
 *
 * Separate from revoking a grant, because they are separate facts. This is the
 * action that closes the gap the Revocation Verification dashboard exposes.
 */
export async function terminateSession(sessionId: string, actor: AuditActor) {
  const session = await db.activeSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { account: { include: { system: true, user: true } } },
  });

  return audited(
    {
      actor,
      action: "access.session_terminated",
      targetType: "ActiveSession",
      targetId: sessionId,
      payload: {
        user: session.account.user.fullName,
        system: session.account.system.name,
        kind: session.kind,
        tokenRef: session.tokenRef,
        startedAt: session.startedAt.toISOString(),
      },
    },
    async (tx: TxClient) => {
      const updated = await tx.activeSession.update({
        where: { id: sessionId },
        data: { terminatedAt: new Date(), terminatedByActorId: actor.id ?? null },
      });

      // Once the last live session is gone, a partial revocation becomes a
      // genuine one — recompute rather than leaving a stale status behind.
      const remaining = await tx.activeSession.count({
        where: { accountId: session.accountId, terminatedAt: null },
      });
      if (remaining === 0) {
        const record = await tx.revocationRecord.findFirst({
          where: { accountId: session.accountId },
          orderBy: { createdAt: "desc" },
        });
        if (record && record.status === "partial") {
          await tx.revocationRecord.update({
            where: { id: record.id },
            data: {
              status: "verified",
              sessionsRemaining: 0,
              sessionsKilled: record.sessionsKilled + 1,
              confirmedAt: new Date(),
              confirmedByActorId: actor.id ?? null,
              verificationMethod: "manual_attestation",
            },
          });
          await tx.systemAccount.update({
            where: { id: session.accountId },
            data: { status: "revoked" },
          });
        }
      }

      return updated;
    },
  );
}

// ---------------------------------------------------------------------------
// Dormancy and disposition
// ---------------------------------------------------------------------------

export interface DormantAccount {
  accountId: string;
  userName: string;
  employmentStatus: string;
  systemName: string;
  username: string;
  status: string;
  lastActiveAt: Date | null;
  daysDormant: number | null;
  /** No owning user record, or the owner has left. */
  orphaned: boolean;
  liveSessions: number;
  reachableCategories: string[];
  disposition: { disposition: string; justification: string } | null;
}

/**
 * Accounts unused for longer than the threshold.
 *
 * The threshold is configurable because it is an organisational judgement, not
 * a statutory one — 90 days is a common default, not a legal requirement, and
 * the UI says so.
 */
export async function findDormantAccounts(
  thresholdDays: number,
  now: Date = new Date(),
): Promise<DormantAccount[]> {
  const cutoff = new Date(now.getTime() - thresholdDays * 24 * 60 * 60 * 1000);

  const accounts = await db.systemAccount.findMany({
    where: {
      status: { in: ["active", "disabled", "orphaned"] },
      OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: cutoff } }],
    },
    include: {
      user: true,
      system: true,
      sessions: true,
      disposition: true,
      grants: { where: { revokedAt: null }, include: { role: true } },
    },
  });

  return accounts
    .map((account) => {
      const daysDormant = account.lastActiveAt
        ? Math.floor(
            (now.getTime() - account.lastActiveAt.getTime()) / (24 * 60 * 60 * 1000),
          )
        : null;

      return {
        accountId: account.id,
        userName: account.user.fullName,
        employmentStatus: account.user.employmentStatus,
        systemName: account.system.name,
        username: account.username,
        status: account.status,
        lastActiveAt: account.lastActiveAt,
        daysDormant,
        orphaned:
          account.status === "orphaned" ||
          account.user.employmentStatus === "offboarded",
        liveSessions: account.sessions.filter((s) => !s.terminatedAt).length,
        reachableCategories: [
          ...new Set(
            account.grants.flatMap((g) => decodeList(g.scopeCategoriesJson)),
          ),
        ].sort(),
        disposition: account.disposition
          ? {
              disposition: account.disposition.disposition,
              justification: account.disposition.justification,
            }
          : null,
      };
    })
    .sort((a, b) => (b.daysDormant ?? 99999) - (a.daysDormant ?? 99999));
}

export class MissingJustificationError extends Error {
  constructor() {
    super(
      "A justification is required. A disposition without a reason is not a " +
        "record anyone can rely on when this account is questioned later.",
    );
    this.name = "MissingJustificationError";
  }
}

export async function recordDisposition(
  accountId: string,
  disposition: Disposition,
  justification: string,
  actor: AuditActor,
) {
  if (!justification.trim()) throw new MissingJustificationError();

  const account = await db.systemAccount.findUniqueOrThrow({
    where: { id: accountId },
    include: { system: true, user: true },
  });

  const result = await audited(
    {
      actor,
      action: "access.disposition_recorded",
      targetType: "SystemAccount",
      targetId: accountId,
      payload: {
        user: account.user.fullName,
        system: account.system.name,
        username: account.username,
        disposition,
        justification,
        decidedBy: actor.label,
      },
    },
    (tx: TxClient) =>
      tx.accountDisposition.upsert({
        where: { accountId },
        create: {
          accountId,
          disposition,
          justification,
          decidedByActorId: actor.id ?? null,
        },
        update: {
          disposition,
          justification,
          decidedByActorId: actor.id ?? null,
          decidedAt: new Date(),
        },
      }),
  );

  // A disposition of `revoke` is a decision, not the act. Carry it out so the
  // two cannot drift apart.
  if (disposition === "revoke") await deprovisionAccount(accountId, actor);
  if (disposition === "disable") {
    await audited(
      {
        actor,
        action: "access.account_disabled",
        targetType: "SystemAccount",
        targetId: accountId,
        payload: { system: account.system.name, username: account.username },
      },
      (tx: TxClient) =>
        tx.systemAccount.update({ where: { id: accountId }, data: { status: "disabled" } }),
    );
  }

  return result;
}
