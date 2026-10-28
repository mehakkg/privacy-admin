import { redirect } from "next/navigation";
import { getProfile } from "@/lib/setup/state";
import { getCurrentRole } from "@/lib/session";
import { computePlan, daysUntil, profileComplete, ENFORCEMENT, CONSENT_MANAGER } from "@/lib/setup/plan";
import { PlanView } from "@/components/setup/PlanView";

export const dynamic = "force-dynamic";

/** S5 — the computed DPDP plan. Every user sees it once after the profile is done. */
export default async function PlanPage() {
  const [profile, role] = await Promise.all([getProfile(), getCurrentRole()]);
  if (!profileComplete(profile)) redirect("/setup/profile");
  const today = new Date();
  const plan = computePlan(profile);
  return (
    <PlanView
      applies={plan.applies}
      doesntApply={plan.doesntApply}
      days={daysUntil(ENFORCEMENT, today)}
      enforced={today >= ENFORCEMENT}
      consentManagerLive={today >= CONSENT_MANAGER}
      role={role}
    />
  );
}
