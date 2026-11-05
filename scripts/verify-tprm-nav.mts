import { filterConsoleNav, consoleItemCount, filterPortalNav, portalItemCount, permsForRole, showSettingsGear, type NavFlags } from "../src/lib/tprm-nav/filter";

const settingsDora: NavFlags = { dora: true, placement: "settings" };
const sidebarDora: NavFlags = { dora: true, placement: "sidebar" };
const settingsNoDora: NavFlags = { dora: false, placement: "settings" };

function labels(perms: string[], flags: NavFlags): string {
  return filterConsoleNav(perms, flags).map((s) => `${s.label}: ${s.items.map((i) => i.label).join(" · ")}`).join("\n  ");
}

const checks: [string, number, number][] = [];
const add = (name: string, got: number, want: number) => checks.push([name, got, want]);

add("Admin settings+DORA = 19", consoleItemCount(permsForRole("ADMIN"), settingsDora), 19);
add("RiskManager settings+DORA = 19", consoleItemCount(permsForRole("RISK_MANAGER"), settingsDora), 19);
add("RiskAnalyst settings+DORA = 18", consoleItemCount(permsForRole("RISK_ANALYST"), settingsDora), 18);
add("Admin sidebar+DORA = 33", consoleItemCount(permsForRole("ADMIN"), sidebarDora), 33);
add("RiskManager sidebar+DORA = 20", consoleItemCount(permsForRole("RISK_MANAGER"), sidebarDora), 20);
add("RiskAnalyst sidebar+DORA = 19", consoleItemCount(permsForRole("RISK_ANALYST"), sidebarDora), 19);
add("Admin settings NO DORA = 18", consoleItemCount(permsForRole("ADMIN"), settingsNoDora), 18);
add("Vendor portal = 11", portalItemCount(permsForRole("VENDOR")), 11);

// Custom role: VENDOR:READ + REPORTS:READ → Dashboard · Vendors · Reports & Exports = 3
const custom = ["VENDOR:READ", "REPORTS:READ"];
add("Custom role = 3", consoleItemCount(custom, settingsDora), 3);

// Vendor + instructions perm → 12
const vendorPlus = [...permsForRole("VENDOR"), "PORTAL_INSTRUCTIONS:READ"];
add("Vendor + Instructions = 12", portalItemCount(vendorPlus), 12);

console.log("=== Counts ===");
let ok = true;
for (const [name, got, want] of checks) {
  const pass = got === want;
  if (!pass) ok = false;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  (got ${got})`);
}

console.log("\n=== Gear visible (settings mode) ===");
for (const r of ["ADMIN", "RISK_MANAGER", "RISK_ANALYST", "READ_ONLY"] as const) {
  console.log(`${r}: ${showSettingsGear(permsForRole(r))}`);
}

console.log("\n=== Custom role lists ===\n  " + labels(custom, settingsDora));
console.log("\n=== RiskAnalyst (settings+DORA) ===\n  " + labels(permsForRole("RISK_ANALYST"), settingsDora));
console.log("\n=== Vendor portal ===\n  " + filterPortalNav(permsForRole("VENDOR")).map((s) => `${s.label ?? "(top)"}: ${s.items.map((i) => i.label).join(" · ")}`).join("\n  "));

process.exit(ok ? 0 : 1);
