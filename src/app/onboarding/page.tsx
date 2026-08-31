import { redirect } from "next/navigation";
import { getOnboarding, resumeStep } from "@/lib/engines/onboarding";
import { ONBOARDING_STEPS } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * Resume entry point. /onboarding always lands on the step actually left off,
 * so a closed tab costs nothing.
 */
export default async function OnboardingIndex() {
  const state = await getOnboarding();
  const n = resumeStep(state);
  const slug = ONBOARDING_STEPS.find((s) => s.n === n)?.slug ?? "escalation";
  redirect(`/onboarding/${slug}`);
}
