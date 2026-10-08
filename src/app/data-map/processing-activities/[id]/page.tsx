import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { getActivityWorkspace } from "@/lib/engines/activities";
import { getCurrentRole } from "@/lib/session";
import { WorkspaceShell } from "@/components/activities/WorkspaceShell";
import { DevBar } from "@/components/activities/DevBar";

export const dynamic = "force-dynamic";

/** SCREEN 3 — Activity workspace. Shell + Basics are built (M3); purpose panes and
 *  Review & activate fill in later milestones. */
export default async function ActivityWorkspacePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ id }, sp, role] = await Promise.all([params, searchParams, getCurrentRole()]);
  const view = await getActivityWorkspace(id);
  if (!view) notFound();
  const state = { pane: sp.pane ?? "basics", purpose: sp.purpose, section: sp.section, from: sp.from, n: sp.n, of: sp.of };
  const dev = sp.dev === "1";
  const cfg = dev ? await db.integrationConfig.findUnique({ where: { id: "singleton" }, select: { paMultiEntity: true, paRequireDpoReview: true } }) : null;
  return (
    <Shell active="/data-map/processing-activities" title={view.name}>
      {dev && <DevBar role={role} multiEntity={cfg?.paMultiEntity ?? false} requireDpoReview={cfg?.paRequireDpoReview ?? false} activityId={view.id} />}
      <WorkspaceShell view={view} state={state} role={role} />
    </Shell>
  );
}
