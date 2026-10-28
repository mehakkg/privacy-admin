import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/session";
import { getProfile, getPlanViewedRoles } from "@/lib/setup/state";
import { profileComplete } from "@/lib/setup/plan";

/**
 * Setup route guard (replaces the September onboarding dashboard lock). Principle:
 * explore freely, publish safely. The dashboard and every module are reachable —
 * only two things redirect, and both are quick and one-time:
 *   - the readiness profile isn't done AND the user is Admin or DPO → /setup/profile
 *     (other roles explore freely; setup is in progress for them)
 *   - the profile is done but this user hasn't seen the plan yet → /setup/plan (once)
 * After that, the user is never forced back to /setup; the dashboard strip links to it.
 * Server-side redirect, so a gated page is never painted.
 */
export async function requireSetupGate(active: string): Promise<void> {
  if (active.startsWith("/setup") || active.startsWith("/login") || active.startsWith("/invite") || active.startsWith("/account")) return;
  const role = await getCurrentRole();
  const profile = await getProfile();
  if (!profileComplete(profile)) {
    if (role === "admin" || role === "dpo") redirect("/setup/profile");
    return;
  }
  const viewed = await getPlanViewedRoles();
  if (!viewed.includes(role)) redirect("/setup/plan");
}
