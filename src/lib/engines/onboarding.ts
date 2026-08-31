import { db } from "@/lib/db";
import type { TxClient } from "@/lib/tx";
import { audited, type AuditActor } from "@/lib/engines/audit";
import { decodeObject, encodeObject } from "@/lib/codec/json";
import {
  ONBOARDING_STEPS,
  SKIP_CONSEQUENCE,
  type StepStatus,
} from "@/lib/domain";

/**
 * ONBOARDING STATE ENGINE
 *
 * Progress is persisted server-side, not held in the browser. Resuming returns
 * to the step Admin left off with prior answers intact, because the alternative
 * — losing a half-finished setup to a closed tab — is what makes people rush
 * the compliance-critical parts.
 *
 * Two rules the engine enforces rather than trusting screens to honour:
 *
 *  1. Step 1 cannot be skipped. `skipStep(1)` throws. There is no skip control
 *     on Screen 1, and if one were ever added by mistake the server would
 *     still refuse it.
 *  2. Every confirmation writes an audit entry through `audited()`. Onboarding
 *     is the first place in the product where the audit log has to already be
 *     live, so these are real chained entries, not a special case.
 */

export const SINGLETON = "singleton";

export class StepNotSkippableError extends Error {
  constructor(step: number) {
    super(
      `Step ${step} cannot be skipped. Escalation routing and retention ` +
        `awareness are the two things that, left unconfigured, would let a ` +
        `deletion run with nowhere to escalate and no retention check.`,
    );
    this.name = "StepNotSkippableError";
  }
}

export type StepStatusMap = Record<string, "done" | "skipped">;

export interface OnboardingView {
  currentStep: number;
  startedAt: Date;
  completedAt: Date | null;
  status: StepStatusMap;
  escalationContactActorId: string | null;
  backupContactActorId: string | null;
  scopedEntityId: string | null;
  governanceUnavailableAcknowledged: boolean;
  retentionCategoriesAcknowledged: boolean;
  /** Screen 1 is complete, so the mandatory gate has been passed. */
  gateCleared: boolean;
  skippedSteps: { n: number; label: string; consequence: string }[];
  doneSteps: { n: number; label: string }[];
}

function view(row: {
  currentStep: number;
  startedAt: Date;
  completedAt: Date | null;
  stepStatusJson: string;
  escalationContactActorId: string | null;
  backupContactActorId: string | null;
  scopedEntityId: string | null;
  governanceUnavailableAcknowledged: boolean;
  retentionCategoriesAcknowledged: boolean;
}): OnboardingView {
  const status = (decodeObject<StepStatusMap>(row.stepStatusJson) ?? {}) as StepStatusMap;

  return {
    currentStep: row.currentStep,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    status,
    escalationContactActorId: row.escalationContactActorId,
    backupContactActorId: row.backupContactActorId,
    scopedEntityId: row.scopedEntityId,
    governanceUnavailableAcknowledged: row.governanceUnavailableAcknowledged,
    retentionCategoriesAcknowledged: row.retentionCategoriesAcknowledged,
    gateCleared: status["1"] === "done",
    // Step 1 is structurally absent from this list: it was never skippable, so
    // it can never appear in a "skipped" column.
    skippedSteps: ONBOARDING_STEPS.filter(
      (s) => s.skippable && status[String(s.n)] === "skipped",
    ).map((s) => ({
      n: s.n,
      label: s.label,
      consequence: SKIP_CONSEQUENCE[s.n] ?? "",
    })),
    doneSteps: ONBOARDING_STEPS.filter((s) => status[String(s.n)] === "done").map(
      (s) => ({ n: s.n, label: s.label }),
    ),
  };
}

/** Read state, creating the singleton on first run. */
export async function getOnboarding(): Promise<OnboardingView> {
  const row = await db.onboardingState.upsert({
    where: { id: SINGLETON },
    create: { id: SINGLETON },
    update: {},
  });
  return view(row);
}

export function stepStatus(v: OnboardingView, n: number): StepStatus {
  return v.status[String(n)] ?? "pending";
}

/** Where a resume should land: the first step that is neither done nor skipped. */
export function resumeStep(v: OnboardingView): number {
  if (v.completedAt) return 7;
  const next = ONBOARDING_STEPS.find((s) => stepStatus(v, s.n) === "pending");
  return next?.n ?? 7;
}

async function writeStatus(
  actor: AuditActor,
  step: number,
  value: "done" | "skipped",
  action: string,
  payload: Record<string, unknown>,
) {
  const current = await getOnboarding();
  const nextStatus: StepStatusMap = { ...current.status, [String(step)]: value };
  const advanceTo = Math.min(
    7,
    Math.max(step + 1, current.currentStep === step ? step + 1 : current.currentStep),
  );

  return audited(
    {
      actor,
      action,
      targetType: "OnboardingState",
      targetId: SINGLETON,
      payload: { step, outcome: value, ...payload },
    },
    (tx: TxClient) =>
      tx.onboardingState.update({
        where: { id: SINGLETON },
        data: {
          stepStatusJson: encodeObject(nextStatus),
          currentStep: advanceTo,
        },
      }),
  );
}

