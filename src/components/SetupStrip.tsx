import Link from "next/link";
import { getOnboarding, stepStatus } from "@/lib/engines/onboarding";
import { ONBOARDING_STEPS, SKIP_CONSEQUENCE } from "@/lib/domain";

/**
 * "Complete your setup" strip.
 *
 * Deliberately not dismissible. A skipped compliance step that can be waved
 * away is a skipped compliance step nobody comes back to, and the whole reason
 * the wizard allows skipping at all is that the deferral stays visible.
 *
 * Renders nothing once everything is resolved.
 */
export async function SetupStrip() {
  const state = await getOnboarding();

  // Before the mandatory gate is cleared, the prompt is to finish the gate, not
  // a list of optional leftovers.
  if (!state.gateCleared) {
    return (
      <div className="notice danger" style={{ marginBottom: 16 }}>
        <div className="notice-title">Setup is not complete — escalation routing is unset</div>
        <div>
          Retention conflicts have nowhere to go until an escalation contact is
          set, and Admin cannot rule on them. This is the one step that cannot be
          skipped.{" "}
          <Link href="/onboarding/escalation">Finish setup →</Link>
        </div>
      </div>
    );
  }

  const outstanding = ONBOARDING_STEPS.filter(
    (s) => s.n > 1 && s.n < 7 && stepStatus(state, s.n) !== "done",
  );
  if (outstanding.length === 0) return null;

  return (
    <div className="notice warn" style={{ marginBottom: 16 }}>
      <div className="notice-title">
        Complete your setup — {outstanding.length} step
        {outstanding.length === 1 ? "" : "s"} outstanding
      </div>
      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
        {outstanding.map((s) => (
          <li key={s.n} style={{ marginBottom: 3 }}>
            <Link href={`/onboarding/${s.slug}`}>{s.label}</Link> —{" "}
            {SKIP_CONSEQUENCE[s.n] ?? "still to be configured."}
          </li>
        ))}
      </ul>
      {state.governanceUnavailableAcknowledged && (
        <div style={{ marginTop: 8, color: "var(--red)", fontWeight: 500 }}>
          Setup was confirmed without governance configuration. Escalation
          routing and retention checks are unset until the Governance Portal
          loads — re-run step 1 once it is reachable.
        </div>
      )}
      {!state.escalationContactActorId && (
        <div style={{ marginTop: 8, color: "var(--red)", fontWeight: 500 }}>
          No DPO is assigned, so escalations will queue unruled until one is set.
        </div>
      )}
    </div>
  );
}
