/** Scenario-6 shared constants — pure, client-safe. */

/** The device/browser QA matrix a notice variant must pass before publish. */
export const DEVICE_MATRIX: { device: string; browser: string; method: "automated" | "manual" }[] = [
  { device: "Desktop", browser: "Chrome", method: "automated" },
  { device: "Desktop", browser: "Safari", method: "automated" },
  { device: "iOS (iPhone)", browser: "Safari", method: "automated" },
  { device: "Android (modern)", browser: "Chrome", method: "automated" },
  { device: "Android (legacy)", browser: "Chrome", method: "manual" },
];

export const DEVICE_STATUS_TONE: Record<string, "gray" | "green" | "red"> = { not_run: "gray", pass: "green", fail: "red" };
export const DEVICE_STATUS_LABEL: Record<string, string> = { not_run: "Not run", pass: "Pass", fail: "Fail" };

export const VARIANT_PUBLISH_TONE: Record<string, "gray" | "yellow" | "blue" | "green"> = { draft: "gray", qa_pending: "yellow", qa_passed: "blue", published: "green" };
export const VARIANT_PUBLISH_LABEL: Record<string, string> = { draft: "Draft", qa_pending: "QA pending", qa_passed: "QA passed", published: "Published" };

export const FINDING_ISSUE = {
  undisclosed: "Undisclosed script — not declared in the cookie policy",
  pre_consent: "Fired before the consent event was recorded",
};
