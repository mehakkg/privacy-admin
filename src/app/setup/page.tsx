import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { getProfile, getSetupState } from "@/lib/setup/state";
import { getCurrentRole } from "@/lib/session";
import { profileComplete, daysUntil, ENFORCEMENT } from "@/lib/setup/plan";
import { isTaskDone } from "@/lib/setup/tasks";
import { SetupScreen } from "@/components/setup/SetupScreen";

export const dynamic = "force-dynamic";

/** S6 — Setup: the staged path (connect → governance → go live), Next-up, and the
 *  team rail. New-client fixture: facts derive from setup state only (no activities
 *  or purposes yet), so the go-live checks honestly show ✗ for an approved purpose
 *  and a collection channel until those modules are set up. */
export default async function SetupPage() {
  const [state, profile, role] = await Promise.all([getSetupState(), getProfile(), getCurrentRole()]);
  if (!profileComplete(profile)) redirect("/setup/profile");
  const facts = { fiduciaryCount: isTaskDone("A3", state) ? 2 : 1, approvedPurposes: 0, channels: 0 };
  return (
    <Shell active="/setup" title="Setup">
      <SetupScreen state={state} role={role} facts={facts} days={daysUntil(ENFORCEMENT)} />
    </Shell>
  );
}
