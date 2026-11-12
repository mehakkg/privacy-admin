/**
 * Go-live setup model (setup-fix spec). Self-contained fixture + logic for the
 * /setup screen rebuild — four dependency-ordered stages, one accountable owner
 * per step, drawer-or-deep-link configuration, and done-row summaries. Counts are
 * always derived from this list, never hard-coded.
 */

export type Role = "admin" | "dpo" | "ciso" | "grievance" | "legal";

export interface Person { id: Role; name: string; role: string; color: string }
export const PEOPLE: Record<Role, Person> = {
  admin: { id: "admin", name: "Ritu Nair", role: "Admin", color: "#2563eb" },
  dpo: { id: "dpo", name: "Kavita Menon", role: "DPO", color: "#7c3aed" },
  ciso: { id: "ciso", name: "Arvind Rao", role: "CISO", color: "#0891b2" },
  grievance: { id: "grievance", name: "Sanjay Iyer", role: "Grievance Officer", color: "#c2410c" },
  legal: { id: "legal", name: "Legal", role: "Legal", color: "#475569" },
};

/** Map the app's session role onto a setup owner. */
export function roleToOwner(sessionRole: string): Role {
  if (sessionRole === "dpo") return "dpo";
  if (sessionRole === "ciso") return "ciso";
  if (sessionRole === "grievance_officer" || sessionRole === "grievance") return "grievance";
  if (sessionRole === "legal") return "legal";
  return "admin";
}

export type Field =
  | { kind: "select"; label: string; options: string[]; value?: string }
  | { kind: "text"; label: string; placeholder?: string; value?: string }
  | { kind: "number"; label: string; helper?: string; min?: number; max?: number; value?: string };

export interface Drawer { title: string; intro?: string; fields: Field[] }
export type Opener = { type: "drawer"; drawer: Drawer } | { type: "link"; href: string; module: string };

export interface Step {
  id: string;
  stage: 1 | 2 | 3 | 4;
  title: string;
  owner: Role;
  required: boolean;
  estimate: string;
  deps: string[];
  verb: string;
  open: Opener;
  summary?: string; // read-only configured values, shown when done
  inProgress?: string; // e.g. "2 of 5 connected" — a started, not-done step
  lastChanged?: string; // who + when, system-populated
}

export const STAGES: { n: 1 | 2 | 3 | 4; title: string }[] = [
  { n: 1, title: "Connect the organisation" },
  { n: 2, title: "Governance and contacts" },
  { n: 3, title: "Map your data" },
  { n: 4, title: "Go live" },
];

const link = (href: string, module: string): Opener => ({ type: "link", href, module });

