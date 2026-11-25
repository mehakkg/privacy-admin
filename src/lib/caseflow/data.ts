/**
 * Case-flow prototype fixtures (Workflow & Case Management spec — one end-to-end
 * slice on WF-DR-01 "Erasure request — end to end"). Drives the Library, Journey
 * Editor, Version Review, My Work, Case Workspace and Proof-gated Close screens.
 * Fixture tenant: Meridian Financial Services. Personas per the spec.
 */

export type ThreeState = "Pending" | "Partially complete" | "Fully verified";
export type AssignRule = "Named person" | "Round-robin in pool" | "By request type" | "Least loaded";

export interface Person { id: string; name: string; role: string; }
export const PEOPLE: Record<string, Person> = {
  ritu: { id: "ritu", name: "Ritu Nair", role: "Admin" },
  kavita: { id: "kavita", name: "Kavita Menon", role: "DPO" },
  arvind: { id: "arvind", name: "Arvind Rao", role: "CISO" },
  neha: { id: "neha", name: "Neha Kapoor", role: "Legal" },
};

export interface EditorStep {
  no: number; name: string; role: string; owner: string | null; backup: string | null;
  rule: AssignRule; locked: boolean; handoffTo?: string; // role change marker after this step
  internalDays?: number; legalDays?: number; legalBasis?: string;
}

/** WF-DR-01 draft v4 — steps with owners (principal-facing steps have no internal owner). */
export const JOURNEY = {
  id: "WF-DR-01",
  name: "Erasure request — end to end",
  domain: "Rights Requests",
  entity: "Meridian Financial Services",
  liveVersion: 3,
  draftVersion: 4,
  draftState: "Awaiting DPO approval" as "Draft" | "Awaiting DPO approval" | "Live",
  lastPublishedBy: "Kavita Menon",
  lastPublishedOn: "12 Nov 2026",
  legalDeadlineDays: 30,
  legalBasis: "DPDP Rule 13 — rights request fulfilment",
  openCasesLive: 14,
  roles: ["Data Principal", "Admin", "Data Processor"],
};

const admin = "ritu", nobody = null;
export const EDITOR_STEPS: EditorStep[] = [
  { no: 1, name: "Select the right to exercise (erasure)", role: "Data Principal", owner: null, backup: null, rule: "Named person", locked: false },
  { no: 2, name: "Choose identity verification method", role: "Data Principal", owner: null, backup: null, rule: "Named person", locked: false },
  { no: 3, name: "Complete verification (OTP)", role: "Data Principal", owner: null, backup: null, rule: "Named person", locked: false },
  { no: 6, name: "Submit request and receive tracking ID", role: "Data Principal", owner: null, backup: null, rule: "Named person", locked: false, handoffTo: "Admin" },
  { no: 7, name: "Auto-send acknowledgment on receipt", role: "Admin", owner: admin, backup: "kavita", rule: "Named person", locked: false, internalDays: 1, legalDays: 30 },
  { no: 8, name: "Receive and log a new DPRR into the central queue", role: "Admin", owner: admin, backup: "kavita", rule: "Least loaded", locked: false, internalDays: 1, legalDays: 30 },
  { no: 10, name: "Auto-assign the request to an available reviewer by type", role: "Admin", owner: admin, backup: "kavita", rule: "By request type", locked: false },
  { no: 13, name: "Check for legal-retention exceptions before proceeding", role: "Admin", owner: admin, backup: nobody, rule: "Named person", locked: true, internalDays: 3, legalDays: 30, legalBasis: "DPDP §8(7) retention exception" },
  { no: 15, name: "Identify every connected system and processor holding the customer's data", role: "Admin", owner: admin, backup: "arvind", rule: "Named person", locked: false },
  { no: 20, name: "Send deletion instruction to the third-party Data Processor", role: "Admin", owner: admin, backup: "arvind", rule: "Named person", locked: false, handoffTo: "Data Processor" },
  { no: 21, name: "Track per-system completion status as confirmations come in", role: "Admin", owner: admin, backup: "arvind", rule: "Named person", locked: false },
  { no: 24, name: "Compile cross-system completion evidence", role: "Admin", owner: admin, backup: "arvind", rule: "Named person", locked: false },
  { no: 25, name: "Log completion timestamp and evidence in the audit trail", role: "Admin", owner: admin, backup: "kavita", rule: "Named person", locked: true, legalBasis: "DPDP §8(8) audit record" },
];

export interface ValidationIssue { kind: "blocker" | "warning"; rule: string; step: string; reason: string; citation?: string; }
export const VALIDATION: ValidationIssue[] = [
  { kind: "blocker", rule: "Missing backup owner", step: "Step 13 · Check for legal-retention exceptions before proceeding", reason: "A legally-required step must have a backup owner so it never stalls if the owner is away.", citation: "DPDP §8(7)" },
  { kind: "warning", rule: "Tight buffer", step: "Step 13 · internal deadline 3 days", reason: "Internal target leaves only a 3-day buffer under the 30-day legal deadline." },
];

/** Version diff (Live v3 → Draft v4) for the DPO Version Review. */
export interface DiffRow { step: string; change: "added" | "removed" | "modified"; from?: string; to?: string; locked?: boolean; }
export const DIFF: DiffRow[] = [
  { step: "Step 8 · Receive and log a new DPRR into the central queue", change: "modified", from: "Backup: —", to: "Backup: Kavita Menon" },
  { step: "Step 13 · Check for legal-retention exceptions before proceeding", change: "modified", from: "Internal deadline: 5 days", to: "Internal deadline: 3 days", locked: true },
  { step: "Step 21 · Track per-system completion status", change: "modified", from: "Backup: —", to: "Backup: Arvind Rao" },
  { step: "Step 24 · Compile cross-system completion evidence", change: "modified", from: "Backup: —", to: "Backup: Arvind Rao" },
];

