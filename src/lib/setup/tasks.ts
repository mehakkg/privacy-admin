/**
 * Setup task catalogue + go-live gate (pure, no DB/React). Each required/optional
 * task has an owner role and dependencies; status is derived. The three customer-
 * facing capabilities stay Blocked until their exact requirements are met. Shared
 * by the Setup page, the dashboard strip and the route guard.
 */

export type SetupRole = "admin" | "dpo" | "ciso" | "grievance";
export type DrawerKind =
  | "iam" | "dlp" | "fiduciaries" | "invite" | "starter"
  | "sdf" | "contact" | "review_purposes" | "escalation" | "breach" | "siem" | "grievance";

export interface SetupTask {
  id: string; owner: SetupRole; title: string; required: boolean;
  dependsOn: string[]; estimate: string; why: string; drawer: DrawerKind;
  showIf?: (s: SetupState) => boolean;
}

export const ROLE_PERSON: Record<SetupRole, string> = {
  admin: "Ritu Nair", dpo: "Kavita Menon", ciso: "Arvind Rao", grievance: "Sanjay Iyer",
};
export const ROLE_LABEL: Record<SetupRole, string> = { admin: "Admin", dpo: "DPO", ciso: "CISO", grievance: "Grievance Officer" };

export const TASKS: SetupTask[] = [
  { id: "A1", owner: "admin", title: "Confirm miniOrange IAM link", required: true, dependsOn: [], estimate: "~1 min", why: "Turns on SSO and lets invite pickers search your directory.", drawer: "iam" },
  { id: "A2", owner: "admin", title: "Confirm miniOrange DLP link", required: true, dependsOn: [], estimate: "~1 min", why: "The first sync populates Data inventory.", drawer: "dlp" },
  { id: "A3", owner: "admin", title: "Add fiduciaries", required: true, dependsOn: [], estimate: "~3 min", why: "Every activity, notice and request is attributed to a fiduciary.", drawer: "fiduciaries" },
  { id: "A4", owner: "admin", title: "Invite your team", required: true, dependsOn: ["A1"], estimate: "~2 min", why: "Each role does its own setup.", drawer: "invite" },
  { id: "A5", owner: "admin", title: "Apply the banking starter pack", required: false, dependsOn: ["A3"], estimate: "~2 min", why: "Pre-fills purposes, notices and activity templates. Nothing is approved or published by applying it.", drawer: "starter" },
  { id: "D1", owner: "dpo", title: "Confirm SDF status", required: true, dependsOn: ["A3", "A4"], estimate: "~2 min", why: "SDF status is notified by the Government, not self-assessed (Section 10).", drawer: "sdf" },
  { id: "D2", owner: "dpo", title: "Confirm published privacy contact", required: true, dependsOn: ["A3", "A4"], estimate: "~2 min", why: "Rule 9: this contact must be published and included in every rights response.", drawer: "contact" },
  { id: "D3", owner: "dpo", title: "Review starter purposes", required: false, dependsOn: ["A5"], estimate: "~5 min", why: "Approve or reject the purposes the starter pack drafted.", drawer: "review_purposes", showIf: (s) => !!s.done.A5 },
  { id: "D4", owner: "dpo", title: "Set escalation routing", required: false, dependsOn: ["A4"], estimate: "~2 min", why: "Who rules on retention conflicts, rights-request exceptions and purpose changes.", drawer: "escalation" },
  { id: "C1", owner: "ciso", title: "Set breach contacts", required: true, dependsOn: ["A4"], estimate: "~2 min", why: "When a breach is confirmed, the Board must be informed (Rule 7, 72-hour report).", drawer: "breach" },
  { id: "C2", owner: "ciso", title: "Connect SIEM", required: false, dependsOn: ["A4"], estimate: "~5 min", why: "Stream access logs for monitoring.", drawer: "siem" },
  { id: "G1", owner: "grievance", title: "Set grievance contact and response window", required: true, dependsOn: ["A4"], estimate: "~2 min", why: "Rule 14 requires a response within 90 days.", drawer: "grievance" },
];

