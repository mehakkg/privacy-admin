/**
 * DPDP readiness profile → plan (pure, no DB/React). Five profile answers decide
 * which DPDP obligations apply to the client, and the countdown to the Rules'
 * enforcement date is computed from today — never hard-coded. Shared by the
 * profile form, the plan page and the route guard.
 */

export type Industry = "banking" | "healthcare" | "ecommerce" | "gaming" | "social" | "saas" | "education" | "other";
export type UserCount = "under_50l" | "50l_2cr" | "over_2cr";
export type Children = "children" | "disabilities" | "neither" | "not_sure";
export type Sdf = "yes" | "no" | "not_known";
export type Processing = "proc_in" | "proc_out" | "transfer_self" | "none";

export interface ProfileAnswers {
  industry?: Industry;
  userCount?: UserCount;
  children?: Children;
  sdf?: Sdf;
  processing?: Processing[];
  startedBy?: string;
  startedAt?: string;
  done?: boolean;
}

/** Rules 3 and 5–16 apply from this date (G.S.R. 846(E), notified 13 Nov 2025). */
export const ENFORCEMENT = new Date("2027-05-13T00:00:00Z");
export const CONSENT_MANAGER = new Date("2026-11-13T00:00:00Z");
const DAY = 86_400_000;

export function daysUntil(date: Date, today: Date = new Date()): number {
  return Math.ceil((date.getTime() - startOfDay(today).getTime()) / DAY);
}
function startOfDay(d: Date): Date { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }

export function answeredCount(a: ProfileAnswers): number {
  return [a.industry, a.userCount, a.children, a.sdf, (a.processing && a.processing.length) ? "x" : undefined].filter(Boolean).length;
}
export function profileComplete(a: ProfileAnswers): boolean { return answeredCount(a) === 5; }

export interface Obligation { id: string; label: string; source: string; module: string; href: string }
export interface PlanRow extends Obligation { reason?: string }

const ALWAYS: Obligation[] = [
  { id: "notice", label: "Give a notice before asking for consent", source: "S.5, Rule 3", module: "Consent & Notices", href: "/consent/notices" },
  { id: "contact", label: "Publish a contact for privacy questions", source: "S.8(9), Rule 9", module: "Settings › Fiduciaries", href: "/settings/organization?tab=fiduciaries" },
  { id: "grievance", label: "Run a grievance mechanism and answer rights requests", source: "S.8(10), S.11–14, Rule 14", module: "Rights Requests", href: "/requests" },
  { id: "security", label: "Keep reasonable security safeguards and access logs", source: "S.8(5), Rule 6", module: "Data Protection, Access", href: "/data-flow/protection-rules" },
  { id: "breach", label: "Tell the Board and affected people about a breach", source: "S.8(6), Rule 7", module: "Breach Management", href: "/breach/incidents" },
  { id: "logs", label: "Keep processing logs for at least one year", source: "Rule 8(3)", module: "Data Protection", href: "/data-protection/retention" },
];

function inactivityApplies(a: ProfileAnswers): boolean {
  const i = a.industry;
  if (i === "ecommerce" || i === "social") return a.userCount === "over_2cr";
  if (i === "gaming") return a.userCount === "50l_2cr" || a.userCount === "over_2cr";
  return false;
}

/** Split obligations into "applies to you" and "doesn't apply right now" with reasons. */
export function computePlan(a: ProfileAnswers): { applies: PlanRow[]; doesntApply: PlanRow[] } {
  const applies: PlanRow[] = [...ALWAYS];
  const doesntApply: PlanRow[] = [];

  // Processor contracts (S.8(2)) — if any processor is used.
  if (a.processing?.some((p) => p === "proc_in" || p === "proc_out")) {
    applies.push({ id: "processors", label: "Use processors only under a valid contract", source: "S.8(2)", module: "Vendor Risk", href: "/vendor-risk/register" });
  }
  // Cross-border transfers (S.16, Rule 15) — if data goes outside India.
  if (a.processing?.some((p) => p === "proc_out" || p === "transfer_self")) {
    applies.push({ id: "transfers", label: "Transfers outside India meet government restrictions", source: "S.16, Rule 15", module: "Data flow", href: "/data-flow/map" });
  }

  // Verifiable consent for children / persons with disabilities (Rules 10–11).
  const childOb: Obligation = { id: "children", label: "Verifiable consent for children or persons with disabilities", source: "Rules 10–11", module: "Consent collection", href: "/consent/platform" };
  if (a.children === "children" || a.children === "disabilities" || a.children === "not_sure") {
    applies.push({ ...childOb, reason: a.children === "not_sure" ? "You answered “Not sure” — treated as applies, flagged for your DPO." : undefined });
  } else {
    doesntApply.push({ ...childOb, reason: "you answered “Neither”." });
  }

  // SDF duties (Section 10) — DPO in India, annual DPIA & audit.
  const sdfOb: Obligation = { id: "sdf", label: "SDF duties (DPO based in India, annual DPIA and audit)", source: "Section 10, Rule 13", module: "Settings › Fiduciaries", href: "/settings/organization?tab=fiduciaries" };
  if (a.sdf === "yes") applies.push(sdfOb);
  else doesntApply.push({ ...sdfOb, reason: "not notified as a Significant Data Fiduciary." });

  // Inactivity-based erasure (Rule 8 / Third Schedule).
  const inactOb: Obligation = { id: "inactivity", label: "Inactivity-based erasure and 48-hour notice", source: "Rule 8, Third Schedule", module: "Data Protection", href: "/data-protection/retention" };
  if (inactivityApplies(a)) applies.push(inactOb);
  else doesntApply.push({ ...inactOb, reason: "not an e-commerce, gaming or social-media platform above the Third Schedule thresholds." });

  return { applies, doesntApply };
}

export const INDUSTRY_LABEL: Record<Industry, string> = {
  banking: "Banking & financial services", healthcare: "Healthcare", ecommerce: "E-commerce", gaming: "Online gaming",
  social: "Social media", saas: "SaaS / technology", education: "Education", other: "Other",
};
