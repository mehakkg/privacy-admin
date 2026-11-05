/**
 * Cross-product deep links (reach-products §2.3).
 *
 * DPDP never lands a deep link on another product's home page — every link opens
 * the exact object and carries a `from` context so the target can render a return
 * bar. In this prototype the other portals (DLP / IAM / TPRM) aren't connected, so
 * each link resolves to the in-app holding page at /switch/{product}, which names
 * the object and the place to return to. When a real portal URL is configured, the
 * same builders point at `/{product}/{objectType}/{id}?from=…` unchanged.
 *
 * Format (spec §2.3): /{product}/{objectType}/{id}?from={sourceProduct}:{sourceType}:{sourceId}
 */

export type ProductKey = "privacy" | "iam" | "dlp" | "tprm";

export interface ProductMeta { key: ProductKey; name: string; accent: string }
export const PRODUCT_META: Record<ProductKey, ProductMeta> = {
  privacy: { key: "privacy", name: "miniOrange Privacy", accent: "#2563eb" },
  iam: { key: "iam", name: "miniOrange IAM", accent: "#7c3aed" },
  dlp: { key: "dlp", name: "miniOrange DLP", accent: "#0891b2" },
  tprm: { key: "tprm", name: "miniOrange TPRM", accent: "#ea580c" },
};

/** A source-context descriptor for the return bar: "Activity · Customer onboarding". */
export interface FromContext { label: string; href?: string }

/**
 * Build a deep link into another product. `object` is the human label of the exact
 * object the link opens (e.g. "Source · Core Banking", "Policy violations"). The
 * optional `from` renders the return bar on the landing page.
 */
export function productLink(product: ProductKey, object: string, from?: FromContext): string {
  const sp = new URLSearchParams();
  sp.set("object", object);
  if (from?.label) sp.set("from", from.label);
  if (from?.href) sp.set("fromHref", from.href);
  return `/switch/${product}?${sp.toString()}`;
}

export const dlpLink = (object: string, from?: FromContext) => productLink("dlp", object, from);
export const iamLink = (object: string, from?: FromContext) => productLink("iam", object, from);
export const tprmLink = (object: string, from?: FromContext) => productLink("tprm", object, from);

/**
 * Fixture signals read from DLP for the Meridian tenant (spec §4.1, §10). Real
 * counts come from the DLP connector; here they are a single source so the number
 * shown on the Data inventory strip and anywhere else always agrees.
 */
export const DLP_SIGNALS = {
  policyViolations: 4,
  sources: 6,
};