export const STEPS: Step[] = [
  // Stage 1 — Connect the organisation
  { id: "iam", stage: 1, title: "Confirm miniOrange IAM link", owner: "admin", required: true, estimate: "~1 min", deps: [], verb: "Confirm link", open: link("/settings/organization?tab=connectors", "Settings › Connectors › miniOrange IAM"), summary: "Directory sync on · 142 users synced · Last sync 10:41", lastChanged: "Ritu Nair · 11 Nov, 10:41" },
  { id: "dlp", stage: 1, title: "Confirm miniOrange DLP link", owner: "admin", required: true, estimate: "~1 min", deps: [], verb: "Confirm link", open: link("/integrations/dlp", "Settings › Connectors › miniOrange DLP"), summary: "DLP tenant linked · 3 approved sources · Labels: Restricted, Confidential, Internal, Public", lastChanged: "Ritu Nair · 11 Nov, 10:38" },
  { id: "fiduciaries", stage: 1, title: "Add fiduciaries", owner: "admin", required: true, estimate: "~3 min", deps: [], verb: "Add fiduciaries", open: link("/settings/organization?tab=fiduciaries", "Settings › Organization & entities"), summary: "Meridian Financial Services Ltd. (Parent) · Meridian Home Finance Ltd. (Subsidiary)", lastChanged: "Ritu Nair · 10 Nov, 16:02" },
  { id: "invite", stage: 1, title: "Invite your team", owner: "admin", required: true, estimate: "~2 min", deps: ["iam"], verb: "Invite team", open: link("/settings/organization?tab=users", "Settings › Users"), summary: "4 invited · 3 accepted · Legal not invited", lastChanged: "Ritu Nair · 10 Nov, 16:10" },
  { id: "starter", stage: 1, title: "Apply the banking starter pack", owner: "admin", required: false, estimate: "~2 min", deps: ["fiduciaries"], verb: "Apply pack", open: link("/data-map/purposes", "Settings › Templates › Banking starter pack") },

  // Stage 2 — Governance and contacts
  { id: "sdf", stage: 2, title: "Confirm SDF status", owner: "dpo", required: true, estimate: "~2 min", deps: ["fiduciaries", "invite"], verb: "Confirm status", summary: "Meridian Financial Services Ltd.: Not yet notified · Meridian Home Finance Ltd.: Not yet notified", lastChanged: "Kavita Menon · 11 Nov, 09:20",
    open: { type: "drawer", drawer: { title: "Confirm SDF status", intro: "SDF status is notified by the Government, not self-assessed (Section 10). Set it per fiduciary.", fields: [
      { kind: "select", label: "Meridian Financial Services Ltd. — Notified as Significant Data Fiduciary?", options: ["Yes", "No", "Not yet notified"], value: "Not yet notified" },
      { kind: "select", label: "Meridian Home Finance Ltd. — Notified as Significant Data Fiduciary?", options: ["Yes", "No", "Not yet notified"], value: "Not yet notified" },
    ] } } },
  { id: "contact", stage: 2, title: "Confirm published privacy contact", owner: "dpo", required: true, estimate: "~2 min", deps: ["fiduciaries", "invite"], verb: "Confirm contact", summary: "Kavita Menon (DPO) · dpo@meridianfs.in · Published on meridianfs.in/privacy", lastChanged: "Kavita Menon · 11 Nov, 09:24",
    open: { type: "drawer", drawer: { title: "Confirm published privacy contact", intro: "Rule 9: this contact must be published and included in every rights response.", fields: [
      { kind: "select", label: "Contact type", options: ["Designated DPO", "Contact person"], value: "Designated DPO" },
      { kind: "text", label: "Name", placeholder: "Full name", value: "Kavita Menon" },
      { kind: "text", label: "Work email", placeholder: "name@company.com", value: "dpo@meridianfs.in" },
      { kind: "text", label: "Where it’s published (website URL)", placeholder: "example.com/privacy", value: "meridianfs.in/privacy" },
    ] } } },
  { id: "grievance", stage: 2, title: "Set grievance contact and response window", owner: "grievance", required: true, estimate: "~2 min", deps: ["invite"], verb: "Set contact",
    open: { type: "drawer", drawer: { title: "Set grievance contact and response window", fields: [
      { kind: "text", label: "Grievance Officer", placeholder: "Full name", value: "Sanjay Iyer" },
      { kind: "text", label: "Grievance email", placeholder: "grievance@company.com" },
      { kind: "number", label: "Response window (days)", helper: "Maximum 90 days under Rule 14(3).", min: 1, max: 90, value: "30" },
    ] } } },
  { id: "breach", stage: 2, title: "Set breach contacts", owner: "ciso", required: true, estimate: "~2 min", deps: ["invite"], verb: "Set contacts",
    open: { type: "drawer", drawer: { title: "Set breach contacts", intro: "When a breach is confirmed the Board must be informed (Rule 7, 72-hour report).", fields: [
      { kind: "text", label: "Primary breach contact", placeholder: "Full name" },
      { kind: "text", label: "Backup contact", placeholder: "Full name" },
      { kind: "text", label: "Escalation phone", placeholder: "+91 …" },
    ] } } },
  { id: "escalation", stage: 2, title: "Set escalation routing", owner: "dpo", required: false, estimate: "~2 min", deps: ["invite"], verb: "Set routing",
    open: { type: "drawer", drawer: { title: "Set escalation routing", intro: "Who rules on retention conflicts, rights-request exceptions and purpose changes. All default to the DPO.", fields: [
      { kind: "select", label: "Default escalation owner per request type", options: ["DPO", "CISO", "Admin"], value: "DPO" },
    ] } } },

  // Stage 3 — Map your data
  { id: "connect", stage: 3, title: "Connect business systems", owner: "admin", required: true, estimate: "~5 min", deps: ["iam", "dlp"], verb: "Continue", inProgress: "2 of 5 connected", open: link("/settings/organization?tab=connectors", "Settings › Connectors") },
  { id: "discovery", stage: 3, title: "Review DLP discovery and onboard sources", owner: "admin", required: true, estimate: "~6 min", deps: ["connect"], verb: "Review", open: link("/data-map/inventory", "Data Map › Inventory") },
  { id: "activities", stage: 3, title: "Create processing activities and submit purposes", owner: "admin", required: true, estimate: "~8 min", deps: ["discovery"], verb: "Open", open: link("/data-map/activities", "Data Map › Processing activities") },
  { id: "approve", stage: 3, title: "Approve purposes", owner: "dpo", required: true, estimate: "~5 min", deps: ["activities"], verb: "Review purposes", open: link("/data-map/purposes?tab=work", "Approved policy › Purposes") },
  { id: "retention", stage: 3, title: "Set retention schedules", owner: "dpo", required: false, estimate: "~5 min", deps: ["activities"], verb: "Set schedules", open: link("/data-protection/retention", "Data Protection › Retention schedules") },

  // Stage 4 — Go live
  { id: "portal", stage: 4, title: "Rights & grievance portal", owner: "admin", required: true, estimate: "~2 min", deps: ["grievance", "contact"], verb: "Open portal", open: link("/requests/sla", "Requests › SLA & routing › Portal") },
  { id: "notices", stage: 4, title: "Notices", owner: "dpo", required: true, estimate: "~3 min", deps: ["approve"], verb: "Publish notice", open: link("/consent/notices", "Consent & Notices › Notices") },
  { id: "consent", stage: 4, title: "Consent collection", owner: "admin", required: true, estimate: "~3 min", deps: ["notices"], verb: "Turn on", open: link("/consent/collection-points", "Consent & Notices › Consent collection") },
];

