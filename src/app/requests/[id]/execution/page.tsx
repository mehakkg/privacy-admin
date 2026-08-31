import CompletionPage from "../completion/page";
import ExecutePage from "../execute/page";
import VerifyPage from "../verify/page";
import FailuresPage from "../failures/page";

export const dynamic = "force-dynamic";

/**
 * TAB 3 — Execution.
 *
 * Per-system status grid, execute-per-system controls, the manual checklist for
 * systems with no API, and any failures — on one surface.
 *
 * Status is placed ABOVE the controls on purpose. Root cause 1 from the audit:
 * show the real state before and during an action, never just claim a result
 * after. Reading the grid first is the point.
 */
export default async function ExecutionPage(props: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="stack">
      <CompletionPage {...props} />
      <ExecutePage {...props} />
      <VerifyPage {...props} />
      <FailuresPage {...props} />
    </div>
  );
}
