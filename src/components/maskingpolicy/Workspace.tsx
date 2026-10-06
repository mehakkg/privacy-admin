import Link from "next/link";
import { getDraft, getActiveVersion, getGrid, getImpact, getChecks, getCategories } from "@/lib/engines/maskingpolicy";
import { StartDraftButton, DiscardMenu } from "@/components/maskingpolicy/PolicyActions";
import { WorkspaceRail, type RailItem } from "@/components/maskingpolicy/WorkspaceRail";
import { DecisionsInbox } from "@/components/maskingpolicy/DecisionsInbox";
import { EveryoneFields } from "@/components/maskingpolicy/EveryoneFields";
import { AudiencePane } from "@/components/maskingpolicy/AudiencePane";

const MP = "/data-flow/masking-policy";

export async function Workspace({ focus }: { focus?: string }) {
  const draft = await getDraft();
  if (!draft) return <div className="mp-card"><div className="stack" style={{ gap: 8 }}><h3 style={{ margin: 0 }}>No draft in progress.</h3><p className="cell-sub" style={{ margin: 0 }}>Start a draft to change how your applications mask data.</p><div><StartDraftButton /></div><Link href={MP} className="row-link">Back to Masking policy</Link></div></div>;

  const [grid, impact, checks, categories, active] = await Promise.all([getGrid(draft.id), getImpact(draft.id), getChecks(draft.id), getCategories(), getActiveVersion()]);
  const liveView = active ? await getGrid(active.id) : null;
  if (!grid) return null;

  const decisionItems = grid.rows.filter((r) => r.status === "needs_decision").map((r) => ({ code: r.code, displayName: r.displayName, sampleValue: r.sampleValue, categoryId: r.categoryId }));
  const blocking = checks.filter((c) => c.level === "blocking" && !c.ok).length;
  const changesFor = (audienceLabel: string) => impact.items.filter((i) => i.audienceLabel === audienceLabel).length;

  // Focus resolution
  const f = focus ?? "everyone";
  const audienceId = f.startsWith("audience:") ? f.slice(9) : null;
  const focusField = f.startsWith("field:") ? f.slice(6) : null;
  const curAudience = audienceId ? grid.audiences.find((a) => a.id === audienceId) ?? null : null;

  // Rail
  const rail: RailItem[] = [
    { kind: "item", key: "everyone", label: "Everyone", focus: "everyone", current: !audienceId, status: decisionItems.length ? `${decisionItems.length} to decide` : "Ready", accent: decisionItems.length > 0 },
    { kind: "label", key: "lbl", label: "Audiences" },
    ...grid.audiences.map((a): RailItem => ({ kind: "item", key: a.id, label: a.label, focus: `audience:${a.id}`, current: audienceId === a.id, audienceId: a.id, status: changesFor(a.label) ? `${changesFor(a.label)} changes` : "No changes" })),
    { kind: "divider", key: "d1" },
    { kind: "review", key: "review", label: "Review and activate", status: blocking ? `Fix ${blocking} issues` : `${impact.counts.changes} changes`, accent: blocking > 0 },
  ];

  // Bottom bar step order: everyone → audiences → review
  const order = ["everyone", ...grid.audiences.map((a) => `audience:${a.id}`)];
  const curIdx = audienceId ? order.indexOf(`audience:${audienceId}`) : 0;
  const prev = curIdx > 0 ? order[curIdx - 1] : null;
  const nextFocus = curIdx < order.length - 1 ? order[curIdx + 1] : null;
  const nextLabel = nextFocus ? (nextFocus === "everyone" ? "Everyone" : grid.audiences.find((a) => `audience:${a.id}` === nextFocus)?.label) : "Review and activate";
  const nextHref = nextFocus ? `${MP}?view=workspace&focus=${nextFocus}` : `${MP}?view=review`;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="mp-ws-top">
        <div className="stack" style={{ gap: 2 }}>
          <div className="row" style={{ gap: 8, alignItems: "baseline" }}><strong style={{ fontSize: 18 }}>Draft {draft.number}</strong><span className="cell-sub">based on version {draft.basedOn} · saved {new Date(draft.updatedAt).toISOString().slice(11, 16)}</span></div>
        </div>
        <DiscardMenu />
      </div>

      <div className="mp-ws">
        <WorkspaceRail items={rail} vid={draft.id} />
        <div className="mp-ws-pane">
          {curAudience ? (
            <AudiencePane view={grid} liveView={liveView} audienceId={curAudience.id} audienceLabel={curAudience.label} />
          ) : (
            <div className="stack" style={{ gap: 14 }}>
              <div className="stack" style={{ gap: 2 }}><h3 style={{ margin: 0 }}>What everyone sees</h3><span className="cell-sub">Start from our recommendation. Change only what doesn&rsquo;t fit.</span></div>
              {decisionItems.length > 0 && <div id="mp-decisions"><DecisionsInbox vid={draft.id} items={decisionItems} categories={categories.map((c) => ({ id: c.id, name: c.name, definition: c.definition }))} /></div>}
              <EveryoneFields view={grid} focusField={focusField} />
            </div>
          )}

          <div className="mp-ws-bottom">
            {prev ? <Link href={`${MP}?view=workspace&focus=${prev}`} className="btn ghost">Back</Link> : <span />}
            <Link href={nextHref} className="btn primary">Next: {nextLabel}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
