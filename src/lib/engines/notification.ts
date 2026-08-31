import { db } from "@/lib/db";
import type { TxClient } from "@/lib/tx";
import type { ActorRole, NotificationSeverity } from "@/lib/domain";

/**
 * NOTIFICATION ENGINE (acceptance criterion 3)
 *
 * Cross-persona notification is a CONSEQUENCE of a state change, not a separate
 * step someone has to remember. Engines emit an event; this module decides who
 * was waiting on it and writes their notifications.
 *
 * There is deliberately no "notify" button anywhere in the Admin UI, and no
 * screen calls this module directly — if a screen could choose whether to
 * notify, the notification would be optional, which is the failure this
 * criterion exists to prevent.
 */

export type NotificationEvent =
  | {
      kind: "execution.failed";
      requestId: string;
      requestRef: string;
      systemName: string;
      failureCode: string;
    }
  | {
      kind: "execution.verified";
      requestId: string;
      requestRef: string;
      systemName: string;
    }
  | {
      kind: "completion.changed";
      requestId: string;
      requestRef: string;
      from: string;
      to: string;
    }
  | {
      kind: "escalation.raised";
      requestId: string | null;
      requestRef: string;
      reason: string;
      targetRole: ActorRole;
    }
  | {
      kind: "escalation.ruled";
      requestId: string | null;
      requestRef: string;
      ruling: string;
    }
  | {
      kind: "sla.threshold";
      requestId: string;
      requestRef: string;
      band: "due_soon" | "breached";
      hoursRemaining: number;
    }
  | {
      kind: "processor.confirmed";
      requestId: string;
      requestRef: string;
      processorName: string;
    }
  | {
      kind: "retention.blocked";
      requestId: string;
      requestRef: string;
      exceptionCount: number;
    }
  // --- Scenario 2: access lifecycle -----------------------------------------
  | {
      kind: "access.revocation_failed";
      userName: string;
      systemName: string;
      failureCode: string;
    }
  | {
      kind: "access.revocation_state_changed";
      userName: string;
      from: string;
      to: string;
      sessionsStillLive: number;
    }
  // --- Discovery & classification -------------------------------------------
  | {
      kind: "discovery.scan_failed";
      sourceName: string;
      stage: string;
      partial: boolean;
    }
  | {
      kind: "discovery.merge_incomplete";
      fieldPath: string;
      remaining: number;
    };

interface Fanout {
  roles: ActorRole[];
  title: string;
  body: string;
  severity: NotificationSeverity;
}

/**
 * Who is waiting on each event, and what they need to be told.
 *
 * The Grievance Officer appears on failure and completion events because a
 * grievance-sourced request is their case: they are answerable to the Data
 * Principal for it and cannot be left to poll Admin for status.
 */
function fanout(event: NotificationEvent): Fanout {
  switch (event.kind) {
    case "execution.failed":
      return {
        roles: ["grievance_officer", "dpo"],
        title: `Execution failed on ${event.systemName}`,
        body: `${event.requestRef}: ${event.systemName} returned ${event.failureCode}. Admin is investigating; this request cannot be reported complete.`,
        severity: "critical",
      };

    case "execution.verified":
      return {
        roles: ["grievance_officer"],
        title: `${event.systemName} confirmed`,
        body: `${event.requestRef}: ${event.systemName} has confirmed execution.`,
        severity: "info",
      };

    case "completion.changed":
      return {
        roles: ["grievance_officer", "dpo"],
        title: `${event.requestRef} is now ${event.to}`,
        body: `Completion moved from ${event.from} to ${event.to}.`,
        severity: event.to === "Fully verified" ? "info" : "warning",
      };

    case "escalation.raised":
      return {
        roles: [event.targetRole],
        title: `Escalation awaiting your ruling — ${event.requestRef}`,
        body: event.reason,
        severity: "warning",
      };

    case "escalation.ruled":
      return {
        roles: ["admin", "grievance_officer"],
        title: `Ruling recorded — ${event.requestRef}`,
        body: `The DPO ruled: ${event.ruling}. Execution may now proceed on that basis.`,
        severity: "info",
      };

    case "sla.threshold":
      return {
        roles: ["admin", "grievance_officer", "dpo"],
        title:
          event.band === "breached"
            ? `Deadline passed — ${event.requestRef}`
            : `Deadline approaching — ${event.requestRef}`,
        body:
          event.band === "breached"
            ? `The fulfilment deadline for ${event.requestRef} has passed.`
            : `${Math.max(0, Math.round(event.hoursRemaining))}h remain on ${event.requestRef}.`,
        severity: event.band === "breached" ? "critical" : "warning",
      };

    case "processor.confirmed":
      return {
        roles: ["dpo"],
        title: `Processor confirmed — ${event.processorName}`,
        body: `${event.requestRef}: ${event.processorName} confirmed it carried out the instruction.`,
        severity: "info",
      };

    case "retention.blocked":
      return {
        roles: ["dpo"],
        title: `Retention conflict on ${event.requestRef}`,
        body: `${event.exceptionCount} legal-retention obligation(s) must be resolved before this erasure can be executed.`,
        severity: "warning",
      };

    // The CISO owns security safeguards, so a revocation that did not take is
    // theirs to know about — not something Admin decides whether to mention.
    case "access.revocation_failed":
      return {
        roles: ["ciso", "dpo"],
        title: `Access revocation failed — ${event.systemName}`,
        body: `${event.userName} may still have access to ${event.systemName}: the revocation returned ${event.failureCode}. Their access cannot be reported as removed.`,
        severity: "critical",
      };

    case "discovery.scan_failed":
      return {
        roles: ["dpo"],
        title: `Scan ${event.partial ? "incomplete" : "failed"} — ${event.sourceName}`,
        body: event.partial
          ? `${event.sourceName} was only partly read (stopped at ${event.stage}), so the data map for it is incomplete.`
          : `${event.sourceName} could not be scanned (failed at ${event.stage}). Requests scoped against it will have incomplete coverage.`,
        severity: event.partial ? "warning" : "critical",
      };

    case "discovery.merge_incomplete":
      return {
        roles: ["dpo"],
        title: "Merge not fully propagated",
        body: `${event.fieldPath} was merged, but ${event.remaining} system(s) have not confirmed. Until they do, references there still point at both records.`,
        severity: "warning",
      };

    case "access.revocation_state_changed":
      return {
        roles: ["ciso"],
        title: `Deprovisioning of ${event.userName} is now ${event.to}`,
        body:
          event.sessionsStillLive > 0
            ? `Moved from ${event.from} to ${event.to}, but ${event.sessionsStillLive} session or token is still live — access is not yet fully removed.`
            : `Moved from ${event.from} to ${event.to}.`,
        severity: event.sessionsStillLive > 0 ? "warning" : "info",
      };
  }
}

/**
 * Emit inside the caller's transaction, so a notification is never sent for a
 * state change that then rolls back.
 */
export async function emit(
  tx: TxClient,
  event: NotificationEvent,
): Promise<void> {
  const { roles, title, body, severity } = fanout(event);

  await tx.notification.createMany({
    data: roles.map((role) => ({
      targetRole: role,
      triggerEvent: event.kind,
      title,
      body,
      requestId: "requestId" in event ? event.requestId : null,
      severity,
    })),
  });
}

export async function listNotifications(role: ActorRole, take = 30) {
  return db.notification.findMany({
    where: { targetRole: role },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function countUnread(role: ActorRole) {
  return db.notification.count({ where: { targetRole: role, readAt: null } });
}
