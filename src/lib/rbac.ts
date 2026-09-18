/**
 * Identity & Access domain: the atomic capability catalogue, separation-of-duties
 * (SoD) conflict rules, and the helpers that turn a set of capabilities into a
 * plain-English summary, a sensitivity count and a drift severity. One source of
 * truth for the Role Composer, the Approval Queue preview and the Drift diff.
 */

export type Sensitivity = "normal" | "high";
export type MacroNav = "OPERATE" | "CONFIGURE" | "GOVERN & REVIEW";

export interface Capability {
  id: string;
  /** Product module the capability acts within. */
  module: string;
  /** The action granted, in plain words. */
  action: string;
  /** One-line description of what holding it lets someone do. */
  description: string;
  sensitivity: Sensitivity;
  group: MacroNav;
}

/**
 * The catalogue, grouped by macro-nav. Opt-in only — nothing is granted by
 * default. High-sensitivity capabilities are the ones that reach personal data in
 * bulk, execute irreversible actions, or touch governance decisions.
 */
export const CAPABILITY_CATALOG: Capability[] = [
  // OPERATE — day-to-day execution.
  { id: "requests.view", module: "Rights Requests", action: "View requests", description: "See the rights-request queue and case detail.", sensitivity: "normal", group: "OPERATE" },
  { id: "requests.execute", module: "Rights Requests", action: "Execute erasure/access", description: "Run deletion and access fulfilment across connected systems.", sensitivity: "high", group: "OPERATE" },
  { id: "discovery.scan", module: "Data Map", action: "Run discovery scans", description: "Trigger scans on DPO-approved sources.", sensitivity: "normal", group: "OPERATE" },
  { id: "inventory.review", module: "Data Map", action: "Review classifications", description: "Approve or override classified fields in the inventory.", sensitivity: "normal", group: "OPERATE" },
  { id: "consent.publish", module: "Consent & Notices", action: "Publish notices", description: "Publish approved notice versions to regions.", sensitivity: "normal", group: "OPERATE" },
  { id: "breach.record", module: "Breach", action: "Record incidents", description: "Log and update breach incidents.", sensitivity: "normal", group: "OPERATE" },

  // CONFIGURE — settings and provisioning.
  { id: "sources.connect", module: "Data Map", action: "Connect sources", description: "Register and configure discovery sources and integrations.", sensitivity: "normal", group: "CONFIGURE" },
  { id: "access.provision", module: "Identity & Access", action: "Provision access", description: "Assign approved roles to people and provision them across systems.", sensitivity: "high", group: "CONFIGURE" },
  { id: "access.deprovision", module: "Identity & Access", action: "Deprovision access", description: "Revoke access and confirm removal across systems.", sensitivity: "high", group: "CONFIGURE" },
  { id: "vendor.manage", module: "Vendor Risk", action: "Manage vendors", description: "Maintain the vendor register and DPA records.", sensitivity: "normal", group: "CONFIGURE" },
  { id: "notifications.configure", module: "Settings", action: "Configure notifications", description: "Set up channels, webhooks and routing rules.", sensitivity: "normal", group: "CONFIGURE" },

  // GOVERN & REVIEW — oversight and evidence.
  { id: "audit.view", module: "Risk & Compliance", action: "View audit log", description: "Read the immutable audit trail and evidence records.", sensitivity: "normal", group: "GOVERN & REVIEW" },
  { id: "audit.export", module: "Risk & Compliance", action: "Export evidence", description: "Export audit and evidence packs for regulators.", sensitivity: "high", group: "GOVERN & REVIEW" },
  { id: "policy.approve", module: "Approved Policy", action: "Approve policy", description: "Ratify purposes, roles and protection rules (DPO/CISO only).", sensitivity: "high", group: "GOVERN & REVIEW" },
  { id: "roles.compose", module: "Identity & Access", action: "Compose roles", description: "Build and submit custom roles for approval.", sensitivity: "normal", group: "GOVERN & REVIEW" },
  { id: "drift.resolve", module: "Identity & Access", action: "Resolve drift", description: "Decide drift outcomes — correct to baseline or request re-approval.", sensitivity: "normal", group: "GOVERN & REVIEW" },
];

