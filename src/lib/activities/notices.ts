/**
 * Which published notice each purpose appears in (Data Map redesign). Pure fixture
 * constant — a consent-based purpose not listed here is "not in any notice", which
 * drives the "Needs a notice" readiness state and the Purposes page warning. Kept
 * as data (not a DB column) so the seed never depends on a DDL migration at deploy.
 * Keyed by the purpose's exact name.
 */
export const NOTICE_BY_PURPOSE: Record<string, string> = {
  "KYC & identity verification": "Account opening notice v3",
  "Credit assessment": "Loan application notice v2",
  "Fraud detection": "Account opening notice v3",
  "Recovery & collections": "Loan application notice v2",
  "Investment advisory onboarding": "Wealth account notice v1",
  // Not in any notice (consent): "Product marketing", "Customer support & complaints",
  // "Collections outreach via social media".
  // Legitimate use (notice not required): "Payroll & statutory deductions",
  // "Pre-employment background checks".
};

export function noticeFor(purposeName: string): string | null {
  return NOTICE_BY_PURPOSE[purposeName] ?? null;
}

/** The current register's purpose set (Meridian fixture). The Purposes page scopes
 *  to these, so legacy demo purposes from earlier seeds don't pad the list. */
export const MERIDIAN_PURPOSES = [
  "KYC & identity verification", "Credit assessment", "Fraud detection", "Recovery & collections",
  "Product marketing", "Customer support & complaints", "Investment advisory onboarding",
  "Payroll & statutory deductions", "Pre-employment background checks", "Collections outreach via social media",
];
