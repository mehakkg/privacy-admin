import { redirect } from "next/navigation";
import { getOnboarding, resumeStep } from "@/lib/engines/onboarding";
import { ONBOARDING_STEPS } from "@/lib/domain";

/**
 * ONBOARDING GATE
 *
 * Onboarding is ORG-level, one-time setup — not a per-user preference. The
 * state lives in a single `OnboardingState` row, so:
 *
 *   - a second admin logging into a half-configured org resumes the SAME
 *     wizard at the SAME step rather than starting a fresh copy, and
 *   - an admin joining a fully-configured org never sees the wizard at all.
 *
 * Both fall out of the data model rather than needing special handling.
 *
 * WHAT BLOCKS: only Screen 1, the mandatory escalation-routing gate. Skipped
 * technical steps (2, 3, 5, 6) do NOT block — they surface on the persistent
 * setup strip instead. Re-triggering the whole wizard for a deferral would
 * punish the deferral the wizard explicitly allows.
 *
 * WHY THIS IS SERVER-SIDE: `redirect()` from a server component aborts the
 * render before any HTML is produced, so the dashboard is never sent. A
 * client-side redirect-after-render would briefly paint a screen that is meant
 * to be unreachable — which is a real exposure here, not a cosmetic flicker.
 */
export async function requireOnboardingGate(): Promise<void> {
  const state = await getOnboarding();
  if (state.gateCleared) return;

  const step = ONBOARDING_STEPS.find((s) => s.n === resumeStep(state));
  redirect(`/onboarding/${step?.slug ?? "escalation"}`);
}
