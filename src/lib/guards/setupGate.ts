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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function requireSetupGate(_active: string): Promise<void> {
  // Explore freely (unified-nav §0): the dashboard and every module are reachable
  // from the first login — nothing in the sidebar is gated. Onboarding is entered
  // on purpose via the Setup leaf and the Home setup strip, not by a forced
  // redirect, and only the three customer-facing capabilities are gated (at publish
  // time, §6.3 pre-flight). So this guard no longer redirects.
  return;
}
