import Link from "next/link";
import { getDraft, getActiveVersion, getGrid, getChecks, getImpact, getCategories } from "@/lib/engines/maskingpolicy";
import { StartDraftButton } from "@/components/maskingpolicy/PolicyActions";
import { WorkspaceBar } from "@/components/maskingpolicy/WorkspaceBar";
import { SeedBanner } from "@/components/maskingpolicy/SeedBanner";
import { DecisionsInbox } from "@/components/maskingpolicy/DecisionsInbox";
import { PolicyGrid } from "@/components/maskingpolicy/PolicyGrid";
import { PreviewPanel } from "@/components/maskingpolicy/PreviewPanel";

const BASE = "/data-flow/masking-policy";

export async function Workspace() {
  const draft = await getDraft();
  if (!draft) return (
    <div className="mp-card"><div className="stack" style={{ gap: 8 }}><h3 style={{ margin: 0 }}>No draft in progress.</h3><p className="cell-sub" style={{ margin: 0 }}>Start a draft to change how your applications mask data.</p><div><StartDraftButton /></div><Link href={BASE} className="row-link">Back to Masking Policy</Link></div></div>
  );

  const [grid, checks, impact, categories, active] = await Promise.all([
    getGrid(draft.id), getChecks(draft.id), getImpact(draft.id), getCategories(), getActiveVersion(),
  ]);
  const liveView = active ? await getGrid(active.id) : null;
  if (!grid) return null;

  const decisionItems = grid.rows.filter((r) => r.status === "needs_decision").map((r) => ({ code: r.code, displayName: r.displayName, sampleValue: r.sampleValue, categoryId: r.categoryId }));
  const readyRows = grid.rows.filter((r) => r.status === "ready");
  const savedAt = new Date(draft.updatedAt).toISOString().slice(11, 16);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <WorkspaceBar draftNumber={draft.number} basedOn={draft.basedOn} savedAt={savedAt} decisionsOpen={decisionItems.length} checks={checks} impact={impact} />
      <SeedBanner vid={draft.id} ready={readyRows.length} need={decisionItems.length} readyCodes={readyRows.map((r) => r.code)} />

      <div className="mp-workspace">
        <div className="mp-workspace-main">
          <div id="mp-decisions">
            <DecisionsInbox vid={draft.id} items={decisionItems} categories={categories.map((c) => ({ id: c.id, name: c.name, definition: c.definition }))} />
          </div>
          <PolicyGrid view={grid} />
        </div>
        <aside className="mp-workspace-side">
          <div className="mp-card">
            <h4 className="mp-card-h">Preview</h4>
            <PreviewPanel draft={grid} live={liveView} startVersion="draft" />
          </div>
        </aside>
      </div>
    </div>
  );
}
