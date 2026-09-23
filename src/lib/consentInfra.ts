/**
 * Scenario 8 (consent-infrastructure completeness) shared constants + pure
 * helpers. Client-safe (no server imports). One definition of provenance,
 * expiry, delivery and retention vocabulary shared by client and server.
 */
import type { PillTone } from "@/components/ui";

// ---- Legacy-import provenance --------------------------------------------

export const PROVENANCE_LABEL: Record<string, string> = {
  realtime_capture: "Real-time capture",
  verified_capture_date: "Verified legacy date",
  unverifiable_date: "Unverifiable date",
};
export const PROVENANCE_TONE: Record<string, PillTone> = {
  realtime_capture: "green",
  verified_capture_date: "blue",
  unverifiable_date: "yellow",
};

// ---- Auto-expiry behaviour -----------------------------------------------

export const EXPIRY_BEHAVIOR_LABEL: Record<string, string> = {
  auto_withdraw: "Auto-withdraw at expiry",
  trigger_reconsent: "Trigger re-consent at expiry",
};
export const EXPIRY_ACTION_LABEL: Record<string, string> = {
  auto_withdraw: "Auto-withdrawn",
  reconsent_triggered: "Re-consent triggered",
  reconsent_policy_change: "Re-consent (policy change)",
};

// ---- Webhook delivery ----------------------------------------------------

export const WEBHOOK_DELIVERY_LABEL: Record<string, string> = {
  delivered: "Delivered", failed: "Failed", retrying: "Retrying",
};
export const WEBHOOK_DELIVERY_TONE: Record<string, PillTone> = {
  delivered: "green", failed: "red", retrying: "yellow",
};

// ---- Branding target surfaces --------------------------------------------

export const BRANDING_SURFACES = [
  { key: "notices", label: "Notices" },
  { key: "preference_center", label: "Preference Center" },
] as const;

/** Parse a free-text retention string ("365 days", "12 months", "until deletion")
 *  into a day count, or null when there is no fixed period. */
export function retentionToDays(retention: string | null | undefined): number | null {
  if (!retention) return null;
  const s = retention.trim().toLowerCase();
  if (s.includes("until deletion") || s.includes("no expiry") || s.includes("indefinite")) return null;
  const m = s.match(/(\d+)\s*(day|days|month|months|year|years)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (m[2].startsWith("month")) return n * 30;
  if (m[2].startsWith("year")) return n * 365;
  return n;
}

/** The shape the Consent API returns for one artifact. Pure so the API route and
 *  the retrievability spot-check display EXACTLY the same payload. */
export interface ConsentApiPayload {
  artifact_id: string;
  subject_ref: string;
  purpose: string | null;
  purpose_scope: string | null;
  status: string;
  granted_at: string;
  expires_at: string | null;
  channel: string;
  artifact_hash: string | null;
}
export function buildConsentApiPayload(r: {
  id: string; subjectRef: string; purposeName: string | null; purposeScope: string | null;
  status: string; collectedAt: Date; expiresAt: Date | null; captureChannel: string | null;
  channelOrigin: string; artifactHash: string | null;
}): ConsentApiPayload {
  return {
    artifact_id: r.id,
    subject_ref: r.subjectRef,
    purpose: r.purposeName,
    purpose_scope: r.purposeScope,
    status: r.status,
    granted_at: r.collectedAt.toISOString(),
    expires_at: r.expiresAt ? r.expiresAt.toISOString() : null,
    channel: r.captureChannel ?? r.channelOrigin,
    artifact_hash: r.artifactHash,
  };
}

/** The fields the API MUST return granularly for a check to pass. */
export function apiPayloadGaps(p: ConsentApiPayload): string[] {
  const gaps: string[] = [];
  if (!p.purpose) gaps.push("purpose (not linked to an approved purpose)");
  if (!p.purpose_scope) gaps.push("purpose_scope (lawful basis missing)");
  if (!p.granted_at) gaps.push("granted_at timestamp");
  if (!p.artifact_hash) gaps.push("artifact_hash");
  return gaps;
}
