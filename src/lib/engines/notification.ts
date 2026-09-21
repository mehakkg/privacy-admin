import { db } from "@/lib/db";
import type { TxClient } from "@/lib/tx";
import type { ActorRole, NotificationSeverity } from "@/lib/domain";
import { isMutable } from "@/lib/notifications";

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
    }
  // --- Integration / discovery-push sync failure (first-class category) ------
  | {
      kind: "integration.sync_failed";
      sourceName: string;
      sourceId: string;
      /** Consecutive failures including this one. 2+ escalates to critical. */
      consecutive: number;
      status: string; // TIMED_OUT | FAILED | …
    }
  // --- Breach: the 72-hour Board-notification clock (breach_clock category) ---
  | {
      kind: "breach.detected";
      incidentId: string;
      reference: string;
      severity: string;
    }
  // --- DPRR: automatic Board escalation of a rights request (system-set) ------
  | {
      kind: "dprr.board_escalated";
      ticketId: string;
      requestRef: string;
      reason: string;
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

    case "breach.detected":
      return {
        roles: ["ciso", "dpo"],
        title: `Breach ${event.reference} — 72-hour clock started`,
        body: `A ${event.severity} breach was recorded. The Board must be notified within 72 hours (DPDP s.8(6)). Compile the notification package.`,
        severity: "critical",
      };

    case "dprr.board_escalated":
      return {
        roles: ["dpo", "grievance_officer"],
        title: `Escalated to the Board — ${event.requestRef}`,
        body: event.reason,
        severity: "critical",
      };

    case "integration.sync_failed":
      return {
        roles: ["admin"],
        title: event.consecutive >= 2 ? `Repeat sync failure — ${event.sourceName}` : `Sync failed — ${event.sourceName}`,
        body: event.consecutive >= 2
          ? `${event.sourceName} has now failed ${event.consecutive} consecutive syncs (${event.status}). This needs attention — data from it is going stale.`
          : `${event.sourceName} sync returned ${event.status}. It will retry on the next cycle; a second consecutive failure will escalate.`,
        severity: event.consecutive >= 2 ? "critical" : "warning",
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

/** The first-class category for an event kind (drives the bell + Settings config). */
function categoryFor(kind: string): string {
  if (kind === "integration.sync_failed" || kind === "discovery.scan_failed") return "integration_sync_failure";
  if (kind.startsWith("escalation")) return "dpo_approval_needed";
  if (kind === "sla.threshold" || kind.startsWith("completion") || kind === "execution.verified" || kind === "execution.failed" || kind.startsWith("dprr")) return "dsr_sla_deadline";
  if (kind.startsWith("breach")) return "breach_clock";
  if (kind.startsWith("drift")) return "drift_detected";
  if (kind === "retention.blocked" || kind.startsWith("policy")) return "policy_violation";
  return "general_activity";
}

/** Deep link to the source record for an event, or null. */
function hrefFor(event: NotificationEvent): string | null {
  switch (event.kind) {
    case "integration.sync_failed": return `/discovery/sources/${event.sourceId}`;
    case "discovery.scan_failed": return "/discovery/sources";
    case "breach.detected": return `/breach/incidents/${event.incidentId}`;
    case "dprr.board_escalated": return `/requests/sla/${event.ticketId}`;
    case "escalation.raised":
    case "escalation.ruled": return "/access/approval-queue";
    case "sla.threshold":
    case "execution.failed":
    case "execution.verified":
    case "completion.changed":
      return "requestId" in event && event.requestId ? `/requests/${event.requestId}` : "/requests";
    default: return null;
  }
}

/**
 * Emit inside the caller's transaction, so a notification is never sent for a
 * state change that then rolls back. Honours each recipient role's mute
 * preference — except NEVER-mutable categories, which reach the role regardless
 * (a role-targeted statutory/governance alert can't be silenced by one person).
 */
export async function emit(
  tx: TxClient,
  event: NotificationEvent,
): Promise<void> {
  const { roles, title, body, severity } = fanout(event);
  const category = categoryFor(event.kind);
  const linkedHref = hrefFor(event);
  const requestId = "requestId" in event ? event.requestId : null;

  const prefs = await tx.notificationPreference.findMany({ where: { role: { in: roles }, category } });
  const mutedRoles = new Set(prefs.filter((p) => p.muted && isMutable(category)).map((p) => p.role));

  const targets = roles.filter((role) => !mutedRoles.has(role));
  if (targets.length === 0) return;

  await tx.notification.createMany({
    data: targets.map((role) => ({
      targetRole: role, triggerEvent: event.kind, category, title, body, requestId, linkedHref, severity,
    })),
  });
}

/**
 * Integration-sync failure → a first-class notification. Computes the consecutive
 * failure count from the source's recent scan-run history so a 2nd consecutive
 * TIMED_OUT / FAILED escalates to critical. System-generated on sync completion —
 * Admin never has to check the Integrations screen to learn a sync broke.
 */
export async function emitIntegrationSyncFailure(
  tx: TxClient,
  input: { sourceId: string; sourceName: string; status: string },
): Promise<void> {
  const recent = await tx.scanRun.findMany({
    where: { sourceId: input.sourceId },
    orderBy: { startedAt: "desc" },
    take: 10,
    select: { status: true },
  });
  let consecutive = 1; // this failure
  for (const r of recent) {
    if (r.status === "failed" || r.status === "partial") consecutive += 1;
    else break;
  }
  await emit(tx, { kind: "integration.sync_failed", sourceId: input.sourceId, sourceName: input.sourceName, consecutive, status: input.status });
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