/** Fixture: six required steps already configured (Stage 1 + the two DPO contacts). */
export const SEED_DONE = ["iam", "dlp", "fiduciaries", "invite", "sdf", "contact"];

export type StepState = "done" | "progress" | "todo" | "locked";

export function stepState(step: Step, done: Set<string>): StepState {
  if (done.has(step.id)) return "done";
  if (step.deps.some((d) => !done.has(d))) return "locked";
  if (step.inProgress) return "progress";
  return "todo";
}

export function byId(id: string): Step | undefined { return STEPS.find((s) => s.id === id); }
export function stageSteps(n: number): Step[] { return STEPS.filter((s) => s.stage === n); }
export function requiredSteps(): Step[] { return STEPS.filter((s) => s.required); }

/** Progress — derived, never hard-coded. */
export function progress(done: Set<string>) {
  const req = requiredSteps();
  const total = req.length;
  const doneCount = req.filter((s) => done.has(s.id)).length;
  const golive = stageSteps(4).filter((s) => s.required);
  const live = golive.filter((s) => done.has(s.id)).length;
  return { doneCount, total, live, liveTotal: golive.length, pct: total ? Math.round((doneCount / total) * 100) : 0 };
}

export function stageProgress(n: number, done: Set<string>) {
  const req = stageSteps(n).filter((s) => s.required);
  const doneCount = req.filter((s) => done.has(s.id)).length;
  return { doneCount, total: req.length };
}

export type StageDisplay = "done" | "current" | "locked";
export function stageDisplay(n: number, done: Set<string>): StageDisplay {
  const req = stageSteps(n).filter((s) => s.required);
  if (req.every((s) => done.has(s.id))) return "done";
  // Locked if every unfinished required step is dependency-blocked.
  const unfinished = req.filter((s) => !done.has(s.id));
  if (unfinished.every((s) => stepState(s, done) === "locked")) return "locked";
  return "current";
}

/** The step that blocks a locked step, for the "Unlocks after …" line. */
export function blockingStep(step: Step, done: Set<string>): Step | undefined {
  const dep = step.deps.find((d) => !done.has(d));
  return dep ? byId(dep) : undefined;
}

/** A person's unlocked, required, unfinished steps (drives Waiting-on + next-step). */
export function openRequiredFor(owner: Role, done: Set<string>): Step[] {
  return STEPS.filter((s) => s.owner === owner && s.required && !done.has(s.id) && stepState(s, done) !== "locked");
}
export function lockedRequiredFor(owner: Role, done: Set<string>): Step[] {
  return STEPS.filter((s) => s.owner === owner && s.required && !done.has(s.id) && stepState(s, done) === "locked");
}

/** People still blocking setup — have an unlocked, required, unfinished step. */
export function waitingOn(done: Set<string>): { person: Person; step: Step }[] {
  const out: { person: Person; step: Step }[] = [];
  (["admin", "dpo", "ciso", "grievance"] as Role[]).forEach((r) => {
    const open = openRequiredFor(r, done).sort((a, b) => a.stage - b.stage);
    if (open.length) out.push({ person: PEOPLE[r], step: open[0] });
  });
  return out;
}

export interface NextStep {
  state: "do" | "progress" | "blocked" | "done";
  step?: Step;
  unlockAfter?: Step;
  waiting?: Person[];
}
export function nextStepFor(owner: Role, done: Set<string>): NextStep {
  const open = openRequiredFor(owner, done).sort((a, b) => a.stage - b.stage);
  if (open.length) {
    const s = open[0];
    return { state: s.inProgress ? "progress" : "do", step: s };
  }
  const locked = lockedRequiredFor(owner, done).sort((a, b) => a.stage - b.stage);
  if (locked.length) {
    const s = locked[0];
    return { state: "blocked", step: s, unlockAfter: blockingStep(s, done) };
  }
  // Finished everything of their own — who's the org waiting on?
  const others = waitingOn(done).map((w) => w.person).filter((p) => p.id !== owner);
  return { state: "done", waiting: others };
}

export function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}
