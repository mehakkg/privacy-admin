import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { getProfile, getSetupState } from "@/lib/setup/state";
import { getCurrentRole } from "@/lib/session";
import { getPurposesView } from "@/lib/engines/purposes";
import { profileComplete, daysUntil, ENFORCEMENT } from "@/lib/setup/plan";
import { DECLARED_CHANNELS } from "@/lib/activities/systems";
import { SetupScreen } from "@/components/setup/SetupScreen";

export const dynamic = "force-dynamic";

/** S6 — Setup: the task catalogue, role-filtered My tasks, Everyone's progress,
 *  and the Go-live readiness gate. */
export default async function SetupPage() {
  const [state, profile, role, purposes, fiduciaryCount] = await Promise.all([
    getSetupState(), getProfile(), getCurrentRole(), getPurposesView(), db.entity.count(),
  ]);
  if (!profileComplete(profile)) redirect("/setup/profile");
  const facts = { fiduciaryCount, approvedPurposes: purposes.counts.approved, channels: DECLARED_CHANNELS.size };
  return (
    <Shell active="/setup" title="Setup">
      <SetupScreen state={state} role={role} facts={facts} days={daysUntil(ENFORCEMENT)} />
    </Shell>
  );
}
