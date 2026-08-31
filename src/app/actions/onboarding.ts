"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { audited } from "@/lib/engines/audit";
import type { TxClient } from "@/lib/tx";
import { encodeList } from "@/lib/codec/json";
import {
  completeOnboarding,
  confirmGate,
  findUnroutedCustomEvents,
  markStepDone,
  skipStep,
  type ConfirmGateInput,
} from "@/lib/engines/onboarding";
import { inspectDpaReference } from "@/lib/guards/processorGate";
import { ROUTABLE_EVENTS } from "@/lib/domain";
import type { ActionResult } from "@/app/actions/requests";

async function run(operation: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await operation();
    revalidatePath("/onboarding", "layout");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    const e = error as Error;
    return { ok: false, error: e.message, errorKind: e.name };
  }
}

// ---------------------------------------------------------------------------
// Screen 1 — mandatory gate
// ---------------------------------------------------------------------------

export async function confirmGateAction(
  input: ConfirmGateInput,
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() => confirmGate(input, actor));
}

// ---------------------------------------------------------------------------
// Generic step transitions
// ---------------------------------------------------------------------------

export async function skipStepAction(step: number): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() => skipStep(step, actor));
}

export async function completeStepAction(
  step: number,
  payload: Record<string, unknown> = {},
): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() => markStepDone(step, actor, payload));
}

// ---------------------------------------------------------------------------
// Screen 2 — data sources
// ---------------------------------------------------------------------------

/**
 * Deterministic connection outcomes keyed off what was typed, so every error
 * branch in the spec is reachable in a demo without a real network:
 *
 *   host containing "badpass"  → credentials rejected
 *   host containing "unreach"  → host unreachable
 *   host containing "noperm"   → insufficient permissions
 *   host containing "empty"    → connected, but nothing accessible
 *   anything else              → connected
 */
function simulateConnection(target: string): {
  state: "connected" | "connected_no_data" | "failed";
  failureCode: string | null;
  failureDetail: string | null;
  hint: string | null;
} {
  const t = target.toLowerCase();

  if (t.includes("badpass")) {
    return {
      state: "failed",
      failureCode: "AUTH_REJECTED",
      failureDetail:
        "The credentials were rejected by the host. The username reached the " +
        "server, so the address is right and the password or key is not.",
      hint: "Re-enter the password, or ask the system owner to reissue the service credential.",
    };
  }
  if (t.includes("unreach")) {
    return {
      state: "failed",
      failureCode: "HOST_UNREACHABLE",
      failureDetail:
        "No response from the host on the given port. Nothing was authenticated, " +
        "so this is a network path problem rather than a credential one.",
      hint: "Check the hostname and port, and whether this platform's IP range is allowed through the firewall.",
    };
  }
  if (t.includes("noperm")) {
    return {
      state: "failed",
      failureCode: "INSUFFICIENT_PERMISSIONS",
      failureDetail:
        "The credentials are valid but the account cannot list schemas. It " +
        "authenticated and was then refused, so the grant is too narrow.",
      hint: "Ask the system owner to grant read access on the schemas holding personal data.",
    };
  }
  if (t.includes("empty")) {
    return {
      state: "connected_no_data",
      failureCode: null,
      failureDetail: null,
      hint:
        "Connected, but no accessible data was found — usually a permission " +
        "scope that excludes every schema.",
    };
  }
  return { state: "connected", failureCode: null, failureDetail: null, hint: null };
}

