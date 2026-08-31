import Link from "next/link";
import { db } from "@/lib/db";
import { Card, Notice, PageHead, Pill, formatDateTime } from "@/components/ui";
import { FinishButton } from "@/components/onboardingForms";
import { getOnboarding, stepStatus } from "@/lib/engines/onboarding";
import { ONBOARDING_STEPS, SKIP_CONSEQUENCE, SKIP_CONSEQUENCE_SHORT } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * SCREEN 7 — Completion Summary. ALWAYS requires explicit action.
 *
 * Tone is informative, not celebratory. A compliance product summarising an
 * incomplete setup should not read as congratulations — "You're all set!" over
 * a list of four skipped steps is the product lying to the person who has to
 * answer for it.
 *
 * Every skipped item states what it costs, not just that it was skipped. And
 * Screen 1's items are structurally absent from the skipped column: they were
 * never skippable, so they cannot appear there.
 */
export default async function SummaryStep() {
  const state = await getOnboarding();

  // If the summary data cannot be read we still render the screen from the
  // onboarding row rather than blocking the completion step behind a failed
  // fetch — being unable to count processors is not a reason to trap someone in
  // a wizard.
  let counts: {
    sources: number;
    scanned: number;
    fields: number;
    processors: number;
    drafts: number;
    routes: number;
  } | null = null;
  let countsFailed = false;
  try {
    const [sources, scanned, fields, processors, drafts, routes] = await Promise.all([
      db.discoverySource.count(),
      db.discoverySource.count({ where: { scanStatus: "scanned" } }),
      db.classifiedField.count(),
      db.dataProcessor.count(),
      db.dataProcessor.count({ where: { dpaStatus: "draft" } }),
      db.notificationRoute.count(),
    ]);
    counts = { sources, scanned, fields, processors, drafts, routes };
  } catch {
    countsFailed = true;
  }

  const done = ONBOARDING_STEPS.filter((s) => stepStatus(state, s.n) === "done");
  const skipped = ONBOARDING_STEPS.filter((s) => stepStatus(state, s.n) === "skipped");
  const pending = ONBOARDING_STEPS.filter(
    (s) => s.n < 7 && stepStatus(state, s.n) === "pending",
  );

  const technicalSkipped = skipped.length + pending.length;

  // Three honest headings, not two. The middle case — gate cleared, most
  // technical work deferred — is the one that most wants to read as "you're all
  // set!", and it is precisely the one where that would be a lie. And if the
  // mandatory gate itself is still outstanding, nothing here is "complete" at
  // all, whatever else has been done.
  const heading = !state.gateCleared
    ? {
        title: "Setup is not complete",
        subtitle:
          "The one required step — escalation routing and retention awareness — has not been confirmed. Until it is, a retention conflict has nowhere to escalate and deletion requests run without a retention check.",
      }
    : technicalSkipped >= 3
      ? {
          title: "Minimum compliance setup complete",
          subtitle:
            "Escalation routing and retention awareness are configured, so a deletion request has somewhere to escalate and a retention check to run. Technical configuration is still needed before requests can actually be fulfilled.",
        }
      : {
          title: "Setup complete",
          subtitle: "Escalation routing is set and the technical configuration is in place.",
        };

  return (
    <div className="stack">
      <PageHead
        title={heading.title}
        subtitle={heading.subtitle}
        actions={
          state.completedAt ? (
            <Pill tone="green">Completed {formatDateTime(state.completedAt)}</Pill>
          ) : (
            <Pill tone="yellow">Not yet confirmed</Pill>
          )
        }
      />

      {!state.gateCleared && (
        <Notice tone="danger" title="The required step is still outstanding">
          Step 1 is the only step that cannot be skipped, and it has not been
          confirmed. Finish it before treating this setup as done.
          <div style={{ marginTop: 8 }}>
            <Link href="/onboarding/escalation" className="btn primary sm">
              Go to step 1
            </Link>
          </div>
        </Notice>
      )}

      {countsFailed && (
        <Notice tone="warn" title="Could not load the configuration counts">
          The summary below is built from your saved setup state, which is
          intact. Only the live counts failed to load.
          <div style={{ marginTop: 8 }}>
            <Link href="/onboarding/summary" className="btn sm">
              Refresh
            </Link>
          </div>
        </Notice>
      )}

      <div className="grid-2">
        <Card title={`Done (${done.length})`}>
          {done.length === 0 ? (
            <div className="empty">Nothing confirmed yet.</div>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {done.map((s) => (
                <div key={s.n} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                  <span style={{ color: "var(--green)", fontWeight: 600 }}>✓</span>
                  <div>
                    <div style={{ fontWeight: 500 }}>{s.label}</div>
                    {s.n === 1 && (
                      <div className="cell-sub">
                        Retention conflicts and policy exceptions now route to a
                        named contact.
                        {state.governanceUnavailableAcknowledged && (
                          <>
                            {" "}
                            <strong style={{ color: "var(--red)" }}>
                              Confirmed without governance data — logged as a
                              risk acknowledgment.
                            </strong>
                          </>
                        )}
                      </div>
                    )}
                    {s.n === 2 && counts && (
                      <div className="cell-sub">{counts.sources} source(s) connected.</div>
                    )}
                    {s.n === 3 && counts && (
                      <div className="cell-sub">
                        {counts.scanned} source(s) scanned, {counts.fields} fields found.
                      </div>
                    )}
                    {s.n === 4 && counts && (
                      <div className="cell-sub">
                        {counts.fields} field classifications confirmed by you.
                      </div>
                    )}
                    {s.n === 5 && counts && (
                      <div className="cell-sub">
                        {counts.processors} processor(s) registered
                        {counts.drafts > 0 && `, ${counts.drafts} blocked pending DPA`}.
                      </div>
                    )}
                    {s.n === 6 && counts && (
                      <div className="cell-sub">{counts.routes} event route(s) set.</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={`Skipped (${technicalSkipped})`}>
          {technicalSkipped === 0 ? (
            <div className="empty">Nothing skipped.</div>
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              {[...skipped, ...pending].map((s) => (
                <div key={s.n}>
                  <div className="row" style={{ gap: 8 }}>
                    <span style={{ color: "var(--yellow)", fontWeight: 600 }}>—</span>
                    <span style={{ fontWeight: 500 }}>{s.label}</span>
                    <Pill tone="yellow">
                      {stepStatus(state, s.n) === "skipped" ? "Skipped" : "Not started"}
                    </Pill>
                  </div>
                  <details className="why">
                    <summary>
                      {SKIP_CONSEQUENCE_SHORT[s.n] ?? "Still to be configured."}
                    </summary>
                    <p>{SKIP_CONSEQUENCE[s.n] ?? "Still to be configured."}</p>
                  </details>
                  <div style={{ margin: "5px 0 0 20px" }}>
                    <Link href={`/onboarding/${s.slug}`} className="btn xs">
                      Do it now
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="cell-sub" style={{ marginTop: 14, marginBottom: 0 }}>
            Escalation routing and retention awareness cannot appear in this
            column — they were never skippable.
          </p>
        </Card>
      </div>

      {technicalSkipped > 0 && (
        <Notice tone="warn" title="These stay on your dashboard until resolved">
          The skipped items become a &ldquo;Complete your setup&rdquo; strip on
          the request queue. It does not go away on its own, and it is not
          dismissible — deferring is fine, forgetting is not.
        </Notice>
      )}

      <Card title="Finish">
        <p style={{ marginTop: 0 }}>
          Confirming records the completion in the audit trail with what was done
          and what was left, so the state of this setup is answerable later.
        </p>
        {state.gateCleared ? (
          <FinishButton />
        ) : (
          <p className="cell-sub" style={{ marginBottom: 0 }}>
            Not available until step 1 is confirmed. Skipped technical steps are
            fine to finish around; the required one is not.
          </p>
        )}
      </Card>
    </div>
  );
}
