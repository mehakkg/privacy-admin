/**
 * System/recipient classification for the Data Map (detail "Systems & processors"
 * tab and the Data flow page). Pure fixture constant keyed by the system's exact
 * name — kept as data (not a DB column) so the seed needs no DDL at deploy.
 *   internal  — Meridian's own system (no processor contract needed)
 *   processor — a third-party processor (needs a valid contract, Section 8(2))
 *   fiduciary — another Data Fiduciary the data is shared with (Section 8(3))
 *   registry  — a government registry
 */
export type SystemKind = "internal" | "processor" | "fiduciary" | "registry";

export const SYSTEM_KIND: Record<string, SystemKind> = {
  "Core Banking (CBS)": "internal",
  "Salesforce CRM": "processor",
  "Snowflake": "processor",
  "Freshdesk": "processor",
  "Darwinbox HRMS": "processor",
  "Mailchimp": "processor",
  "TransUnion CIBIL": "fiduciary",
  "CKYC Registry (CERSAI)": "registry",
  "AuthBridge": "processor",
};

export function kindOf(name: string): SystemKind {
  return SYSTEM_KIND[name] ?? "processor";
}

/** Vendors that appear in the Data flow "Shared with" column (external recipients),
 *  vs the "Storage & systems" column. AuthBridge is a processor but received data,
 *  so it is a recipient. Everything else linked is a storage system. */
export const RECIPIENTS = new Set<string>(["TransUnion CIBIL", "CKYC Registry (CERSAI)", "AuthBridge"]);
export function isRecipient(name: string): boolean { return RECIPIENTS.has(name); }

/** Which collection channels each activity's data enters through (Data flow). The
 *  channel is a Consent-collection concept, not stored on the activity. "Partner API"
 *  is deliberately NOT a configured channel → it raises the Undeclared channel finding. */
export const CHANNELS_BY_ACTIVITY: Record<string, string[]> = {
  "Customer onboarding & KYC": ["Mobile app", "Branch (offline)"],
  "Credit scoring": ["Web portal"],
  "Loan servicing": ["Web portal"],
  "Fraud monitoring": ["Mobile app"],
  "Debt collections": ["Call centre"],
  "Marketing campaigns": ["Web portal", "Partner API"],
  "Customer support calls": ["Call centre"],
  "Pre-employment background verification": ["HRMS"],
};
/** Channels configured in Consent collection. A channel not here is "undeclared". */
export const DECLARED_CHANNELS = new Set<string>(["Mobile app", "Web portal", "Branch (offline)", "Call centre", "HRMS"]);

export const KIND_LABEL: Record<SystemKind, string> = {
  internal: "Internal",
  processor: "Processor",
  fiduciary: "Data Fiduciary",
  registry: "Government registry",
};

/** India is home; anything else is a cross-border transfer (Section 16, info). */
export function isCrossBorder(country: string | null): boolean {
  return !!country && country !== "IN";
}

const COUNTRY_NAME: Record<string, string> = { IN: "India", SG: "Singapore", US: "United States", IE: "Ireland", AE: "UAE", JP: "Japan" };
export function countryName(code: string | null): string {
  return code ? COUNTRY_NAME[code] ?? code : "—";
}
