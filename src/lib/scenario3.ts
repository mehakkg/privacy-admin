/**
 * Scenario 3 shared constants — pure, no server imports, so client components can
 * use them without pulling the engine (and node:crypto) into the browser bundle.
 */

export const EVIDENCE_STATUS = ["received", "searching", "verifying", "exported", "delivered"] as const;
export const EVIDENCE_STATUS_LABEL: Record<string, string> = {
  received: "Received", searching: "Searching", verifying: "Verifying", exported: "Exported", delivered: "Delivered",
};
export const EVIDENCE_STATUS_TONE: Record<string, "gray" | "blue" | "yellow" | "green"> = {
  received: "gray", searching: "blue", verifying: "yellow", exported: "blue", delivered: "green",
};

export const DELETION_STATUS = ["queued", "conflict_detected", "escalated", "executed"] as const;
export const DELETION_STATUS_LABEL: Record<string, string> = {
  queued: "Queued", conflict_detected: "Conflict detected", escalated: "Escalated", executed: "Executed",
};
export const DELETION_STATUS_TONE: Record<string, "gray" | "red" | "yellow" | "green"> = {
  queued: "gray", conflict_detected: "red", escalated: "yellow", executed: "green",
};

export const RULING_DECISIONS = ["proceed", "deny", "modify"] as const;
export const RULING_DECISION_LABEL: Record<string, string> = {
  proceed: "Proceed", deny: "Deny", modify: "Modify",
};

export const EXPORT_FORMATS = ["pdf", "csv", "json"] as const;

/** The execution action is labelled FROM the ruling — never a generic "Execute". */
export function executionLabel(decision: string, ruledAtLabel: string): string {
  const verb = decision === "proceed" ? "Proceed with deletion" : decision === "deny" ? "Deny the deletion and retain" : "Apply the modified deletion";
  return `${verb} per DPO ruling of ${ruledAtLabel}`;
}

// ---- Scenario 1: cross-system deletion fulfilment -------------------------
export const SYS_STATUS = ["pending", "confirmed", "manual_required", "failed"] as const;
export const SYS_STATUS_LABEL: Record<string, string> = {
  pending: "Pending", confirmed: "Confirmed", manual_required: "Manual required", failed: "Failed",
};
export const SYS_STATUS_TONE: Record<string, "gray" | "green" | "yellow" | "red"> = {
  pending: "gray", confirmed: "green", manual_required: "yellow", failed: "red",
};
