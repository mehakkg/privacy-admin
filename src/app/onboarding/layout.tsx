import type { ReactNode } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { getOnboarding, stepStatus } from "@/lib/engines/onboarding";
import { ONBOARDING_STEPS } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * Wizard chrome.
 *
 * The rail is a progress indicator, not free navigation. Steps ahead of the
 * mandatory gate are not clickable until the gate clears — the structure is a
 * reordered LINEAR wizard, and a rail that let you jump straight to step 5
 * would quietly turn it into the free-order checklist that was rejected for
 * exactly this reason.
 *
 * Completed and skipped steps ARE clickable, so a decision can be revisited.
 */
export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  const state = await getOnboarding();

  return (
    <Shell active="/onboarding" title="Setup">
      <div className="wiz">
        <nav className="wiz-rail">
          {ONBOARDING_STEPS.map((step) => {
            const status = stepStatus(state, step.n);
            const reachable =
              step.n === 1 || state.gateCleared || status !== "pending";
            const isCurrent = state.currentStep === step.n;

            const inner = (
              <>
                <span className="wiz-rail-num">
                  {step.n}
                  {status === "done" && <span style={{ color: "var(--green)" }}>✓</span>}
                  {status === "skipped" && (
                    <span style={{ color: "var(--yellow)" }}>skipped</span>
                  )}
                  {!step.skippable && status === "pending" && (
                    <span style={{ color: "var(--red)" }}>required</span>
                  )}
                </span>
                <span className="wiz-rail-label">{step.label}</span>
              </>
            );

            if (!reachable) {
              return (
                <span
                  key={step.n}
                  className="wiz-rail-step locked"
                  title="Complete step 1 first — escalation routing has to be set before anything else."
                >
                  {inner}
                </span>
              );
            }

            return (
              <Link
                key={step.n}
                href={`/onboarding/${step.slug}`}
                className={`wiz-rail-step${isCurrent ? " current" : ""}`}
              >
                {inner}
              </Link>
            );
          })}
        </nav>

        {children}
      </div>
    </Shell>
  );
}