export async function testSourceAction(
  name: string,
  kind: string,
  target: string,
): Promise<ActionResult> {
  const { actor } = await getSession();

  if (!name.trim() || !target.trim()) {
    return {
      ok: false,
      error: "Give the source a name and a host or connection string.",
      errorKind: "ValidationError",
    };
  }

  const outcome = simulateConnection(target);

  return run(() =>
    audited(
      {
        actor,
        action: "onboarding.source_tested",
        targetType: "DiscoverySource",
        targetId: name,
        payload: {
          name,
          kind,
          result: outcome.state,
          failureCode: outcome.failureCode,
        },
      },
      (tx: TxClient) =>
        tx.discoverySource.upsert({
          where: { name },
          create: {
            name,
            kind,
            connectionState: outcome.state,
            connectionHint: outcome.hint,
            failureCode: outcome.failureCode,
            failureDetail: outcome.failureDetail,
            requiresManualVerification: kind === "other",
            // Scope approval is the DPO's. A source Admin can connect is not
            // automatically a source Admin may scan.
            dpoApprovedForScanning: false,
            estimatedDurationMinutes: kind === "file_share" ? 45 : 6,
          },
          update: {
            kind,
            connectionState: outcome.state,
            connectionHint: outcome.hint,
            failureCode: outcome.failureCode,
            failureDetail: outcome.failureDetail,
            requiresManualVerification: kind === "other",
          },
        }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Screen 3 — discovery scan
// ---------------------------------------------------------------------------

/** fieldPath, detectedType, confidence, maskedSample */
const SAMPLE_FIELDS: [string, string, string, string][] = [
  ["customer.email", "contact", "high", "m•••@example.in"],
  ["customer.phone", "contact", "high", "+91 ••••• •1234"],
  ["customer.full_name", "identity", "high", "M•••• K••••••"],
  ["customer.pan", "kyc", "high", "ABC••••4F"],
  ["ledger.txn_note", "transaction", "needs_review", "ref: cust 449120 refund"],
  ["support.free_text", "support", "needs_review", "spoke to M about card ending 41"],
  ["marketing.segment_code", "marketing", "needs_review", "SEG-HNI-2024"],
];

export async function runScanAction(sourceIds: string[]): Promise<ActionResult> {
  const { actor } = await getSession();

  if (sourceIds.length === 0) {
    return {
      ok: false,
      error: "Select at least one source to scan.",
      errorKind: "ValidationError",
    };
  }

  return run(async () => {
    for (const id of sourceIds) {
      const source = await db.discoverySource.findUniqueOrThrow({ where: { id } });

      // A source that never connected cannot be scanned. Recorded per source,
      // so a mixed run reports "2 of 3 scanned, 1 failed" rather than
      // collapsing into a blanket failure.
      const willFail = source.connectionState !== "connected";

      await audited(
        {
          actor,
          action: "onboarding.scan_run",
          targetType: "DiscoverySource",
          targetId: id,
          payload: { source: source.name, outcome: willFail ? "failed" : "scanned" },
        },
        async (tx: TxClient) => {
          if (willFail) {
            return tx.discoverySource.update({
              where: { id },
              data: {
                scanStatus: "failed",
                lastScanned: new Date(),
                scanFailureDetail:
                  `The connection to ${source.name} is in state ` +
                  `"${source.connectionState}", so there was nothing to scan. ` +
                  `Fix the connection on the sources step, then run the scan again.`,
              },
            });
          }

          await tx.classifiedField.deleteMany({ where: { sourceId: id } });
          for (const [
            fieldPath,
            detectedType,
            confidence,
            maskedSample,
          ] of SAMPLE_FIELDS) {
            await tx.classifiedField.create({
              data: { sourceId: id, fieldPath, detectedType, confidence, maskedSample },
            });
          }

          return tx.discoverySource.update({
            where: { id },
            data: {
              scanStatus: "scanned",
              lastScanned: new Date(),
              scanFailureDetail: null,
              classificationSummary: `${SAMPLE_FIELDS.length} fields classified`,
            },
          });
        },
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Screen 4 — classification review
// ---------------------------------------------------------------------------

export async function approveHighConfidenceAction(): Promise<ActionResult> {
  const { actor } = await getSession();

  return run(async () => {
    const pending = await db.classifiedField.count({
      where: { confidence: "high", reviewState: "pending" },
    });

    await audited(
      {
        actor,
        action: "onboarding.classification_bulk_approved",
        targetType: "ClassifiedField",
        targetId: "high_confidence_batch",
        payload: { approved: pending },
      },
      (tx: TxClient) =>
        tx.classifiedField.updateMany({
          where: { confidence: "high", reviewState: "pending" },
          data: {
            reviewState: "approved",
            reviewedByActorId: actor.id ?? null,
            reviewedAt: new Date(),
          },
        }),
    );
  });
}

export async function overrideFieldAction(
  fieldId: string,
  newType: string,
  reason: string,
): Promise<ActionResult> {
  const { actor } = await getSession();

  if (!reason.trim()) {
    return {
      ok: false,
      error:
        "A change reason is required. The next person to read this needs to " +
        "know why the detector was wrong.",
      errorKind: "ValidationError",
    };
  }

  const field = await db.classifiedField.findUniqueOrThrow({ where: { id: fieldId } });
  // Overriding a HIGH-confidence detection is evidence the detector is wrong
  // about that pattern, not just about this row. Logged under its own action so
  // it can feed confidence scoring rather than disappearing into the noise.
  const isHighConfidenceOverride = field.confidence === "high";

  return run(() =>
    audited(
      {
        actor,
        action: isHighConfidenceOverride
          ? "onboarding.classification_high_confidence_corrected"
          : "onboarding.classification_overridden",
        targetType: "ClassifiedField",
        targetId: fieldId,
        payload: {
          fieldPath: field.fieldPath,
          detectedType: field.detectedType,
          correctedTo: newType,
          reason,
          detectorConfidence: field.confidence,
          scoringFeedback: isHighConfidenceOverride,
        },
      },
      (tx: TxClient) =>
        tx.classifiedField.update({
          where: { id: fieldId },
          data: {
            reviewState: "overridden",
            overriddenType: newType,
            overrideReason: reason,
            highConfidenceOverride: isHighConfidenceOverride,
            reviewedByActorId: actor.id ?? null,
            reviewedAt: new Date(),
          },
        }),
    ),
  );
}

export async function approveFieldAction(fieldId: string): Promise<ActionResult> {
  const { actor } = await getSession();
  const field = await db.classifiedField.findUniqueOrThrow({ where: { id: fieldId } });

  return run(() =>
    audited(
      {
        actor,
        action: "onboarding.classification_approved",
        targetType: "ClassifiedField",
        targetId: fieldId,
        payload: { fieldPath: field.fieldPath, detectedType: field.detectedType },
      },
      (tx: TxClient) =>
        tx.classifiedField.update({
          where: { id: fieldId },
          data: {
            reviewState: "approved",
            reviewedByActorId: actor.id ?? null,
            reviewedAt: new Date(),
          },
        }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Screen 5 — processors
// ---------------------------------------------------------------------------

export async function addProcessorAction(
  name: string,
  dpaId: string,
  contactChannel: string,
  dpaStatus: "draft" | "active",
  subProcessors: string[],
): Promise<ActionResult> {
  const { actor } = await getSession();

  if (!name.trim() || !dpaId.trim()) {
    return {
      ok: false,
      error: "A processor needs a name and a DPA reference.",
      errorKind: "ValidationError",
    };
  }

  const inspection = inspectDpaReference(dpaId);

  return run(() =>
    audited(
      {
        actor,
        action: "onboarding.processor_registered",
        targetType: "DataProcessor",
        targetId: dpaId,
        payload: {
          name,
          dpaId,
          dpaStatus,
          contactChannel,
          subProcessors,
          dpaReferenceLooksConventional: inspection.looksConventional,
        },
      },
      (tx: TxClient) =>
        tx.dataProcessor.upsert({
          where: { dpaId },
          create: {
            name,
            dpaId,
            contactChannel,
            dpaStatus,
            dpaScopeJson: encodeList([]),
            subProcessorsJson: encodeList(subProcessors),
          },
          update: {
            name,
            contactChannel,
            dpaStatus,
            subProcessorsJson: encodeList(subProcessors),
          },
        }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Screen 6 — notification routing
// ---------------------------------------------------------------------------

export async function saveRoutingAction(
  routes: { eventType: string; recipientRole: string; channel: string }[],
): Promise<ActionResult> {
  const { actor } = await getSession();

  const known = ROUTABLE_EVENTS.map((e) => e.eventType);
  // A custom event with no recipient would sit silently unrouted, so it has to
  // be assigned explicitly rather than defaulted to somebody.
  const unassigned = findUnroutedCustomEvents(routes, known);
  if (unassigned.length > 0) {
    return {
      ok: false,
      error:
        `Assign a recipient for ${unassigned.join(", ")}. A custom event has ` +
        `no sensible default, and leaving it unrouted means nobody is told ` +
        `when it fires.`,
      errorKind: "ValidationError",
    };
  }
  const knownSet = new Set<string>(known);

  return run(async () => {
    for (const route of routes) {
      await audited(
        {
          actor,
          action: "onboarding.notification_route_set",
          targetType: "NotificationRoute",
          targetId: route.eventType,
          payload: route,
        },
        (tx: TxClient) =>
          tx.notificationRoute.upsert({
            where: { eventType: route.eventType },
            create: {
              eventType: route.eventType,
              recipientRole: route.recipientRole,
              channel: route.channel,
              isCustom: !knownSet.has(route.eventType),
              configuredAt: new Date(),
            },
            update: {
              recipientRole: route.recipientRole,
              channel: route.channel,
              configuredAt: new Date(),
            },
          }),
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Screen 7
// ---------------------------------------------------------------------------

export async function finishOnboardingAction(): Promise<ActionResult> {
  const { actor } = await getSession();
  return run(() => completeOnboarding(actor));
}
