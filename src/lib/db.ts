import { PrismaClient } from "@prisma/client";

/**
 * The audit log is append-only. Any attempt to update or delete an entry is
 * refused at the client layer, so immutability does not depend on every future
 * caller remembering the rule.
 */
const IMMUTABLE_MODELS = new Set(["AuditLogEntry"]);

/**
 * Governance-owned objects. Purposes, notices, cookie categories and protection
 * rules are created and approved in the DPO / CISO modules. Admin implements
 * them; Admin does not author them.
 *
 * No mutation function for these models is written anywhere in src/ — this
 * extension is the belt to that braces, and turns "we didn't write the code"
 * into "the code would refuse". The seed is the stand-in for the governance
 * modules and is the one caller allowed through.
 */
const GOVERNANCE_MODELS = new Set([
  "PurposeTag",
  "NoticeVersion",
  "CookieCategory",
  "ProtectionRule",
  "RetentionCategory",
]);

const MUTATING_OPS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
]);

const DESTRUCTIVE_OPS = new Set([
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
]);

/** The seed script stands in for the DPO / CISO modules that do not exist yet. */
const seedMode = process.env.PRIVACY_ADMIN_SEED === "1";

export class ImmutableRecordError extends Error {
  constructor(model: string, operation: string) {
    super(
      `${model} is append-only: '${operation}' is refused. Audit entries must ` +
        `survive the deletion of the data they describe.`,
    );
    this.name = "ImmutableRecordError";
  }
}

export class GovernanceReadOnlyError extends Error {
  constructor(model: string, operation: string) {
    super(
      `${model} is governance-owned and read-only to Admin: '${operation}' is ` +
        `refused. This object is created and approved by the DPO / CISO.`,
    );
    this.name = "GovernanceReadOnlyError";
  }
}

function buildClient() {
  return new PrismaClient().$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (MUTATING_OPS.has(operation)) {
            if (IMMUTABLE_MODELS.has(model) && DESTRUCTIVE_OPS.has(operation)) {
              throw new ImmutableRecordError(model, operation);
            }
            if (GOVERNANCE_MODELS.has(model) && !seedMode) {
              throw new GovernanceReadOnlyError(model, operation);
            }
          }
          return query(args);
        },
      },
    },
  });
}

type ExtendedClient = ReturnType<typeof buildClient>;

const globalForPrisma = globalThis as unknown as { prisma?: ExtendedClient };

export const db: ExtendedClient = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
