import type { ProductKey } from "@/lib/products/deeplink";

/**
 * Navigation-only prototype content for the DLP and IAM consoles (parallel to
 * the TPRM nav prototype). These are separate products with no real codebase in
 * this workspace, so each console is a representative, static sidebar reached
 * through the product switcher. No permission engine here — the sidebars show a
 * typical admin's full nav.
 */
export interface ConsoleNavItem { label: string; badge?: number }
export interface ConsoleNavSection { label?: string; items: ConsoleNavItem[] }

export const CONSOLE_NAV: Record<Exclude<ProductKey, "privacy" | "tprm">, ConsoleNavSection[]> = {
  dlp: [
    { items: [{ label: "Dashboard" }] },
    {
      label: "Discovery",
      items: [
        { label: "Data sources", badge: 6 },
        { label: "Discovery scans" },
        { label: "Scan configuration" },
      ],
    },
    {
      label: "Classification",
      items: [
        { label: "Classification results" },
        { label: "Sensitivity labels" },
        { label: "Classifiers" },
      ],
    },
    {
      label: "Protection",
      items: [
        { label: "Protection policies" },
        { label: "Policy violations", badge: 4 },
        { label: "Quarantine" },
      ],
    },
    {
      label: "Monitoring",
      items: [
        { label: "Activity monitor" },
        { label: "Alerts" },
      ],
    },
    { items: [{ label: "Reports" }, { label: "Settings" }] },
  ],
  iam: [
    { items: [{ label: "Dashboard" }] },
    {
      label: "Identities",
      items: [
        { label: "Users" },
        { label: "Groups" },
        { label: "Directory sync" },
      ],
    },
    {
      label: "Access",
      items: [
        { label: "Applications" },
        { label: "Entitlements" },
        { label: "Access reviews" },
        { label: "Dormant accounts", badge: 3 },
      ],
    },
    {
      label: "Authentication",
      items: [
        { label: "Sign-in policies" },
        { label: "MFA" },
        { label: "Passwordless" },
      ],
    },
    {
      label: "Governance",
      items: [
        { label: "Access requests" },
        { label: "Certifications" },
      ],
    },
    { items: [{ label: "Reports" }, { label: "Settings" }] },
  ],
};
