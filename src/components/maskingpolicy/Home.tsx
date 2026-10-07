import Link from "next/link";
import { ShieldCheck, ShieldAlert, AlertTriangle } from "lucide-react";
import { getHome, getActiveVersion, getGrid } from "@/lib/engines/maskingpolicy";
import { StartDraftButton, ContinueDraftButton, DiscardMenu } from "@/components/maskingpolicy/PolicyActions";
import { WhatVersionDoes } from "@/components/maskingpolicy/WhatVersionDoes";

const MP = "/data-flow/masking-policy";
const SEV: Record<string, { word: string; dot: string }> = {
  check: { word: "Check", dot: "var(--red)" },
  decide: { word: "Decide", dot: "var(--yellow-700, #b45309)" },
  next_step: { word: "Next step", dot: "var(--blue)" },
  heads_up: { word: "Heads up", dot: "var(--text-4, #94a3b8)" },
};

/** SCREEN 1 — Home. Two columns: hero + "What version N does" (main), Needs
 *  attention (right). The live version is stated once, in the hero. */
export async function Home({ see, chan }: { see?: string; chan?: string }) {
  const home = await getHome();
  const active = await getActiveVersion();
  const liveView = active ? await getGrid(active.id) : null;

  // At-a-glance strip from the active version.
  const strip = liveView ? (() => {
    const protectedN = liveView.rows.filter((r) => r.status !== "not_used" && !r.baseline.hidden).length;
    const regulated = liveView.rows.filter((r) => r.regulated).length;
    const exceptions = liveView.audiences.reduce((n, a) => n + liveView.rows.filter((r) => { const c = r.audiences.find((x) => x.audienceId === a.id); return c && (c.kind === "more" || c.kind === "full_raw"); }).length, 0);
    const audiencesMore = liveView.exposure.more;
    const channels = liveView.channels.length;
    const cells = [
      { n: protectedN, label: "fields protected" },
      { n: audiencesMore, label: "audiences see more" },
      { n: exceptions, label: "exceptions" },
      { n: channels, label: "channels" },
      { n: regulated, label: "protected by law" },
    ].filter((c) => c.n > 0);
    return { cells, hasExceptions: exceptions > 0 };
  })() : null;

  // The one primary action (first that applies), when there is no draft.
  let primary: React.ReactNode;
  if (!home.active) primary = <StartDraftButton label="Review recommended policy" />;
  else if (home.decisionsOpen > 0) primary = <StartDraftButton label={`Review ${home.decisionsOpen} new fields`} />;
  else primary = <StartDraftButton />;

  return (
    <div className="mp-home">
      <div className="mp-home-main stack" style={{ gap: 18 }}>
        {/* Hero */}
        <section className="mp-hero">
          <div className="row" style={{ gap: 10, alignItems: "flex-start", justifyContent: "space-between" }}>
            <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
              {home.active ? <ShieldCheck size={20} style={{ color: "var(--green)", flexShrink: 0, marginTop: 2 }} /> : <ShieldAlert size={20} style={{ color: "var(--yellow-700, #b45309)", flexShrink: 0, marginTop: 2 }} />}
              <div className="stack" style={{ gap: 3 }}>
                {home.active ? (
                  <>
                    <div className="mp-hero-title">Version {home.active.number} is protecting all your applications.</div>
                    <div className="cell-sub">Activated by {home.active.activatedBy} on {home.active.activatedAt}.</div>
                    {home.active.whyNote && <div className="cell-sub">Reason: &ldquo;{home.active.whyNote}&rdquo;</div>}
                    {home.attention.length === 0 && <div className="cell-sub" style={{ color: "var(--green)" }}>Nothing needs your attention.</div>}
                  </>
                ) : (
                  <>
                    <div className="mp-hero-title">Your applications aren&rsquo;t using a masking policy yet.</div>
                    <div className="cell-sub">Every sensitive field is fully hidden. That&rsquo;s safe, but not yet tailored to your business. Nothing changes in your applications until you activate.</div>
                  </>
                )}
              </div>
            </div>
            {home.active && <Link href={`${MP}?version=${home.active.number}`} className="row-link" style={{ flexShrink: 0 }}>View version {home.active.number}</Link>}
          </div>

          {/* At-a-glance strip */}
          {home.active && strip && (
            <>
              <div className="mp-hero-hr" />
              {strip.hasExceptions ? (
                <div className="mp-glance">{strip.cells.map((c) => <div key={c.label} className="mp-glance-cell"><span className="mp-glance-n">{c.n}</span><span className="mp-glance-l">{c.label}</span></div>)}</div>
              ) : <div className="cell-sub">No audience sees more than everyone else.</div>}
            </>
          )}

          {/* Draft row */}
          {home.active && <div className="mp-hero-hr" />}
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            {home.draft ? (
              <>
                <div className="stack" style={{ gap: 2 }}>
                  <strong>Draft {home.draft.number} in progress</strong>
                  <span className="cell-sub">{home.draft.changes} changes · saved {home.draft.savedAt}</span>
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

        {/* What version N does */}
        {liveView && active ? <WhatVersionDoes view={liveView} number={active.number} startAudience={see} startChannel={chan} />
          : <section className="stack" style={{ gap: 6 }}><h3 style={{ margin: 0, fontSize: 16 }}>What people see today</h3><p className="cell-sub" style={{ margin: 0 }}>Every sensitive field is fully hidden for everyone.</p></section>}
      </div>

      {/* Needs attention (right column) */}
      <aside className="mp-home-side">
        <div className="mp-attn-head"><h3 style={{ margin: 0, fontSize: 15 }}>Needs attention</h3><span className="cell-sub">{home.attention.length}</span></div>
        {home.attention.length === 0 ? <p className="cell-sub">Nothing needs your attention.</p> : (
          <div className="mp-attn2">
            {home.attention.map((a) => (
              <div key={a.id} className="mp-attn2-item">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="mp-attn-sev" style={{ color: SEV[a.severity].dot }}><span className="mp-doticon" style={{ background: SEV[a.severity].dot }} /> {SEV[a.severity].word}</span>
                  <span className="cell-sub">{a.ageText}</span>
                </div>
                <div className="mp-attn2-title">{a.title}</div>
                <div className="cell-sub">{a.detail}</div>
                <div className="row" style={{ marginTop: 6 }}><Link href={a.href} className="btn ghost sm">{a.severity === "check" ? <AlertTriangle size={12} /> : null}{a.verb}</Link></div>
                <div className="cell-sub mp-attn2-dest">{a.destination}</div>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