export interface SetupState {
  done: Record<string, boolean>;
  invited: SetupRole[];           // roles that have been invited (A4)
  reassigned: Record<string, SetupRole>; // task id → role it was reassigned to (C1/C2 → admin)
  caps: { portal: boolean; notices: boolean; consent: boolean };
}

export const DEFAULT_STATE: SetupState = { done: { A1: true, A2: true }, invited: [], reassigned: {}, caps: { portal: false, notices: false, consent: false } };

/** A4 is "done" when the DPO and Grievance Officer have been invited. */
export function isTaskDone(id: string, s: SetupState): boolean {
  if (id === "A4") return s.invited.includes("dpo") && s.invited.includes("grievance");
  return !!s.done[id];
}

export function effectiveOwner(t: SetupTask, s: SetupState): SetupRole { return s.reassigned[t.id] ?? t.owner; }

export type TaskStatus = { kind: "todo" | "in_progress" | "done"; } | { kind: "blocked"; waitingOn: string; dep: string };

export function taskStatus(t: SetupTask, s: SetupState): TaskStatus {
  if (isTaskDone(t.id, s)) return { kind: "done" };
  for (const depId of t.dependsOn) {
    if (!isTaskDone(depId, s)) {
      const dep = TASKS.find((x) => x.id === depId)!;
      return { kind: "blocked", waitingOn: ROLE_PERSON[effectiveOwner(dep, s)], dep: dep.title };
    }
  }
  return { kind: "todo" };
}

export function visibleTasks(s: SetupState): SetupTask[] { return TASKS.filter((t) => !t.showIf || t.showIf(s)); }

export function counts(s: SetupState) {
  const vis = visibleTasks(s);
  const req = vis.filter((t) => t.required);
  const opt = vis.filter((t) => !t.required);
  return {
    requiredDone: req.filter((t) => isTaskDone(t.id, s)).length, requiredTotal: req.length,
    optionalDone: opt.filter((t) => isTaskDone(t.id, s)).length, optionalTotal: opt.length,
  };
}

/** Whether the current role may complete a task: owner role, or Admin for a task
 *  reassigned to them. D1–D4 are policy-locked to the DPO. */
export function canComplete(t: SetupTask, role: string, s: SetupState): boolean {
  return effectiveOwner(t, s) === role;
}

// --- Go-live gate (the three customer-facing capabilities) ------------------
export interface GoLiveFacts { fiduciaryCount: number; approvedPurposes: number; channels: number }
export interface Requirement { label: string; met: boolean; owner: string }
export interface Capability { key: "portal" | "notices" | "consent"; title: string; requirements: Requirement[]; status: "Blocked" | "Ready" | "Live"; action: string; actionHref?: string }

export function goLive(s: SetupState, f: GoLiveFacts): Capability[] {
  const d2 = isTaskDone("D2", s), g1 = isTaskDone("G1", s);
  const admin = ownerLabel("admin", s.invited);
  const portalReqs: Requirement[] = [
    { label: "At least one fiduciary", met: f.fiduciaryCount >= 1, owner: admin },
    { label: "Rule 9 published contact for every active fiduciary", met: d2, owner: ownerLabel("dpo", s.invited) },
    { label: "Grievance contact and response window set", met: g1, owner: ownerLabel("grievance", s.invited) },
  ];
  const portal: Capability = { key: "portal", title: "Rights & grievance portal", requirements: portalReqs, status: s.caps.portal ? "Live" : portalReqs.every((r) => r.met) ? "Ready" : "Blocked", action: "Open portal" };

  const noticeReqs: Requirement[] = [
    { label: "Rights & grievance portal ready", met: portal.status !== "Blocked", owner: admin },
    { label: "At least one approved purpose", met: f.approvedPurposes >= 1, owner: ownerLabel("dpo", s.invited) },
  ];
  const notices: Capability = { key: "notices", title: "Notices", requirements: noticeReqs, status: s.caps.notices ? "Live" : noticeReqs.every((r) => r.met) ? "Ready" : "Blocked", action: "Publish first notice →", actionHref: "/consent/notices" };

  const consentReqs: Requirement[] = [
    { label: "At least one published notice", met: s.caps.notices, owner: admin },
    { label: "At least one collection channel configured", met: f.channels >= 1, owner: admin },
  ];
  const consent: Capability = { key: "consent", title: "Consent collection", requirements: consentReqs, status: s.caps.consent ? "Live" : consentReqs.every((r) => r.met) ? "Ready" : "Blocked", action: "Turn on collection →", actionHref: "/consent/platform" };

  return [portal, notices, consent];
}