export async function markStepDone(
  step: number,
  actor: AuditActor,
  payload: Record<string, unknown> = {},
) {
  const slug = ONBOARDING_STEPS.find((s) => s.n === step)?.slug ?? String(step);
  return writeStatus(actor, step, "done", `onboarding.${slug}_confirmed`, payload);
}

export async function skipStep(step: number, actor: AuditActor) {
  const meta = ONBOARDING_STEPS.find((s) => s.n === step);
  if (!meta?.skippable) throw new StepNotSkippableError(step);

  return writeStatus(actor, step, "skipped", `onboarding.${meta.slug}_skipped`, {
    consequence: SKIP_CONSEQUENCE[step] ?? "",
  });
}

/**
 * Screen 1 — the mandatory gate.
 *
 * Refuses without an escalation contact, and refuses a backup contact that
 * cannot actually be notified. Both are enforced here as well as in the form,
 * because the form's disabled button is a courtesy and this is the rule.
 */
export class MissingEscalationContactError extends Error {
  constructor() {
    super(
      "An escalation contact is required. Retention conflicts and policy " +
        "exceptions have to route somewhere, and Admin cannot rule on them.",
    );
    this.name = "MissingEscalationContactError";
  }
}

export class UnreachableBackupContactError extends Error {
  constructor(name: string) {
    super(
      `${name} has no notification channel configured, so escalations routed ` +
        `to them would go nowhere. Choose a different backup contact, or leave ` +
        `the backup empty.`,
    );
    this.name = "UnreachableBackupContactError";
  }
}

export interface ConfirmGateInput {
  escalationContactActorId: string | null;
  backupContactActorId: string | null;
  backupHasChannel: boolean;
  backupName: string | null;
  scopedEntityId: string | null;
  /** True when the DPO roster came back empty. */
  noDpoAssigned: boolean;
  /** True when the statutory category list came back empty. */
  noRetentionCategories: boolean;
  /** Set only when governance could not be loaded and Admin acknowledged it. */
  governanceUnavailable: boolean;
  categoryCount: number;
}

export async function confirmGate(input: ConfirmGateInput, actor: AuditActor) {
  if (!input.escalationContactActorId) throw new MissingEscalationContactError();
  if (input.backupContactActorId && !input.backupHasChannel) {
    throw new UnreachableBackupContactError(input.backupName ?? "That contact");
  }

  await audited(
    {
      actor,
      // Named for what it is, so the trail reads as a decision rather than a
      // form submission.
      action: "onboarding.escalation_contact_confirmed",
      targetType: "OnboardingState",
      targetId: SINGLETON,
      payload: {
        escalationContact: input.escalationContactActorId,
        backupContact: input.backupContactActorId,
        scopedEntity: input.scopedEntityId,
        retentionCategoriesSeen: input.categoryCount,
        noDpoAssigned: input.noDpoAssigned,
        noRetentionCategories: input.noRetentionCategories,
        proceededWithoutGovernanceData: input.governanceUnavailable,
      },
    },
    (tx: TxClient) =>
      tx.onboardingState.update({
        where: { id: SINGLETON },
        data: {
          escalationContactActorId: input.escalationContactActorId,
          backupContactActorId: input.backupContactActorId,
          scopedEntityId: input.scopedEntityId,
          retentionCategoriesAcknowledged: true,
          governanceUnavailableAcknowledged: input.governanceUnavailable,
        },
      }),
  );

  return markStepDone(1, actor, {
    escalationContact: input.escalationContactActorId,
    riskFlags: [
      input.noDpoAssigned ? "no_dpo_assigned" : null,
      input.noRetentionCategories ? "no_retention_categories" : null,
      input.governanceUnavailable ? "governance_unavailable" : null,
    ].filter(Boolean),
  });
}

export async function completeOnboarding(actor: AuditActor) {
  const current = await getOnboarding();

  return audited(
    {
      actor,
      action: "onboarding.completed",
      targetType: "OnboardingState",
      targetId: SINGLETON,
      payload: {
        done: current.doneSteps.map((s) => s.label),
        skipped: current.skippedSteps.map((s) => s.label),
        // Recorded explicitly: a setup that met only the mandatory gate is a
        // different thing from a finished setup, and the log should say so.
        minimumOnly: current.skippedSteps.length >= 4,
      },
    },
    (tx: TxClient) =>
      tx.onboardingState.update({
        where: { id: SINGLETON },
        data: { completedAt: new Date(), currentStep: 7 },
      }),
  );
}

/** Restart the wizard. Used by the dashboard strip's "resume setup" link. */
export async function reopenOnboarding(step: number) {
  await db.onboardingState.update({
    where: { id: SINGLETON },
    data: { currentStep: step },
  });
}

/**
 * A custom event has no sensible default recipient, so leaving it blank would
 * mean nobody is told when it fires. Pure so both the server action and the
 * verification script test the same rule.
 */
export function findUnroutedCustomEvents(
  routes: { eventType: string; recipientRole: string }[],
  knownEventTypes: readonly string[],
): string[] {
  const known = new Set(knownEventTypes);
  return routes
    .filter((r) => !known.has(r.eventType) && !r.recipientRole.trim())
    .map((r) => r.eventType);
}
