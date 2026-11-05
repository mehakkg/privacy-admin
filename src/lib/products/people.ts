import type { ActorRole } from "@/lib/domain";
import type { ProductKey } from "@/lib/products/deeplink";

/**
 * Canonical demo personas (switcher-revision §1.2) — the single source of truth
 * for the "Acting as" switcher, the product switcher's visibility, the header
 * avatar, and the §3 contextual-link gating. Each person maps to one Privacy
 * role and carries the set of products they can open, in the FIXED product order
 * Privacy · TPRM · DLP · IAM (the ✓ moves between shells; the order never does).
 */
export interface Persona {
  name: string;
  role: ActorRole;
  roleLabel: string;
  /** Products this person can open, already in canonical order. */
  products: ProductKey[];
}

/** Fixed display order of the four products — used by the switcher everywhere. */
export const PRODUCT_ORDER: ProductKey[] = ["privacy", "tprm", "dlp", "iam"];

export const PERSONAS: Persona[] = [
  { name: "Ritu Nair", role: "admin", roleLabel: "Admin", products: ["privacy", "tprm", "dlp", "iam"] },
  { name: "Kavita Menon", role: "dpo", roleLabel: "DPO", products: ["privacy", "tprm"] },
  { name: "Arvind Rao", role: "ciso", roleLabel: "CISO", products: ["privacy", "dlp", "iam"] },
  { name: "Sanjay Iyer", role: "grievance_officer", roleLabel: "Grievance Officer", products: ["privacy"] },
];

/**
 * The real signed-in account for the demo. "Acting as" previews other personas
 * on top of this account; the avatar follows the persona, while the account menu
 * shows this under "Signed in as" (switcher-revision §4.3).
 */
export const SIGNED_IN_AS = { name: "Ritu Nair", email: "ritu.nair@privacyconsole.in" };

export function personaFor(role: ActorRole): Persona {
  return (
    PERSONAS.find((p) => p.role === role) ?? {
      name: `Unassigned ${role}`,
      role,
      roleLabel: role,
      products: ["privacy"],
    }
  );
}

/** Whether the acting-as person can open a given product (gates §3 links). */
export function canOpenProduct(role: ActorRole, product: ProductKey): boolean {
  return personaFor(role).products.includes(product);
}

/** The products this person can open, in fixed order (switcher rows). */
export function productsFor(role: ActorRole): ProductKey[] {
  const can = personaFor(role).products;
  return PRODUCT_ORDER.filter((p) => can.includes(p));
}

/** "Privacy · TPRM" — a compact label for the acting-as menu. */
export function productsLabel(role: ActorRole): string {
  const short: Record<ProductKey, string> = { privacy: "Privacy", tprm: "TPRM", dlp: "DLP", iam: "IAM" };
  return productsFor(role).map((p) => short[p]).join(" · ");
}

/** "Kavita Menon" -> "KM". */
export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((part) => part.replace(/[^A-Za-z]/g, "").charAt(0))
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

/** Derived demo email for a persona, matching the old Shell derivation. */
export function emailFor(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/(^\.|\.$)/g, "")}@privacyconsole.in`;
}