export const MACRO_NAV_ORDER: MacroNav[] = ["OPERATE", "CONFIGURE", "GOVERN & REVIEW"];

const CAP_BY_ID = new Map(CAPABILITY_CATALOG.map((c) => [c.id, c]));
export const capabilityById = (id: string): Capability | undefined => CAP_BY_ID.get(id);

/**
 * Separation-of-duties conflicts: two capabilities that must not sit in one role,
 * with the rule spelled out for the composer's blocking modal (never a generic
 * error). Order-independent.
 */
export interface SodRule {
  a: string;
  b: string;
  rule: string;
}
export const SOD_RULES: SodRule[] = [
  { a: "access.provision", b: "policy.approve", rule: "Someone who provisions access cannot also ratify policy — the grantor must not be the approver (SoD: request vs. approval)." },
  { a: "access.provision", b: "access.deprovision", rule: "Granting and revoking access in one role removes the second pair of eyes over the access lifecycle (SoD: create vs. remove)." },
  { a: "requests.execute", b: "audit.export", rule: "Executing erasure and exporting the audit evidence for it cannot be the same role — the actor must not curate the record of their own action (SoD: act vs. attest)." },
];

/** Returns the SoD rules violated by a set of selected capability ids. */
export function sodConflicts(selectedIds: string[]): { rule: SodRule; a: Capability; b: Capability }[] {
  const set = new Set(selectedIds);
  const out: { rule: SodRule; a: Capability; b: Capability }[] = [];
  for (const r of SOD_RULES) {
    if (set.has(r.a) && set.has(r.b)) {
      const a = CAP_BY_ID.get(r.a);
      const b = CAP_BY_ID.get(r.b);
      if (a && b) out.push({ rule: r, a, b });
    }
  }
  return out;
}

export function highSensitivityCount(selectedIds: string[]): number {
  return selectedIds.filter((id) => CAP_BY_ID.get(id)?.sensitivity === "high").length;
}

/** Plain-English one-liner describing what a role lets someone do. */
export function summarise(selectedIds: string[]): string {
  if (selectedIds.length === 0) return "This role grants nothing yet — add capabilities to build it up.";
  const caps = selectedIds.map((id) => CAP_BY_ID.get(id)).filter(Boolean) as Capability[];
  const actions = caps.map((c) => c.action.toLowerCase());
  const high = caps.filter((c) => c.sensitivity === "high").length;
  const list = actions.length <= 3 ? actions.join(", ") : `${actions.slice(0, 3).join(", ")} and ${actions.length - 3} more`;
  return `Lets the holder ${list}${high ? `, including ${high} high-sensitivity ${high === 1 ? "capability" : "capabilities"}` : ""}.`;
}

// -- Status / severity vocab -------------------------------------------------
export const ROLE_STATUS_LABEL: Record<string, string> = {
  approved: "Approved",
  draft: "Draft",
  pending_dpo_approval: "Pending DPO approval",
};
export const ROLE_STATUS_TONE: Record<string, "green" | "gray" | "yellow"> = {
  approved: "green",
  draft: "gray",
  pending_dpo_approval: "yellow",
};

/** Drift severity: critical if any high-sensitivity capability was added beyond
 *  baseline; otherwise minor. Computed from the delta, not stored blindly. */
export function driftSeverity(baseline: string[], current: string[]): "critical" | "minor" {
  const base = new Set(baseline);
  const added = current.filter((id) => !base.has(id));
  return added.some((id) => CAP_BY_ID.get(id)?.sensitivity === "high") ? "critical" : "minor";
}

/** The delta between two capability sets, for the drift diff view. */
export function capabilityDiff(baseline: string[], current: string[]) {
  const base = new Set(baseline);
  const cur = new Set(current);
  return {
    added: current.filter((id) => !base.has(id)),
    removed: baseline.filter((id) => !cur.has(id)),
    unchanged: current.filter((id) => base.has(id)),
  };
}
