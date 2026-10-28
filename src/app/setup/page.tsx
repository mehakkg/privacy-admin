import { redirect } from "next/navigation";
import { getProfile } from "@/lib/setup/state";
import { profileComplete } from "@/lib/setup/plan";
import { Shell } from "@/components/Shell";

export const dynamic = "force-dynamic";

/** S6 — Setup (task catalogue + go-live gate). Full page lands in milestone 2;
 *  for now a placeholder so the plan's "Start setup" has a destination. */
export default async function SetupPage() {
  const profile = await getProfile();
  if (!profileComplete(profile)) redirect("/setup/profile");
  return (
    <Shell active="/setup" title="Setup">
      <div className="pa-list">
        <div className="pa-head"><div className="stack" style={{ gap: 4 }}><h1 className="inv-title">Setup</h1><p className="cell-sub" style={{ margin: 0 }}>Everything Meridian needs before going live. Each task goes to the person who owns it.</p></div></div>
        <div className="inv-noresult" style={{ marginTop: 16 }}>The task catalogue and go-live gate are being built. Your profile and plan are saved.</div>
      </div>
    </Shell>
  );
}
