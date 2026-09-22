/**
 * Scenario 7 (assisted / omnichannel intake + capture + delivery) shared
 * constants — pure and client-safe (no server imports), so client components and
 * server code share ONE definition of the channel/method/status vocabularies.
 */
import type { PillTone } from "@/components/ui";

// ---- Assisted intake channels --------------------------------------------

export const CHANNEL_ORIGIN_LABEL: Record<string, string> = {
  digital: "Digital",
  assisted_branch: "Assisted — branch",
  assisted_phone: "Assisted — phone",
};
export const CHANNEL_ORIGIN_TONE: Record<string, PillTone> = {
  digital: "gray",
  assisted_branch: "blue",
  assisted_phone: "purple",
};

export const NOTIFICATION_CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  call: "Phone call",
  branch_handoff: "Branch hand-off (in person)",
  in_app: "In-app",
};

// ---- Identity verification -----------------------------------------------

export const ID_METHOD_LABEL: Record<string, string> = {
  otp: "OTP to registered contact",
  in_person_document: "In-person document check",
  assisted_attestation: "Employee attestation",
};

/** Which extra field a method makes mandatory. Used by both the form and the
 *  server validation so they cannot drift. */
export function idMethodRequirement(method: string): "document_type" | "attesting_employee_id" | null {
  if (method === "in_person_document") return "document_type";
  if (method === "assisted_attestation") return "attesting_employee_id";
  return null;
}

// ---- Consent capture channels --------------------------------------------

export const CAPTURE_CHANNEL_LABEL: Record<string, string> = {
  digital: "Digital",
  assisted_branch: "Branch",
  assisted_bc_point: "BC point",
};

// ---- Offline queue sync status -------------------------------------------

export const SYNC_STATUS_LABEL: Record<string, string> = {
  queued: "Queued", syncing: "Syncing", synced: "Synced", failed: "Failed",
};
export const SYNC_STATUS_TONE: Record<string, PillTone> = {
  queued: "yellow", syncing: "blue", synced: "green", failed: "red",
};

// ---- Notification delivery -----------------------------------------------

export const DELIVERY_STATUS_LABEL: Record<string, string> = {
  sent: "Sent", delivered: "Delivered", failed: "Failed", manual_pending: "Manual delivery pending",
};
export const DELIVERY_STATUS_TONE: Record<string, PillTone> = {
  sent: "blue", delivered: "green", failed: "red", manual_pending: "yellow",
};

/** How a preferred channel resolves on dispatch. branch_handoff is NEVER an
 *  automation target — it is flagged for manual in-person delivery. */
export function initialDeliveryStatus(channel: string): "sent" | "delivered" | "manual_pending" {
  if (channel === "branch_handoff") return "manual_pending";
  if (channel === "call") return "sent"; // a call is logged as placed, not auto-"delivered"
  return "delivered"; // email / sms / in_app
}
