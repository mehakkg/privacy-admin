/**
 * Shared Organisation settings fixtures (reach-products §8).
 *
 * Connectors and Users & roles are the same across all four products. People come
 * from miniOrange IAM; roles are stored per product on the one IAM person record.
 * The other portals aren't connected in this prototype, so this is the single
 * fixture source (§10 Meridian) that the Settings panels read.
 */
import type { ProductKey } from "@/lib/products/deeplink";

export type ConnStatus = "connected" | "not_connected" | "error";

export interface Connector {
  key: string;
  name: string;
  product?: ProductKey; // set for the three miniOrange products (shows a chip + Open in)
  status: ConnStatus;
  tenant: string | null;
  lastSync: string | null;
  owner: string | null;
  failures24h: number;
  lastError: string | null;
}

export const CONNECTORS: Connector[] = [
  { key: "iam", name: "miniOrange IAM", product: "iam", status: "connected", tenant: "meridian-iam", lastSync: "4 minutes ago", owner: "Ritu Nair", failures24h: 0, lastError: null },
  { key: "dlp", name: "miniOrange DLP", product: "dlp", status: "connected", tenant: "meridian-dlp", lastSync: "12 minutes ago", owner: "Ritu Nair", failures24h: 0, lastError: null },
  { key: "tprm", name: "miniOrange TPRM", product: "tprm", status: "connected", tenant: "meridian-tprm", lastSync: "1 hour ago", owner: "Kavita Menon", failures24h: 0, lastError: null },
  { key: "siem", name: "SIEMs", status: "not_connected", tenant: null, lastSync: null, owner: null, failures24h: 0, lastError: null },
  { key: "risk-analytics", name: "Risk analytics", status: "not_connected", tenant: null, lastSync: null, owner: null, failures24h: 0, lastError: null },
];

export const CONN_STATUS_LABEL: Record<ConnStatus, string> = {
  connected: "Connected",
  not_connected: "Not connected",
  error: "Error",
};
export const CONN_STATUS_TONE: Record<ConnStatus, string> = {
  connected: "sev-success",
  not_connected: "ok",
  error: "sev-danger",
};

/** A role on one product. `mappedFrom` marks a role granted by Privacy mapping
 *  (§3.2) — it can't be raised above the mapping without that product's admin. */
export interface ProductRole { label: string; mappedFrom?: string }

export interface OrgPerson {
  name: string;
  iamId: string;
  status: "active" | "invited" | "deactivated";
  privacy: ProductRole | null;
  tprm: ProductRole | null;
  dlp: ProductRole | null;
  iam: ProductRole | null;
}

// §10 Meridian roster. Roles are per product on the one IAM record.
export const ORG_PEOPLE: OrgPerson[] = [
  { name: "Ritu Nair", iamId: "iam-ritu-nair", status: "active", privacy: { label: "Admin" }, tprm: { label: "Administrator" }, dlp: { label: "Admin" }, iam: { label: "Admin" } },
  { name: "Kavita Menon", iamId: "iam-kavita-menon", status: "active", privacy: { label: "DPO" }, tprm: { label: "Risk Manager", mappedFrom: "DPO" }, dlp: null, iam: null },
  { name: "Arvind Rao", iamId: "iam-arvind-rao", status: "active", privacy: { label: "CISO" }, tprm: { label: "Risk Manager" }, dlp: { label: "Reviewer" }, iam: null },
  { name: "Neha Kapoor", iamId: "iam-neha-kapoor", status: "active", privacy: { label: "Legal" }, tprm: { label: "Reviewer" }, dlp: null, iam: null },
  { name: "Sanjay Iyer", iamId: "iam-sanjay-iyer", status: "active", privacy: { label: "Grievance Officer" }, tprm: null, dlp: null, iam: null },
  { name: "Priya Sharma", iamId: "iam-priya-sharma", status: "deactivated", privacy: { label: "Analyst" }, tprm: null, dlp: null, iam: null },
];

export const STATUS_LABEL: Record<OrgPerson["status"], string> = {
  active: "Active",
  invited: "Invited",
  deactivated: "Deactivated",
};
