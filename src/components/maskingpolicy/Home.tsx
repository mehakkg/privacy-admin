import Link from "next/link";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { getHome, getActiveVersion, getGrid } from "@/lib/engines/maskingpolicy";
import { StartDraftButton, ContinueDraftButton, DiscardMenu } from "@/components/maskingpolicy/PolicyActions";
import { HomeWhoSees } from "@/components/maskingpolicy/HomeWhoSees";

const BASE = "/data-flow/masking-policy";
const SEV: Record<string, { word: string; dot: string }> = { check: { word: "Check", dot: "var(--red)" }, decide: { word: "Decide", dot: "var(--yellow-700, #b45309)" }, heads_up: { word: "Heads up", dot: "var(--text-4, #94a3b8)" } };

/** SCREEN 1 — Home. One hero (the only raised card). Live version stated once. */
export async function Home({ see }: { see?: string }) {
  const home = await getHome();
  const active = await getActiveVersion();
  const liveView = active ? await getGrid(active.id) : null;

  // The one primary action, first that applies.
  let primary: React.ReactNode;
  if (home.draft) primary = <ContinueDraftButton />;
  else if (!home.active) primary = <StartDraftButton label="Review recommended policy" />;
  else if (home.decisionsOpen > 0) primary = <StartDraftButton label={`Review ${home.decisionsOpen} new fields`} />;
  else primary = <StartDraftButton />;

  return (
    <div className="stack" style={{ gap: 20, maxWidth: 880 }}>
      {/* Hero — the single raised card */}
      <section className="mp-hero">
        <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
          {home.active ? <ShieldCheck size={22} style={{ color: "var(--green)", flexShrink: 0 }} /> : <ShieldAlert size={22} style={{ color: "var(--yellow-700, #b45309)", flexShrink: 0 }} />}
          <div className="stack" style={{ gap: 4 }}>
            {home.active ? (
              <>
                <div className="mp-hero-title">Version {home.active.number} is protecting all your applications.</div>
                <div className="cell-sub">Activated by {home.active.activatedBy} on {home.active.activatedAt}.{home.active.whyNote && <> &ldquo;{home.active.whyNote}&rdquo;</>}</div>
              </>
            ) : (
              <>
                <div className="mp-hero-title">Your applications aren&rsquo;t using a masking policy yet.</div>
                <div className="cell-sub">Every sensitive field is fully hidden. That&rsquo;s safe, but not yet tailored to your business. Nothing changes in your applications until you activate.</div>
              </>
            )}
          </div>
        </div>
        <div className="mp-hero-divider" />
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          {home.draft ? (
            <>
              <div className="stack" style={{ gap: 2 }}>
                <strong>Draft {home.draft.number} in progress</strong>
                <span className="cell-sub">{home.draft.changes} change{home.draft.changes === 1 ? "" : "s"} · saved {home.draft.savedAt}</span>
              </div>
              <div className="row" style={{ gap: 8, alignItems: "center" }}><ContinueDraftButton /><DiscardMenu /></div>
            </>
          ) : (
            <>
              <span className="cell-sub">{home.active ? "No draft in progress." : "Start when you're ready."}</span>
              <div>{primary}</div>
            </>
          )}
        </div>
      </section>

      {/* Needs attention */}
      <section>
        <h4 className="mp-section-h">Needs attention</h4>
        {home.attention.length === 0 ? <p className="cell-sub">Nothing needs your attention.</p> : (
          <div className="mp-attn-list">
            {home.attention.slice(0, 5).map((a) => (
              <div key={a.id} className="mp-attn-row">
                <span className="mp-attn-sev"><span className="mp-doticon" style={{ background: SEV[a.severity].dot }} /> {SEV[a.severity].word}</span>
                <div className="stack" style={{ gap: 1, flex: 1 }}><span>{a.title}</span><span className="cell-sub">{a.consequence}</span></div>
                <Link href={a.target} className="row-link">{a.verb}</Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Who sees what */}
      <section>
        <h4 className="mp-section-h">Who sees what</h4>
        <HomeWhoSees view={liveView} startAudience={see ?? "Everyone"} />
      </section>

      {/* Versions — one line */}
      <section>
        <h4 className="mp-section-h">Versions</h4>
        {home.prevVersion ? <p className="cell-sub" style={{ margin: 0 }}>Version {home.prevVersion.number} · {home.prevVersion.when} · {home.prevVersion.who} · <Link href={`${BASE}?versions=1`} className="row-link">All versions ({home.versionCount})</Link></p>
          : <p className="cell-sub" style={{ margin: 0 }}><Link href={`${BASE}?versions=1`} className="row-link">All versions ({home.versionCount})</Link></p>}
      </section>
    </div>
  );
}
