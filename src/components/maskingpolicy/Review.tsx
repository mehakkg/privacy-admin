import Link from "next/link";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { getDraft, getReview } from "@/lib/engines/maskingpolicy";
import { ActivateForm } from "@/components/maskingpolicy/ActivateForm";
import type { ReviewChangeField } from "@/lib/engines/maskingpolicy";

const MP = "/data-flow/masking-policy";

function ChangeRow({ c }: { c: ReviewChangeField }) {
  return (
    <details className="mp-change">
      <summary>
        <span className="mp-change-main">
          <span className="cell-primary">{c.fieldName}</span>
          {c.everyone && <span className="mono cell-sub"> {c.everyone.before} → {c.everyone.after}</span>}
          <span className="cell-sub"> · {c.everyone ? c.everyone.descriptor : c.audiences[0]?.descriptor}</span>
        </span>
        <span className="cell-sub">{c.who}{c.inheritedNote ? " (including all audiences that follow it)" : ""}</span>
      </summary>
      {c.audiences.length > 0 && (
        <div className="stack" style={{ gap: 4, marginTop: 6, paddingLeft: 10 }}>
          {c.audiences.map((a, i) => <div key={i} className="cell-sub">{a.label}: <span className="mono">{a.before} → {a.after}</span>{a.channelLabel ? ` · only on ${a.channelLabel}` : ""}{a.fullRaw ? " · full raw" : ""}</div>)}
        </div>
      )}
    </details>
  );
}

/** SCREEN 4 — Review and activate. Verdict first, one risk callout, changes by field. */
export async function Review() {
  const draft = await getDraft();
  if (!draft) return <div className="mp-card"><p>No draft to review. <Link href={MP} className="row-link">Back to Masking policy</Link></p></div>;
  const review = await getReview(draft.id);
  if (!review) return null;

  const more = review.changes.filter((c) => c.direction === "more");
  const less = review.changes.filter((c) => c.direction === "less");
  const neutral = review.changes.filter((c) => c.direction === "neutral");
  const bothDirections = more.length > 0 && less.length > 0;

  return (
    <div className="stack" style={{ gap: 18, maxWidth: 820 }}>
      <div><Link href={`${MP}?view=workspace`} className="row-link">← Back to draft</Link></div>

      {/* Verdict */}
      <div className="stack" style={{ gap: 6 }}>
        {review.verdict === "nothing_to_activate" ? (
          <h2 style={{ margin: 0 }}>Nothing to activate.</h2>
        ) : review.verdict === "blocked" ? (
          <div className="row" style={{ gap: 8, alignItems: "center" }}><AlertTriangle size={22} style={{ color: "var(--red)" }} /><h2 style={{ margin: 0 }}>Fix {review.issues.length} issue{review.issues.length === 1 ? "" : "s"} before activating</h2></div>
        ) : (
          <div className="row" style={{ gap: 8, alignItems: "center" }}><CheckCircle2 size={22} style={{ color: "var(--green)" }} /><h2 style={{ margin: 0 }}>Ready to activate version {review.number}</h2></div>
        )}
        {review.verdict === "nothing_to_activate" ? (
          <p className="cell-sub" style={{ margin: 0 }}>Display names and sample values save automatically and don&rsquo;t create a version.</p>
        ) : <p className="cell-sub" style={{ margin: 0 }}>{review.summary}</p>}
        {review.verdict === "blocked" && (
          <div className="stack" style={{ gap: 4, marginTop: 4 }}>
            {review.issues.map((iss, i) => <Link key={i} href={iss.target} className="row" style={{ gap: 6, color: "var(--red)" }}><AlertTriangle size={13} /> {iss.message}</Link>)}
          </div>
        )}
      </div>

      {/* Risk callout — the one raised block */}
      {review.risks.length > 0 && (
        <section className="mp-risk">
          <strong>Look closely at this one</strong>
          <div className="stack" style={{ gap: 4, marginTop: 6 }}>
            {review.risks.map((r, i) => <div key={i}>{r.type === "full_raw" ? `${r.audience} will see ${r.field} as the full raw value.${r.reason ? ` Reason given: ${r.reason}.` : ""}` : `Everyone will see more of ${r.field}, which is protected by law — confirm it still meets the legal minimum.`}</div>)}
          </div>
        </section>
      )}

      {/* What changes */}
      {review.verdict !== "nothing_to_activate" && review.changes.length > 0 && (
        <section>
          <h4 className="mp-section-h">What changes</h4>
          {bothDirections ? (
            <>
              <div className="mp-change-group-h">Shows more</div>
              {more.map((c) => <ChangeRow key={c.fieldCode} c={c} />)}
              <div className="mp-change-group-h" style={{ marginTop: 10 }}>Shows less</div>
              {less.map((c) => <ChangeRow key={c.fieldCode} c={c} />)}
              {neutral.map((c) => <ChangeRow key={c.fieldCode} c={c} />)}
            </>
          ) : review.changes.map((c) => <ChangeRow key={c.fieldCode} c={c} />)}
        </section>
      )}

      {/* Undecided */}
      {review.undecided.length > 0 && (
        <p className="cell-sub" style={{ margin: 0 }}>Stays fully hidden: {review.undecided.join(", ")}. <Link href={`${MP}?view=workspace&focus=decisions`} className="row-link">Decide</Link></p>
      )}

      {/* Reason + activate */}
      {review.verdict === "nothing_to_activate" ? (
        <div><Link href={`${MP}?view=workspace`} className="btn">Back to draft</Link></div>
      ) : (
        <ActivateForm vid={draft.id} number={draft.number} blocked={review.verdict === "blocked"} issueCount={review.issues.length} />
      )}
    </div>
  );
}
