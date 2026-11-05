/**
 * Badge fixtures (tprm-nav §8). Badges count only what the signed-in user must
 * act on; a badge of 0 is not rendered. Read from here — never hard-coded in
 * components. Keyed by role code → nav item id → count.
 */
import type { RoleCode } from "@/lib/tprm-nav/filter";

export const CONSOLE_BADGES: Partial<Record<RoleCode, Record<string, number>>> = {
  ADMIN: { pendingActions: 0, alerts: 9, incidents: 1, intake: 1, riskExceptions: 1 },
  RISK_MANAGER: { pendingActions: 7, pendingOverrides: 1, alerts: 9, incidents: 1, intake: 1, riskExceptions: 1 },
  RISK_ANALYST: { pendingActions: 6, alerts: 9, assessmentQueue: 2, issues: 3 },
};

export const PORTAL_BADGES: Record<string, number> = {
  vTodo: 6, vAssessments: 2, vFindings: 3, vContracts: 1, vDocuments: 1,
};

/** A badge shows only when > 0 (§1.5). */
export function badgeFor(map: Record<string, number> | undefined, id: string): number | undefined {
  const n = map?.[id];
  return n && n > 0 ? n : undefined;
}
