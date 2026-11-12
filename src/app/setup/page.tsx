import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { getProfile } from "@/lib/setup/state";
import { getCurrentRole } from "@/lib/session";
import { profileComplete, daysUntil, ENFORCEMENT } from "@/lib/setup/plan";
import { GoLiveSetup } from "@/components/setup/GoLiveSetup";

export const dynamic = "force-dynamic";

/** Setup — the go-live path (setup-fix spec): four dependency-ordered stages, one
 *  accountable owner per step, drawer-or-deep-link configuration, done-row
 *  summaries and a "Waiting on" rail. */
export default async function SetupPage() {
  const [profile, role] = await Promise.all([getProfile(), getCurrentRole()]);
  if (!profileComplete(profile)) redirect("/setup/profile");
  return (
    <Shell active="/setup" title="Setup">
      <GoLiveSetup sessionRole={role} days={daysUntil(ENFORCEMENT)} />
    </Shell>
  );
}
