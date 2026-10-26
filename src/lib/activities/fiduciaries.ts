/**
 * Fiduciary details (Master spec Part C). The DB Entity row carries only
 * name/legalName/sdfStatus, and the pooled Postgres connection can't take new
 * DDL, so the registration attributes the Fiduciaries screen needs — short name,
 * CIN, registered office, website, DPO, grievance contact, published Rule 9
 * contact and SDF notification details — live here as a pure fixture keyed by
 * the entity's legal name. Merge this with the real entity rows + computed
 * activity counts; never hard-code the counts.
 */

export interface FiduciaryDetail {
  shortName: string;
  cin: string;
  officeCity: string;
  officeState: string;
  website: string;
  dpo: string;
  grievanceContact: string;
  /** Rule 9 published business contact. Empty string = missing → amber warning. */
  publishedEmail: string;
  /** SDF status is notified by the Central Government, DPO-only to edit here. */
  sdfStatus: "not_notified" | "notified";
  sdfNotifiedOn: string | null;
  notificationRef: string | null;
}

export const FIDUCIARY_DETAILS: Record<string, FiduciaryDetail> = {
  "Meridian Financial Services Ltd": {
    shortName: "MFS",
    cin: "U65999MH2011PLC000001",
    officeCity: "Mumbai",
    officeState: "Maharashtra",
    website: "https://meridianfinancial.example.in",
    dpo: "Kavita Menon",
    grievanceContact: "Sanjay Iyer",
    publishedEmail: "dpo@meridianfinancial.example.in",
    sdfStatus: "not_notified",
    sdfNotifiedOn: null,
    notificationRef: null,
  },
  "Meridian Securities Ltd": {
    shortName: "MSL",
    cin: "U67120MH2015PLC000002",
    officeCity: "Mumbai",
    officeState: "Maharashtra",
    website: "https://meridiansecurities.example.in",
    dpo: "Kavita Menon",
    grievanceContact: "Sanjay Iyer",
    publishedEmail: "dpo@meridiansecurities.example.in",
    sdfStatus: "not_notified",
    sdfNotifiedOn: null,
    notificationRef: null,
  },
};

/** Fallback short name from a legal name, e.g. "Acme Health Pvt Ltd" → "AHP". */
export function deriveShort(name: string): string {
  const stop = new Set(["ltd", "limited", "pvt", "private", "llp", "inc", "co", "company", "and", "the", "&"]);
  const letters = name.split(/\s+/).filter((w) => w && !stop.has(w.toLowerCase().replace(/[^a-z]/g, ""))).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (letters || name.slice(0, 3)).slice(0, 5).toUpperCase();
}

export function detailFor(name: string): FiduciaryDetail {
  return (
    FIDUCIARY_DETAILS[name] ?? {
      shortName: deriveShort(name),
      cin: "",
      officeCity: "",
      officeState: "",
      website: "",
      dpo: "",
      grievanceContact: "",
      publishedEmail: "",
      sdfStatus: "not_notified",
      sdfNotifiedOn: null,
      notificationRef: null,
    }
  );
}

/** People available for the DPO and grievance-contact pickers. */
export const FIDUCIARY_PEOPLE = ["Kavita Menon", "Sanjay Iyer", "Arvind Rao", "Ritu Nair"];

export const SDF_LABEL: Record<FiduciaryDetail["sdfStatus"], string> = {
  not_notified: "Not notified",
  notified: "Notified as SDF",
};
