/**
 * Breach domain: the severity engine (volume × PII type × sensitivity), the
 * status flow, and the 72-hour Board-notification clock. The clock is anchored on
 * detectedAt and is the breach_clock Notification category's deadline surfaced —
 * not a separate timer.
 */

export const BREACH_SEVERITY = ["low", "medium", "high", "critical"] as const;
export type BreachSeverity = (typeof BREACH_SEVERITY)[number];

export interface SeverityInputs {
  /** Approx number of affected data principals. */
  volume: number;
  /** basic | contact | financial | kyc | health | children — highest applicable. */
  piiType: string;
  /** low | medium | high */
  sensitivity: string;
}

const PII_WEIGHT: Record<string, number> = { basic: 1, contact: 1, marketing: 1, transaction: 2, financial: 3, kyc: 3, health: 4, children: 4 };
const SENS_WEIGHT: Record<string, number> = { low: 1, medium: 2, high: 3 };

/** Auto-compute severity. Volume band × PII weight × sensitivity → band. */
export function breachSeverity(i: SeverityInputs): { severity: BreachSeverity; score: number; basis: Record<string, number> } {
  const volumeBand = i.volume >= 100000 ? 4 : i.volume >= 10000 ? 3 : i.volume >= 1000 ? 2 : 1;
  const pii = PII_WEIGHT[i.piiType] ?? 2;
  const sens = SENS_WEIGHT[i.sensitivity] ?? 2;
  const score = volumeBand * pii * sens;
  const severity: BreachSeverity = score >= 24 ? "critical" : score >= 12 ? "high" : score >= 5 ? "medium" : "low";
  return { severity, score, basis: { volumeBand, pii, sens } };
}

export const SEVERITY_TONE: Record<string, "red" | "yellow" | "gray"> = { critical: "red", high: "red", medium: "yellow", low: "gray" };

export const BREACH_STATUS_ORDER = ["triage", "investigating", "package_compiling", "board_notified", "remediation", "closed"] as const;
export const BREACH_STATUS_LABEL: Record<string, string> = {
  triage: "Triage", investigating: "Investigating", package_compiling: "Compiling package",
  board_notified: "Board notified", remediation: "Remediation", closed: "Closed",
};

export const NOTIFY_WINDOW_HOURS = 72;

/** Hours remaining on the 72-hour clock (negative = overdue) and an urgency band. */
export function clock(detectedAtIso: string, now: number = Date.now()): { hoursElapsed: number; hoursRemaining: number; band: "ok" | "due_soon" | "breached" } {
  const elapsed = (now - new Date(detectedAtIso).getTime()) / 3_600_000;
  const remaining = NOTIFY_WINDOW_HOURS - elapsed;
  const band = remaining <= 0 ? "breached" : remaining <= 24 ? "due_soon" : "ok";
  return { hoursElapsed: Math.floor(elapsed), hoursRemaining: Math.ceil(remaining), band };
}

/** The six Rule 8(6)(b) fields, in order — each a distinct statutory requirement. */
export const RULE_8_6_FIELDS: { key: string; label: string; clause: string }[] = [
  { key: "updatedDescription", label: "Updated description of the breach", clause: "8(6)(b)(i)" },
  { key: "factsAndCircumstances", label: "Facts and circumstances", clause: "8(6)(b)(ii)" },
  { key: "mitigationMeasures", label: "Measures to mitigate risk", clause: "8(6)(b)(iii)" },
  { key: "causeFindings", label: "Findings on the cause", clause: "8(6)(b)(iv)" },
  { key: "remedialMeasures", label: "Remedial measures taken", clause: "8(6)(b)(v)" },
  { key: "principalIntimationReport", label: "Report on intimations to affected principals", clause: "8(6)(b)(vi)" },
];