// --- Staged path (layout revision) -----------------------------------------
export interface Stage { n: 1 | 2; title: string; required: string[]; optional: string[] }
export const STAGES: Stage[] = [
  { n: 1, title: "Connect and set up the organisation", required: ["A1", "A2", "A3", "A4"], optional: ["A5"] },
  { n: 2, title: "Governance and contacts", required: ["D1", "D2", "G1", "C1"], optional: ["D3", "D4", "C2"] },
];

export function roleAssigned(role: SetupRole, invited: SetupRole[]): boolean { return role === "admin" || invited.includes(role); }
/** A person's name only when their role is assigned; otherwise "{Role} · not invited". */
export function ownerLabel(role: SetupRole, invited: SetupRole[]): string {
  return roleAssigned(role, invited) ? ROLE_PERSON[role] : `${ROLE_LABEL[role]} · not invited`;
}

export function stageState(stage: Stage, s: SetupState): { done: number; total: number; state: "Not started" | "In progress" | "Done ✓" } {
  const req = stage.required.filter((id) => TASKS.find((t) => t.id === id));
  const done = req.filter((id) => isTaskDone(id, s)).length;
  const state = done === req.length ? "Done ✓" : done === 0 ? "Not started" : "In progress";
  return { done, total: req.length, state };
}

function transitiveDependsOn(taskId: string, targetId: string, seen = new Set<string>()): boolean {
  const t = TASKS.find((x) => x.id === taskId);
  if (!t || seen.has(taskId)) return false;
  seen.add(taskId);
  if (t.dependsOn.includes(targetId)) return true;
  return t.dependsOn.some((d) => transitiveDependsOn(d, targetId, seen));
}

/** Tasks + capabilities this task unlocks (transitively), for the Next-up card. */
export function unlocks(id: string, s: SetupState): { count: number; label: string } {
  const vis = visibleTasks(s).filter((t) => !isTaskDone(t.id, s));
  const depTasks = vis.filter((t) => t.id !== id && transitiveDependsOn(t.id, id));
  const parts: string[] = [];
  // The first customer-facing capability gated by this task.
  if (depTasks.some((t) => t.id === "D2" || t.id === "G1") || id === "D2" || id === "G1") parts.push("Rights portal");
  // Optional tasks by name.
  for (const t of depTasks.filter((t) => !t.required)) parts.push(t.id === "A5" ? "Starter pack" : t.title);
  // Required dependents grouped by owner role.
  const req = depTasks.filter((t) => t.required);
  const byRole = new Map<SetupRole, number>();
  for (const t of req) byRole.set(t.owner, (byRole.get(t.owner) ?? 0) + 1);
  for (const [role, n] of byRole) parts.push(n === 1 ? req.find((t) => t.owner === role)!.title : `${n} ${ROLE_LABEL[role]} tasks`);
  return { count: depTasks.length, label: parts.join(" · ") };
}

/** The current user's highest-leverage unblocked, required, not-done task. */
export function nextUpTask(s: SetupState, role: string): SetupTask | null {
  const cand = visibleTasks(s).filter((t) => effectiveOwner(t, s) === role && t.required && !isTaskDone(t.id, s) && taskStatus(t, s).kind === "todo");
  cand.sort((a, b) => unlocks(b.id, s).count - unlocks(a.id, s).count || TASKS.indexOf(a) - TASKS.indexOf(b));
  return cand[0] ?? null;
}

export function allRequiredDone(s: SetupState): boolean { const c = counts(s); return c.requiredDone === c.requiredTotal; }
export function allLive(s: SetupState, f: GoLiveFacts): boolean { return goLive(s, f).every((c) => c.status === "Live"); }
export function setupComplete(s: SetupState, f: GoLiveFacts): boolean { return allRequiredDone(s) && allLive(s, f); }
