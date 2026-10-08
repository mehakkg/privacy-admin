import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { getActivityWorkspace } from "@/lib/engines/activities";
import { getCurrentRole } from "@/lib/session";
import { WorkspaceShell } from "@/components/activities/WorkspaceShell";

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
  return (
    <Shell active="/data-map/processing-activities" title={view.name}>
      <WorkspaceShell view={view} state={state} role={role} />
    </Shell>
  );
}
