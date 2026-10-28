import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Retired — the September onboarding wizard is replaced by the setup flow. */
export default function OnboardingRedirect() {
  redirect("/setup/profile");
}
