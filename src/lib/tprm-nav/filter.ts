/**
 * Permission-driven nav filtering (tprm-nav §0, §1, §4).
 *
 * Hide, don't disable. A section label disappears when all its items are hidden.
 * The order is the same for everyone; roles differ only in which items show.
 * System configuration and administration appear in the sidebar only in `sidebar`
 * mode; in `settings` mode they move behind the header ⚙.
 */
import {
  CONSOLE_SECTIONS, PORTAL_ITEMS,
  type NavSection, type NavItem, type Requirement, type PortalItem,
} from "@/lib/tprm-nav/nav.config";
import PERMISSIONS from "@/lib/tprm-nav/roles.permissions.json";

export type Placement = "settings" | "sidebar";
export interface NavFlags { dora: boolean; placement: Placement }

export type RoleCode = "ADMIN" | "RISK_MANAGER" | "RISK_ANALYST" | "READ_ONLY" | "VENDOR";

const PERMS = PERMISSIONS as Record<string, string[]>;
export function permsForRole(role: RoleCode): string[] { return PERMS[role] ?? []; }

/** Does the permission set satisfy a single requirement? Supports the sentinel
 *  "*" (holds everything) and the wildcard "*:SUFFIX" / "PREFIX_*:SUFFIX". */
export function holds(perms: string[], req: Requirement): boolean {
  if (perms.includes("*")) return true;
  if (perms.includes(req)) return true;
  if (req.startsWith("*:")) {
    const suffix = req.slice(1); // ":APPROVE"
    return perms.some((p) => p.endsWith(suffix));
  }
  const star = req.indexOf("*");
  if (star >= 0) {
    // e.g. "PORTAL_*:READ" → prefix "PORTAL_", suffix ":READ"
    const prefix = req.slice(0, star);
    const suffix = req.slice(star + 1);
    return perms.some((p) => p.startsWith(prefix) && p.endsWith(suffix));
  }
  return false;
}

/** Visible if the user holds ANY required permission ([] = always). */
export function itemVisible(perms: string[], item: Pick<NavItem, "requires" | "condition">, flags: NavFlags): boolean {
  if (item.condition === "dora" && !flags.dora) return false;
  if (item.requires.length === 0) return true;
  return item.requires.some((r) => holds(perms, r));
}

/** Compute the console sidebar for a permission set and flags. Empty sections are
 *  dropped. In `settings` mode the system-config and administration bands are
 *  excluded (they live behind ⚙). */
export function filterConsoleNav(perms: string[], flags: NavFlags): NavSection[] {
  return CONSOLE_SECTIONS
    .filter((s) => flags.placement === "sidebar" || (s.band !== "system-config" && s.band !== "administration"))
    .map((s) => ({ ...s, items: s.items.filter((it) => itemVisible(perms, it, flags)) }))
    .filter((s) => s.items.length > 0);
}

/** Flat count of visible console items (acceptance §3). */
export function consoleItemCount(perms: string[], flags: NavFlags): number {
  return filterConsoleNav(perms, flags).reduce((n, s) => n + s.items.length, 0);
}

/** Whether the header ⚙ shows (settings mode, §4): any config/admin READ. */
export function showSettingsGear(perms: string[]): boolean {
  const gates = ["CONFIG_IRQ:READ", "CONFIG_CONTROLS:READ", "CONFIG_RULES:READ", "CONFIG_FIELDS:READ", "CONFIG_REGULATORY:READ", "TEMPLATES:READ", "USERS:READ", "ROLES:READ", "CONFIG_BRANDING:READ"];
  return gates.some((g) => holds(perms, g));
}

// --- Vendor portal ----------------------------------------------------------
export interface PortalSection { label: string | null; items: PortalItem[] }

/** Compute the vendor portal sidebar (§5). Keeps section order; drops empties. */
export function filterPortalNav(perms: string[]): PortalSection[] {
  const visible = PORTAL_ITEMS.filter((it) => it.requires.some((r) => holds(perms, r)));
  const out: PortalSection[] = [];
  for (const it of visible) {
    const last = out[out.length - 1];
    if (last && last.label === it.section) last.items.push(it);
    else out.push({ label: it.section, items: [it] });
  }
  return out;
}

export function portalItemCount(perms: string[]): number {
  return PORTAL_ITEMS.filter((it) => it.requires.some((r) => holds(perms, r))).length;
}
