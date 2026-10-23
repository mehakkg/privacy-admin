/**
 * ROPA recommendations fixture (Data Map redesign, Page 4). These are AI-generated
 * suggestions from DLP-classified data, not register records — so they live as a
 * fixture, resolved against the real activities for the "closest match" and accepted
 * links. Evidence shows a MASKED sample only; never a raw PAN/Aadhaar/account value.
 */
export interface RecField { name: string; label: string; location: string; records: number; sample: string }
export interface PendingRec {
  id: string; activity: string; source: string; purpose: string | null; principal: string;
  fields: RecField[]; match: { activityName: string; overlap: string } | null; generated: string;
}
export interface AcceptedRec { activityName: string; createdAt: string; by: string }
export interface DismissedRec { name: string; reason: string; by: string; at: string }

export const GENERATED_AT = "Last generated 22 Oct 2026, 09:40 from DLP sync of 22 Oct 2026, 09:15";

export const PENDING: PendingRec[] = [
  {
    id: "rec-loan-uploads", activity: "Loan document uploads", source: "SharePoint › Loans",
    purpose: "Credit assessment", principal: "Loan applicant", generated: "22 Oct 2026",
    match: { activityName: "Credit scoring", overlap: "3 of 4 fields" },
    fields: [
      { name: "PAN", label: "Restricted", location: "SharePoint › Loans › applications", records: 1842, sample: "ABCDE••••F" },
      { name: "Aadhaar number (masked)", label: "Restricted", location: "SharePoint › Loans › applications", records: 1842, sample: "XXXX XXXX ••12" },
      { name: "Salary slip", label: "Confidential", location: "SharePoint › Loans › documents", records: 1510, sample: "₹••,•••/mo" },
      { name: "Bank statement", label: "Confidential", location: "SharePoint › Loans › documents", records: 1488, sample: "A/C ••••4021" },
    ],
  },
  {
    id: "rec-support-attach", activity: "Support ticket attachments", source: "Freshdesk",
    purpose: "Customer support & complaints", principal: "Customer", generated: "22 Oct 2026",
    match: { activityName: "Customer support calls", overlap: "2 of 3 fields" },
    fields: [
      { name: "Email", label: "Internal", location: "Freshdesk › tickets", records: 9320, sample: "r•••@•••.com" },
      { name: "Mobile number", label: "Internal", location: "Freshdesk › tickets", records: 8771, sample: "98••••••10" },
    ],
  },
  {
    id: "rec-branch-log", activity: "Branch visitor log", source: "Branch kiosk DB",
    purpose: null, principal: "Visitor", generated: "22 Oct 2026", match: null,
    fields: [
      { name: "Full name", label: "Confidential", location: "Branch kiosk DB › visitors", records: 640, sample: "R•••• N••••" },
      { name: "Mobile number", label: "Internal", location: "Branch kiosk DB › visitors", records: 640, sample: "99••••••03" },
      { name: "Visit time", label: "Internal", location: "Branch kiosk DB › visitors", records: 640, sample: "2026-10-2• 1•:••" },
    ],
  },
];

export const ACCEPTED: AcceptedRec[] = [
  { activityName: "Customer onboarding & KYC", createdAt: "2 Aug 2026", by: "Ritu Nair" },
  { activityName: "Fraud monitoring", createdAt: "9 Oct 2026", by: "Ritu Nair" },
];

export const DISMISSED: DismissedRec[] = [
  { name: "QA customer table", reason: "Test or sample data", by: "Ritu Nair", at: "11 Oct 2026" },
];

export const DISMISS_REASONS = ["Not personal data", "Already covered by another activity", "Test or sample data", "Other"];
