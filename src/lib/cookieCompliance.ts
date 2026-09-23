/**
 * Scenario 9 (cookie compliance) shared, pure, client-safe logic. The geo and
 * language "detection" here is the REAL deterministic logic the simulators call —
 * not a mocked approximation — so a passing simulation reflects what a live
 * visitor would actually get.
 */
import type { PillTone } from "@/components/ui";

// ---- Scan cadence ---------------------------------------------------------

export const SCAN_CADENCE_LABEL: Record<string, string> = { on_demand: "On-demand (manual)", monthly: "Recurring — monthly" };

export function computeNextRun(cadence: string, from: Date = new Date()): Date | null {
  if (cadence !== "monthly") return null;
  const d = new Date(from);
  d.setMonth(d.getMonth() + 1);
  return d;
}

// ---- Geo → compliance-model detection -------------------------------------

export type ComplianceModel = "dpdp" | "gdpr" | "none";

/** EU/EEA member ISO-3166 alpha-2 codes — GDPR applies. */
const EU_EEA = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES",
  "SE", "IS", "LI", "NO",
]);

export interface GeoLocation { code: string; name: string }

/** A representative set of locations for the simulator. */
export const SIMULATOR_LOCATIONS: GeoLocation[] = [
  { code: "IN", name: "India" },
  { code: "DE", name: "Germany (EU)" },
  { code: "FR", name: "France (EU)" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "BR", name: "Brazil" },
  { code: "ZZ", name: "Unknown / unmapped" },
];

/** The REAL mapping. India → DPDP, EU/EEA → GDPR, everything else → no specific
 *  model (a conservative baseline banner). */
export function detectComplianceModel(countryCode: string): ComplianceModel {
  const cc = (countryCode || "").toUpperCase();
  if (cc === "IN") return "dpdp";
  if (EU_EEA.has(cc)) return "gdpr";
  return "none";
}

export interface BannerModel { model: ComplianceModel; label: string; tone: PillTone; heading: string; body: string; buttons: string[]; note: string }

export const BANNER_BY_MODEL: Record<ComplianceModel, BannerModel> = {
  dpdp: {
    model: "dpdp", label: "DPDP (India)", tone: "green",
    heading: "Your consent, your control",
    body: "We process your personal data under the Digital Personal Data Protection Act, 2023. Choose which cookies you allow. You can withdraw consent anytime.",
    buttons: ["Accept all", "Reject non-essential", "Manage preferences"],
    note: "Granular opt-in, withdrawal, and a notice in your language are required.",
  },
  gdpr: {
    model: "gdpr", label: "GDPR (EU/EEA)", tone: "blue",
    heading: "We value your privacy",
    body: "Under the GDPR we ask for your explicit consent before setting non-essential cookies. Nothing non-essential runs until you agree.",
    buttons: ["Accept all", "Reject all", "Manage preferences"],
    note: "Explicit opt-in, equal-prominence reject, no pre-ticked boxes.",
  },
  none: {
    model: "none", label: "Baseline (unmapped)", tone: "gray",
    heading: "Cookie notice",
    body: "We use cookies to run this site. For your protection we apply our strictest consent baseline where no specific regional model is detected.",
    buttons: ["Accept all", "Reject non-essential", "Manage preferences"],
    note: "Fallback: apply the strictest baseline rather than assume no rules apply.",
  },
};

// ---- Language → managed-variant detection ---------------------------------

/** Resolve a visitor's requested language to a managed variant, or the defined
 *  fallback (English base) when unavailable. */
export function resolveBannerLanguage(requested: string, available: string[]): { language: string; fallback: boolean; requested: string } {
  if (available.includes(requested)) return { language: requested, fallback: false, requested };
  return { language: "English", fallback: true, requested };
}
