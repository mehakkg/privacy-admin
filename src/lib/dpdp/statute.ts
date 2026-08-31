/**
 * Statutory constants for India's Digital Personal Data Protection Act, 2023
 * and the DPDP Rules, 2025.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Every legal deadline in the product resolves here. No component contains a
 * bare number of hours or days. Two consequences:
 *
 *  1. Correcting a rule is a one-file edit rather than a hunt through screens.
 *  2. Each constant carries `source` and `citation`. `source` distinguishes a
 *     STATUTORY obligation from an ORGANISATIONAL policy choice, and the UI
 *     renders that distinction — so a countdown driven by internal policy is
 *     never displayed as though the Act mandated it.
 *
 * VERIFICATION NOTE: these encode a careful reading of the Act and Rules, but
 * they have not been reviewed by counsel. They must be checked against the
 * gazetted text before this is relied on for live compliance.
 */

export type ConstantSource = "statute" | "org_policy";

export interface LegalConstant {
  readonly key: string;
  readonly label: string;
  readonly source: ConstantSource;
  readonly citation: string;
  readonly note: string;
}

export interface DurationConstant extends LegalConstant {
  readonly hours: number;
}

/**
 * DPDP Rules, 2025 — Rule 8. Before erasing personal data of a Data Principal
 * who has not approached the Data Fiduciary for the specified purpose (nor
 * exercised her rights) for the prescribed period, the Data Fiduciary must give
 * the Data Principal notice at least forty-eight hours in advance.
 *
 * This is a gate on erasure, distinct from the fulfilment deadline below.
 */
export const ERASURE_PRE_NOTICE: DurationConstant = {
  key: "erasure_pre_notice",
  label: "Pre-erasure notice",
  hours: 48,
  source: "statute",
  citation: "DPDP Rules, 2025 — Rule 8",
  note: "Notice to the Data Principal at least 48 hours before erasure.",
};

/**
 * DPDP Rules, 2025 — Rule 7. On becoming aware of a personal data breach, the
 * Data Fiduciary must intimate the Data Protection Board without delay, and
 * furnish a detailed report within seventy-two hours (extendable on request).
 *
 * Used by the SLA engine's severity banding; breach workflows themselves are
 * DPO-owned and out of scope for the Admin module.
 */
export const BREACH_BOARD_DETAILED_REPORT: DurationConstant = {
  key: "breach_board_detailed_report",
  label: "Breach detailed report to the Board",
  hours: 72,
  source: "statute",
  citation: "DPDP Rules, 2025 — Rule 7",
  note: "Intimation without delay; detailed report within 72 hours.",
};

/**
 * DPDP Rules, 2025 — Rule 14. The Data Fiduciary must publish the period within
 * which it will respond to a grievance, and that period may not exceed ninety
 * days.
 *
 * IMPORTANT: 90 days is a CEILING, not a target. It is the hard backstop the
 * SLA engine treats as a breach of law; the working deadline is the (shorter)
 * organisational period below.
 */
export const GRIEVANCE_REDRESSAL_CEILING: DurationConstant = {
  key: "grievance_redressal_ceiling",
  label: "Grievance redressal ceiling",
  hours: 90 * 24,
  source: "statute",
  citation: "DPDP Rules, 2025 — Rule 14",
  note: "Statutory maximum. Exceeding this is a breach of law, not a missed target.",
};

/**
 * The Act does not fix a single number of days for fulfilling a Data Principal
 * Rights Request; the Data Fiduciary publishes its own period, bounded by the
 * grievance ceiling. This is therefore ORGANISATIONAL POLICY, and is labelled
 * as such wherever a countdown derived from it is displayed.
 */
export const DPRR_FULFILMENT_PERIOD: DurationConstant = {
  key: "dprr_fulfilment_period",
  label: "Request fulfilment period",
  hours: 30 * 24,
  source: "org_policy",
  citation: "Organisational policy, bounded by DPDP Rules, 2025 — Rule 14",
  note: "Published response period. Not a statutory figure; must not exceed 90 days.",
};

/**
 * DPDP Act, 2023 — s.8(7) and its proviso. Personal data must be erased on
 * withdrawal of consent or when the specified purpose is no longer served,
 * UNLESS retention is necessary for compliance with any law in force.
 *
 * This proviso is the entire legal basis for the Retention Exception Panel:
 * a statutory retention obligation overrides an erasure request for the fields
 * it covers, and only for those fields.
 */
export const RETENTION_OVERRIDE_BASIS: LegalConstant = {
  key: "retention_override_basis",
  label: "Legal-retention exception",
  source: "statute",
  citation: "DPDP Act, 2023 — s.8(7) proviso",
  note: "Retention required by law overrides erasure, for the covered fields only.",
};

/**
 * DPDP Act, 2023 — s.8(2). A Data Fiduciary may engage a Data Processor only
 * under a valid contract, and remains responsible for processing carried out
 * on its behalf.
 *
 * This is why processor instructions are validated against DPA scope before
 * dispatch, and why a processor's confirmation counts toward completion rather
 * than being treated as somebody else's problem.
 */
export const PROCESSOR_RESPONSIBILITY: LegalConstant = {
  key: "processor_responsibility",
  label: "Processor engagement",
  source: "statute",
  citation: "DPDP Act, 2023 — s.8(2)",
  note: "Fiduciary remains responsible for processing by its Processors.",
};

/**
 * DPDP Act, 2023 — s.5(3). Notice must be made available in English or any
 * language specified in the Eighth Schedule to the Constitution of India.
 * Consumed by Scenario 5/8 (notice publishing, multi-language generation).
 */
export const NOTICE_LANGUAGES: LegalConstant = {
  key: "notice_languages",
  label: "Notice languages",
  source: "statute",
  citation: "DPDP Act, 2023 — s.5(3); Eighth Schedule, Constitution of India",
  note: "English plus the 22 Eighth Schedule languages.",
};

export const EIGHTH_SCHEDULE_LANGUAGES = [
  "Assamese", "Bengali", "Bodo", "Dogri", "Gujarati", "Hindi", "Kannada",
  "Kashmiri", "Konkani", "Maithili", "Malayalam", "Manipuri", "Marathi",
  "Nepali", "Odia", "Punjabi", "Sanskrit", "Santali", "Sindhi", "Tamil",
  "Telugu", "Urdu",
] as const;

export const ALL_CONSTANTS: readonly LegalConstant[] = [
  ERASURE_PRE_NOTICE,
  BREACH_BOARD_DETAILED_REPORT,
  GRIEVANCE_REDRESSAL_CEILING,
  DPRR_FULFILMENT_PERIOD,
  RETENTION_OVERRIDE_BASIS,
  PROCESSOR_RESPONSIBILITY,
  NOTICE_LANGUAGES,
];

export function hoursToMs(hours: number): number {
  return hours * 60 * 60 * 1000;
}
