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