/** DPO Approvals inbox (B1). */
export interface Approval { id: string; type: string; title: string; requester: string; waiting: string; blocking: string; urgent?: boolean; }
export const APPROVALS: Approval[] = [
  { id: "ver-dr01-v4", type: "Workflow version", title: "Erasure request — end to end · v4", requester: "Ritu Nair", waiting: "2 days", blocking: "Config change", },
  { id: "sub-kestrel", type: "Sub-processor", title: "Kestrel Data Services → CloudArchive Ltd", requester: "Kestrel Data Services", waiting: "1 day", blocking: "1 engagement" },
  { id: "notice-mb", type: "Notice", title: "Mobile-banking privacy notice v3", requester: "Kavita Menon", waiting: "4 hours", blocking: "Launch" },
];

/** My Work case inbox (C1). */
export interface CaseRow {
  id: string; subject: string; journey: string; journeyId: string; version: number;
  lane: string; sla: string; slaTone: "danger" | "warn" | "ok"; status: ThreeState; stepName: string;
}
export const CASES: CaseRow[] = [
  { id: "REQ-1042", subject: "Rahul Kapoor · Customer 88421", journey: "Erasure request — end to end", journeyId: "WF-DR-01", version: 3, lane: "Rights request", sla: "18h 24m", slaTone: "danger", status: "Partially complete", stepName: "Track per-system completion" },
  { id: "REQ-1051", subject: "Meera Pillai · Customer 77310", journey: "Correction request", journeyId: "WF-DR-07", version: 2, lane: "Rights request", sla: "2d 6h", slaTone: "warn", status: "Pending", stepName: "Validate request scope" },
  { id: "GR-1019", subject: "Aditya Shah · Grievance", journey: "Grievance intake → resolution", journeyId: "WF-GR-01", version: 5, lane: "Grievance", sla: "3d 8h", slaTone: "ok", status: "Pending", stepName: "Open investigation" },
];

/** Case Workspace (C3) for REQ-1042. Three columns: context / action+steps / timeline. */
export const CASE = {
  id: "REQ-1042", subject: "Rahul Kapoor", customer: "Customer 88421",
  journey: "Erasure request — end to end", journeyId: "WF-DR-01", version: 3,
  channel: "Self-service portal", opened: "11 Nov 2026, 09:02", trackingId: "REQ-1042",
  legalDeadline: "13 Nov 2026, 17:00", slaRemaining: "18h 24m", slaTone: "danger" as const,
  status: "Partially complete" as ThreeState,
  fields: ["Full name", "Date of birth", "PAN (masked)", "Address", "Mobile number", "Email", "Account number", "Txn history"],
  context: [
    { k: "Identity", v: "Verified — OTP + uploaded PAN (masked)" },
    { k: "Scope", v: "All systems holding personal data" },
    { k: "Retention check", v: "No statutory hold found (§8(7) reviewed)" },
    { k: "Consent", v: "All marketing consent withdrawn 10 Nov" },
  ],
  // the "one primary action" is the current step; preceding steps done
  currentStep: { no: 21, name: "Track per-system completion status as confirmations come in", verb: "Resolve unconfirmed system" },
  steps: [
    { no: 8, name: "Receive and log into the central queue", state: "done" },
    { no: 13, name: "Check for legal-retention exceptions", state: "done" },
    { no: 15, name: "Identify every connected system and processor", state: "done" },
    { no: 20, name: "Send deletion instruction to Data Processor", state: "done" },
    { no: 21, name: "Track per-system completion status", state: "current" },
    { no: 24, name: "Compile cross-system completion evidence", state: "locked" },
    { no: 25, name: "Log completion in the audit trail", state: "locked" },
  ] as { no: number; name: string; state: "done" | "current" | "locked" }[],
  // per-system completion grid (C5)
  systems: [
    { name: "Core Banking (CRM)", type: "System", state: "Fully verified" as ThreeState, detail: "API confirmation · 11 Nov 14:20" },
    { name: "Marketing platform", type: "System", state: "Fully verified" as ThreeState, detail: "API confirmation · 11 Nov 14:22" },
    { name: "Cloud backup / archive", type: "System", state: "Fully verified" as ThreeState, detail: "API confirmation · 11 Nov 15:01" },
    { name: "Transaction ledger", type: "System", state: "Partially complete" as ThreeState, detail: "Statutory 8-yr retention flag — partial purge" },
    { name: "Kestrel Data Services", type: "Processor", state: "Pending" as ThreeState, detail: "Instruction sent 11 Nov — awaiting evidence" },
  ],
  timeline: [
    { t: "11 Nov 09:02", who: "System", what: "Request intake — legal clock started" },
    { t: "11 Nov 09:02", who: "System", what: "Acknowledgment auto-sent to Rahul Kapoor" },
    { t: "11 Nov 09:40", who: "System", what: "Auto-assigned to Ritu Nair (by request type)" },
    { t: "11 Nov 10:05", who: "Ritu Nair", what: "Retention check completed — no hold" },
    { t: "11 Nov 14:20", who: "System", what: "CRM deletion verified by API receipt" },
    { t: "11 Nov 15:01", who: "System", what: "Cloud backup deletion verified" },
  ],
};
