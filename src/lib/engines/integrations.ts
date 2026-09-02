import { db } from "@/lib/db";
import type { TxClient } from "@/lib/tx";
import { audited, type AuditActor } from "@/lib/engines/audit";
import { emit } from "@/lib/engines/notification";

/**
 * INTEGRATIONS ENGINE (Section: Integrations)
 *
 * Health of execution-target systems and Data Processors, plus the DPA
 * lifecycle that gates whether a processor may be instructed at all.
 *
 * Two rules are load-bearing here and enforced elsewhere, not just shown:
 *   - A processor with a draft DPA is a HARD BLOCK on dispatch (guards/
 *     processorGate.ts, at the Request-execution point). This engine only ever
 *     moves a DPA from draft to active once a reference exists — it never
 *     dispatches.
 *   - Escalate is not the reflexive first move. It becomes available only after
 *     a retry threshold has passed (see HEALTH_ESCALATE_THRESHOLD_HOURS), so a
 *     transient blip does not get escalated on its first failed check.
 */

/** Hours a processor must stay unreachable before Escalate is offered. */
export const HEALTH_ESCALATE_THRESHOLD_HOURS = 48;

type HealthEntry = { ok: boolean; detail: string | null; at: string };

function decodeHistory(json: string): HealthEntry[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as HealthEntry[]) : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Health checks
// ---------------------------------------------------------------------------

/**
 * Retry a health check now. In this prototype the retry succeeds (modelling the
 * underlying cause being cleared), which flips the target back to healthy and
 * records the successful check in the history — the point being that the
 * history is a pattern, not a single current flag.
 */
export async function retryHealthCheck(
  targetKind: "system" | "processor",
  id: string,
  actor: AuditActor,
) {
  const now = new Date();
  const entry: HealthEntry = { ok: true, detail: null, at: now.toISOString() };

  if (targetKind === "system") {
    const system = await db.connectedSystem.findUniqueOrThrow({ where: { id } });
    const history = [entry, ...decodeHistory(system.healthHistoryJson)].slice(0, 30);
    return audited(
      {
        actor,
        action: "integration.health_checked",
        targetType: "ConnectedSystem",
        targetId: id,
        payload: { system: system.name, result: "ok" },
      },
      (tx: TxClient) =>
        tx.connectedSystem.update({
          where: { id },
          data: {
            connectionStatus: "healthy",
            lastVerifiedAt: now,
            healthHistoryJson: JSON.stringify(history),
          },
        }),
    );
  }

  const processor = await db.dataProcessor.findUniqueOrThrow({ where: { id } });
  const history = [entry, ...decodeHistory(processor.healthHistoryJson)].slice(0, 30);
  return audited(
    {
      actor,
      action: "integration.health_checked",
      targetType: "DataProcessor",
      targetId: id,
      payload: { processor: processor.name, result: "ok" },
    },
    (tx: TxClient) =>
      tx.dataProcessor.update({
        where: { id },
        data: {
          healthStatus: "responsive",
          lastCheckedAt: now,
          unreachableSinceAt: null,
          healthHistoryJson: JSON.stringify(history),
        },
      }),
  );
}

/**
 * Escalate a persistent health issue. Routed to whoever owns the relationship —
 * Legal for a processor, CISO for an internal system.
 */
export async function escalateHealthIssue(
  targetKind: "system" | "processor",
  id: string,
  reason: string,
  actor: AuditActor,
) {
  const targetRole = targetKind === "processor" ? "legal" : "ciso";
  const name =
    targetKind === "system"
      ? (await db.connectedSystem.findUniqueOrThrow({ where: { id } })).name
      : (await db.dataProcessor.findUniqueOrThrow({ where: { id } })).name;

  const context = { targetKind, id, name, raisedBy: actor.label, reason };

  const escalation = await audited(
    {
      actor,
      action: "integration.health_escalated",
      targetType: targetKind === "system" ? "ConnectedSystem" : "DataProcessor",
      targetId: id,
      payload: context,
    },
    (tx: TxClient) =>
      tx.escalation.create({
        data: {
          sourceRole: actor.role,
          targetRole,
          reason: reason || `${name} has been unreachable past the retry threshold.`,
          contextJson: JSON.stringify(context),
          status: "open",
        },
      }),
  );

  await emit(db, {
    kind: "escalation.raised",
    requestId: null,
    requestRef: `Health — ${name}`,
    reason: reason || "Persistent connectivity issue",
    targetRole,
  });

  return escalation;
}

