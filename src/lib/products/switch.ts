import type { ProductKey } from "@/lib/products/deeplink";

/**
 * One source for the product switcher: display name, one-line description, the
 * accent used for the tile, and the in-app route each product opens. Order is
 * fixed Privacy · TPRM · DLP · IAM (switcher-revision §1.1) — the ✓ moves, the
 * order never does.
 *
 * Privacy (blue) and TPRM (orange) are brand colours. DLP and IAM use a neutral
 * slate placeholder until their owners supply a mark.
 * // TODO brand from DLP/IAM owner — replace the neutral accent below.
 */
export interface SwitchMeta { key: ProductKey; name: string; desc: string; accent: string; route: string }

export const SWITCH_ORDER: ProductKey[] = ["privacy", "tprm", "dlp", "iam"];

export const SWITCH_META: Record<ProductKey, SwitchMeta> = {
  privacy: { key: "privacy", name: "miniOrange Privacy", desc: "Register, consent, rights and breaches", accent: "#2563eb", route: "/home" },
  tprm: { key: "tprm", name: "miniOrange TPRM", desc: "Vendor risk, assessments and monitoring", accent: "#ea580c", route: "/tprm-console" },
  dlp: { key: "dlp", name: "miniOrange DLP", desc: "Data discovery, classification and policies", accent: "#64748b", route: "/dlp-console" },
  iam: { key: "iam", name: "miniOrange IAM", desc: "Identity, sign-in and access", accent: "#64748b", route: "/iam-console" },
};

/** The route for a product key (where the switcher sends you). */
export function routeFor(key: ProductKey): string {
  return SWITCH_META[key].route;
}
