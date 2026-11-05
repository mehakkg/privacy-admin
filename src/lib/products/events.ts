/**
 * Cross-product events (reach-products §7).
 *
 * Each event originates in another miniOrange product (DLP / IAM / TPRM), is
 * processed automatically in DPDP, and is written once to the shared audit log
 * tagged with both products. The other portals aren't connected in this
 * prototype, so these are the seeded fixture events (§10), held here as the one
 * source so the audit panel and the per-surface banners always agree.
 */
import type { ProductKey } from "@/lib/products/deeplink";

/** Where in DPDP the event's effect shows up, so a page can pull just its own. */
export type Surface = "inventory" | "activities" | "data-flow" | "protection-rules" | "access" | "breaches" | "processors" | "my-work";

export interface CrossProductEvent {
  id: string;
  source: ProductKey; // the product the event came from
  at: string; // relative time
  /** One-line audit statement (what was recorded). */
  audit: string;
  /** What happened in DPDP, shown on the affected surface. */
  effect: string;
  surface: Surface;
  /** The DPDP object the effect lands on, and where to open it. */
  objectLabel: string;
  href: string;
  /** Tag shown on the affected object (e.g. "Review due"). */
  tag?: string;
}

export const CROSS_PRODUCT_EVENTS: CrossProductEvent[] = [
  {
    id: "xpe-dlp-nominee",
    source: "dlp",
    at: "3 hours ago",
    audit: "DLP found 2 new fields in Core Banking (CBS): nominee_name, nominee_relation.",
    effect: "DLP found nominee_name, nominee_relation in Core Banking. Loan servicing moved to Review due.",
    surface: "activities",
    objectLabel: "Loan servicing",
    href: "/data-map/activities",
    tag: "Review due",
  },
  {
    id: "xpe-iam-leaver",
    source: "iam",
    at: "2 days ago",
    audit: "IAM leaver Rohan Desai (offboarding) created Access change AC-1042.",
    effect: "Offboarding synced from IAM created Access change AC-1042, listing 4 applications from the register.",
    surface: "access",
    objectLabel: "AC-1042",
    href: "/access/changes",
    tag: "New",
  },
  {
    id: "xpe-iam-owner-left",
    source: "iam",
    at: "1 day ago",
    audit: "IAM deactivated Priya Sharma, who owns 1 DPDP activity.",
    effect: "Priya Sharma was deactivated in IAM. Marketing analytics now shows Owner left — reassign.",
    surface: "my-work",
    objectLabel: "Marketing analytics",
    href: "/data-map/activities",
    tag: "Owner left",
  },
  {
    id: "xpe-tprm-incident",
    source: "tprm",
    at: "5 days ago",
    audit: "TPRM incident INC-0412 involving personal data created Breach BR-2026-014.",
    effect: "TPRM incident INC-0412 (personal data) created Breach BR-2026-014.",
    surface: "breaches",
    objectLabel: "BR-2026-014",
    href: "/breaches",
    tag: "From TPRM",
  },
  {
    id: "xpe-dlp-reclassify",
    source: "dlp",
    at: "6 hours ago",
    audit: "DLP reclassified account_balance to Restricted in Core Banking (CBS).",
    effect: "account_balance is now Restricted. Protection rules flags Rule check needed.",
    surface: "protection-rules",
    objectLabel: "account_balance",
    href: "/data-protection/rules",
    tag: "Rule check needed",
  },
];

export function eventsForSurface(surface: Surface): CrossProductEvent[] {
  return CROSS_PRODUCT_EVENTS.filter((e) => e.surface === surface);
}