// ---------------------------------------------------------------------------
// DPA lifecycle
// ---------------------------------------------------------------------------

export class DpaReferenceRequiredError extends Error {
  constructor() {
    super("A DPA reference is required to activate the contract.");
    this.name = "DpaReferenceRequiredError";
  }
}

/**
 * Add the DPA reference to a draft processor and activate it. This is the one
 * path that lifts the s.8(2) dispatch block — and it lifts it by recording the
 * contract, not by overriding the gate.
 */
export async function addDpaReference(processorId: string, dpaId: string, actor: AuditActor) {
  if (!dpaId.trim()) throw new DpaReferenceRequiredError();
  const processor = await db.dataProcessor.findUniqueOrThrow({ where: { id: processorId } });

  return audited(
    {
      actor,
      action: "integration.dpa_activated",
      targetType: "DataProcessor",
      targetId: processorId,
      payload: { processor: processor.name, dpaId: dpaId.trim(), previousStatus: processor.dpaStatus },
    },
    (tx: TxClient) =>
      tx.dataProcessor.update({
        where: { id: processorId },
        data: { dpaId: dpaId.trim(), dpaStatus: "active", contractDate: new Date() },
      }),
  );
}

/**
 * A live DPA reference is a contractual fact, not something Admin overwrites at
 * the console. Changing it is a request to Legal, raised as an Escalation.
 */
export async function requestDpaUpdate(processorId: string, reason: string, actor: AuditActor) {
  const processor = await db.dataProcessor.findUniqueOrThrow({ where: { id: processorId } });
  const context = { processorId, processor: processor.name, currentDpaId: processor.dpaId, reason, raisedBy: actor.label };

  const escalation = await audited(
    {
      actor,
      action: "integration.dpa_update_requested",
      targetType: "DataProcessor",
      targetId: processorId,
      payload: context,
    },
    (tx: TxClient) =>
      tx.escalation.create({
        data: {
          sourceRole: actor.role,
          targetRole: "legal",
          type: "dpa_update",
          reason: reason || `Requesting a DPA update for ${processor.name}.`,
          contextJson: JSON.stringify(context),
          status: "open",
        },
      }),
  );

  await emit(db, {
    kind: "escalation.raised",
    requestId: null,
    requestRef: `DPA update — ${processor.name}`,
    reason: reason || "DPA update requested",
    targetRole: "legal",
  });

  return escalation;
}

// ---------------------------------------------------------------------------
// Purpose role flags — the one registry, two purposes
// ---------------------------------------------------------------------------

/**
 * Edit which purposes a system serves. This writes to the SAME source record
 * Data Discovery uses — there is no second registry to keep in sync.
 */
export async function setSystemRoles(
  sourceId: string,
  scanTarget: boolean,
  executionTarget: boolean,
  actor: AuditActor,
) {
  const source = await db.discoverySource.findUniqueOrThrow({ where: { id: sourceId } });
  return audited(
    {
      actor,
      action: "integration.system_roles_updated",
      targetType: "DiscoverySource",
      targetId: sourceId,
      payload: { system: source.name, scanTarget, executionTarget },
    },
    (tx: TxClient) =>
      tx.discoverySource.update({
        where: { id: sourceId },
        data: { availableAsScanTarget: scanTarget, availableAsExecutionTarget: executionTarget },
      }),
  );
}
