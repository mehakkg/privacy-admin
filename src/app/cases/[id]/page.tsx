import { Shell } from "@/components/Shell";
import { CaseWorkspace } from "@/components/caseflow/CaseWorkspace";

export const dynamic = "force-dynamic";

/**
 * Case Workspace (Operate phase) — three columns: request context, the current
 * step + per-system deletion grid + journey steps, and the audit timeline.
 * Close is proof-gated: it unlocks only when every system is Fully verified.
 */
export default function CaseWorkspacePage() {
  return (
    <Shell active="/cases" title="Case workspace">
      <CaseWorkspace />
    </Shell>
  );
}
