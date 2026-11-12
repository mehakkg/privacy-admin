import { SetupWizard } from "@/components/setup/SetupWizard";

export const dynamic = "force-dynamic";

/**
 * Setup wizard route (comp rebuild) — the three-step foundation flow, reached
 * from "Create your privacy workspace" on sign-in and the first-time Overview.
 * Standalone full-page flow; does not go through the operational setup gate.
 */
export default function SetupWizardPage() {
  return <SetupWizard />;
}
