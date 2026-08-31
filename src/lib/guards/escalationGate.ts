import type { ActorRole } from "@/lib/domain";
import { RETENTION_OVERRIDE_BASIS } from "@/lib/dpdp/statute";

/**
 * ESCALATION GATE (acceptance criteria 5 and 6)
 *
 * Criterion 5 — Admin cannot resolve a legal or policy conflict unilaterally.
 * When a technical action collides with a governance rule (an erasure request
 * meeting a statutory retention obligation), Admin escalates to the DPO with
 * full context attached and waits for a documented ruling.
 *
 * The spec asks for unilateral override to be "structurally awkward, not just
 * discouraged by policy". Three things make it so, and only the third is load
 * bearing:
 *
 *   1. There is no override control in the Admin UI — only "Request override",
 *      which opens the escalation builder.
 *   2. `overridden` / `upheld` are unreachable except through a recorded ruling.
 *   3. `assertMayRule` refuses when the acting role is not the DPO. An admin
 *      cannot rule on their own escalation, whatever route they take to the
 *      mutation.
 *
 * Criterion 6 — governance objects are read-only to Admin. Purposes, notices,
 * cookie categories and protection rules have no mutation function anywhere in
 * src/, and lib/db.ts refuses writes to them outright.
 */

/** Only the DPO may record a ruling on a retention conflict. */
const RULING_ROLES: readonly ActorRole[] = ["dpo"];

export class UnilateralOverrideError extends Error {
  constructor(role: ActorRole) {
    super(
      `A '${role}' actor cannot rule on a retention conflict. Overriding a ` +
        `legal-retention obligation requires a documented ruling from the Data ` +
        `Protection Officer (${RETENTION_OVERRIDE_BASIS.citation}). Raise an ` +
        `escalation with the request context attached and wait for the ruling.`,
    );
    this.name = "UnilateralOverrideError";
  }
}

export class MissingRulingError extends Error {
  constructor() {
    super(
      "This retention exception has no DPO ruling. Deletion of the protected " +
        "fields cannot proceed until a ruling is recorded against the escalation.",
    );
    this.name = "MissingRulingError";
  }
}

export function mayRule(role: ActorRole): boolean {
  return RULING_ROLES.includes(role);
}

/** Throws rather than returning a flag, so the check cannot be ignored. */
export function assertMayRule(role: ActorRole): void {
  if (!mayRule(role)) throw new UnilateralOverrideError(role);
}

/**
 * Governance models Admin may read but never write. Mirrors the set enforced in
 * lib/db.ts; exported so views can render the "approved policy" treatment from
 * one list rather than hard-coding it per screen.
 */
export const GOVERNANCE_OBJECTS = [
  "PurposeTag",
  "NoticeVersion",
  "CookieCategory",
  "ProtectionRule",
] as const;

export type GovernanceObject = (typeof GOVERNANCE_OBJECTS)[number];

export const GOVERNANCE_OWNER: Record<GovernanceObject, ActorRole> = {
  PurposeTag: "dpo",
  NoticeVersion: "dpo",
  CookieCategory: "dpo",
  ProtectionRule: "ciso",
};
