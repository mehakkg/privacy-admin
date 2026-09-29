/**
 * DYNAMIC DATA MASKING — pure, client-safe shared layer.
 *
 * Families, channels, layers, the strictness/floor rule, the rule-label
 * formatter and the masking executor (`runMaskCore`) that the engine and the
 * browser both call, so a live preview is the same code path the resolver
 * reports. No `node:crypto` and no `@/lib/db` import, so client components can
 * import this freely. The hash/tokenize previews use a pure digest — they are
 * illustrative masked output, not the production cryptographic function.
 */

// --- Channels ---------------------------------------------------------------

export const CHANNELS = [
  { key: "ui", label: "Admin UI" },
  { key: "api", label: "API responses" },
  { key: "exports", label: "Exports" },
  { key: "logs", label: "Logs" },
  { key: "nonprod", label: "Non-prod" },
] as const;
export type Channel = (typeof CHANNELS)[number]["key"];
export const CHANNEL_KEYS = CHANNELS.map((c) => c.key) as Channel[];
export const CHANNEL_LABEL: Record<string, string> = Object.fromEntries(CHANNELS.map((c) => [c.key, c.label]));

// --- Layers -----------------------------------------------------------------

export type Layer = "baseline" | "regional" | "tenant";
export const LAYER_PRECEDENCE: Record<Layer, number> = { baseline: 0, regional: 1, tenant: 2 };
export const LAYER_LABEL: Record<string, string> = { baseline: "Baseline", regional: "Regional", tenant: "Tenant" };

/** How a layer is named in the "Governed by" badge. Regional names its source. */
export function layerBadge(layer: string, source?: string | null): string {
  if (layer === "regional") return `${source ?? "Regional"} template`;
  if (layer === "baseline") return "Baseline";
  return "Tenant";
}

export const SENSITIVITIES = ["Sensitive", "Personal", "Internal"] as const;
export type Sensitivity = (typeof SENSITIVITIES)[number];
export const SENSITIVITY_TONE: Record<string, "red" | "yellow" | "gray"> = {
  Sensitive: "red",
  Personal: "yellow",
  Internal: "gray",
};

/** Roles that can hold an unmask exception. */
export const EXCEPTION_ROLES = ["Grievance Officer", "DPO", "Auditor", "Support Lead"];

// --- Families ---------------------------------------------------------------

export type Family = "partial" | "full" | "pattern" | "email";

export interface FamilySpec {
  key: Family;
  label: string;
  description: string;
  reversible: boolean;
  /** Only offered on this channel, if set. */
  onlyChannel?: Channel;
}

/** The four masking functions the engine supports (see the appendix reference). */
export const FAMILIES: FamilySpec[] = [
  { key: "partial", label: "Partial mask", description: "Show the first/last N characters, mask the rest. Params: showFirst, showLast.", reversible: false },
  { key: "full", label: "Full mask", description: "Mask every character — nothing shown.", reversible: false },
  { key: "pattern", label: "Pattern mask", description: "Apply a template; # reveals a trailing character, other characters are literal. Param: template.", reversible: false },
  { key: "email", label: "Email mask", description: "Mask the local part, keep first/last N, preserve the domain. Params: localVisibleChars, localVisibleLastChars, domainMode.", reversible: false },
];

export const FAMILY_LABEL: Record<string, string> = Object.fromEntries(FAMILIES.map((f) => [f.key, f.label]));
export function reversibleOf(family: string): boolean {
  return !!FAMILIES.find((f) => f.key === family)?.reversible;
}

/** The weakest "intent": no masking at all. Offered only for non-sensitive fields. */
export const REVEAL = "reveal";

/**
 * Intent cards for the Create-rule stepper — the families plus "Show in full"
 * (reveal). `sensitiveHidden` intents are omitted when any selected field is
 * Sensitive or SYSTEM-regulated.
 */
export interface IntentCard { key: string; label: string; description: string; onlyChannel?: Channel; sensitiveHidden?: boolean }
export const INTENTS: IntentCard[] = [
  ...FAMILIES.map((f) => ({ key: f.key, label: f.label, description: f.description, onlyChannel: f.onlyChannel })),
  { key: REVEAL, label: "Show in full", description: "No masking — the value is shown as-is.", sensitiveHidden: true },
];

// --- Strictness & the floor rule -------------------------------------------

/** full (4) > pattern (3) > email (2) > partial (1) > reveal (0). */
export const STRICTNESS_RANK: Record<string, number> = {
  full: 4, pattern: 3, email: 2, partial: 1, reveal: 0,
};

export interface Rule {
  family: Family | string;
  params: Record<string, unknown>;
}

/** Higher = stricter. Within `partial`/`email`, fewer visible characters is stricter. */
export function strictness(rule: Rule): number {
  const rank = STRICTNESS_RANK[rule.family] ?? 0;
  let base = rank * 100;
  if (rule.family === "partial") {
    base -= (Number(rule.params.showFirst) || 0) + (Number(rule.params.showLast) || 0);
  } else if (rule.family === "email") {
    base -= (Number(rule.params.localVisibleChars) || 0) + (Number(rule.params.localVisibleLastChars) || 0);
  }
  return base;
}

/** A candidate rule is allowed at a higher layer only if it is equal or stricter than the floor. */
export function meetsFloor(candidate: Rule, floor: Rule | null): boolean {
  if (!floor) return true;
  return strictness(candidate) >= strictness(floor);
}

// --- Rule label -------------------------------------------------------------

function showSummary(first: number, last: number): string {
  const parts: string[] = [];
  if (first) parts.push(`first ${first}`);
  if (last) parts.push(`last ${last}`);
  return parts.length ? parts.join(" + ") : "none shown";
}

/** "{Family label} · {params}", e.g. "Partial mask · last 4", "Pattern mask · xxxx-xxxx-####". */
export function ruleLabel(rule: Rule | null | undefined): string {
  if (!rule) return "No rule";
  if (rule.family === REVEAL) return "Show in full";
  const label = FAMILY_LABEL[rule.family] ?? rule.family;
  switch (rule.family) {
    case "partial": return `${label} · ${showSummary(Number(rule.params.showFirst) || 0, Number(rule.params.showLast) || 0)}`;
    case "full": return label;
    case "pattern": return `${label} · ${String(rule.params.template ?? "")}`;
    case "email": return `${label} · ${showSummary(Number(rule.params.localVisibleChars) || 0, Number(rule.params.localVisibleLastChars) || 0)}, domain ${String(rule.params.domainMode ?? "PRESERVE").toLowerCase()}`;
    default: return label;
  }
}

// --- Executor (runMaskCore) — the four masking functions --------------------

/** PARTIAL_MASK: show first N + last M, mask everything else (separators too). */
function partialMask(value: string, first: number, last: number, ch: string): string {
  const len = value.length;
  if (first + last >= len) return value;
  return value.split("").map((c, i) => (i < first || i >= len - last ? c : ch)).join("");
}

/** PATTERN_MASK: template with '#' filled left-to-right by the value's last-K chars. */
function patternMask(value: string, template: string): string {
  const hashes = (template.match(/#/g) || []).length;
  const revealed = hashes > 0 ? value.slice(-hashes) : "";
  let ri = 0;
  return template.split("").map((c) => (c === "#" ? revealed[ri++] ?? c : c)).join("");
}

/** EMAIL_MASK: mask the local part (keep first/last N), preserve or mask the domain. */
function emailMask(value: string, first: number, last: number, domainMode: string, ch: string): string {
  const at = value.indexOf("@");
  const local = at >= 0 ? value.slice(0, at) : value;
  const domain = at >= 0 ? value.slice(at) : "";
  const maskedLocal = partialMask(local, first, last, ch);
  const outDomain = domainMode === "PRESERVE" || !domain ? domain : "@" + ch.repeat(Math.max(1, domain.length - 1));
  return maskedLocal + outDomain;
}

/** Apply a masking function to a value. Always returns a string (no failure state). */
export function runMaskCore(rule: Rule, value: string): string {
  if (rule.family === REVEAL) return value;
  if (!value) return "";
  const p = rule.params ?? {};
  const ch = typeof p.maskChar === "string" && p.maskChar ? String(p.maskChar) : "*";
  switch (rule.family) {
    case "partial": return partialMask(value, Number(p.showFirst) || 0, Number(p.showLast) || 0, ch);
    case "full": return ch.repeat(value.length);
    case "pattern": return patternMask(value, String(p.template ?? ""));
    case "email": return emailMask(value, Number(p.localVisibleChars) || 0, Number(p.localVisibleLastChars) || 0, String(p.domainMode ?? "PRESERVE"), ch);
    default: return ch.repeat(value.length);
  }
}

/** "{sample} → {masked}". */
export function maskPreview(rule: Rule, value: string): string {
  return `${value} → ${runMaskCore(rule, value)}`;
}

/** Compact relative time, e.g. "2h ago", "3d ago". */
export function formatRelative(date: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30); if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

// --- Resolution result shape ------------------------------------------------

// --- Lock treatments --------------------------------------------------------

export type LockTreatment = "system" | "self" | "governed" | "none";

/**
 * How a winning rule is locked, which decides the drawer treatment:
 *  - system   → SUPER_ADMIN permanent floor (Aadhaar/PAN/ABHA): no action at all.
 *  - self     → the tenant's own locked item: an Unlock action is offered.
 *  - governed → a regional/baseline rule: read-only, changes are DPO proposals.
 *  - none     → the tenant's own editable rule.
 */
export function lockTreatmentOf(layer: string, locked: boolean, systemRegulated: boolean): LockTreatment {
  if (systemRegulated) return "system";
  if (layer === "tenant") return locked ? "self" : "none";
  return locked ? "governed" : "governed"; // regional/baseline are always governed
}

// --- Templates --------------------------------------------------------------

export interface TemplateView {
  key: string;
  name: string;
  kind: "baseline" | "regional";
  associated: boolean;
  fields: number;
}

// --- Rule groups ------------------------------------------------------------

export type GroupState = "in_sync" | "diverged";

export interface RuleGroupView {
  id: string;
  name: string;
  family: string;
  params: Record<string, unknown>;
  label: string;
  memberCodes: string[];
  memberCount: number;
  state: GroupState;
  divergedCodes: string[];
  createdBy: string | null;
}

/** Per-field outcome of applying one rule (Create-rule Step 4). */
export interface PlanRow {
  code: string;
  name: string;
  currentSource: string;
  outcome: "apply" | "approval" | "blocked";
  reason: string | null;
}

/** A single rule change within a proposal/edit: a layer's default (channel null) or one channel. */
export interface RulePatch {
  layer: string;
  channel: string | null;
  family: string;
  params: Record<string, unknown>;
}

export interface LayerView {
  layer: Layer | string;
  source: string | null;
  family: string;
  params: Record<string, unknown>;
  label: string;
  preview: string;
  locked: boolean;
  systemRegulated: boolean;
  citation: string | null;
  won: boolean;
}

export interface ChannelView {
  channel: Channel | string;
  channelLabel: string;
  family: string;
  params: Record<string, unknown>;
  label: string;
  preview: string;
  sourceLayer: string;
  isOverride: boolean;
}

export interface ExceptionView {
  id: string;
  role: string;
  purpose: string;
  durationMinutes: number;
  approvedBy: string | null;
  expiresAt: string | null;
}

export interface FieldResolution {
  code: string;
  name: string;
  sensitivity: string;
  sampleValue: string;
  detectionPattern: string | null;
  dataElementRef: string | null;
  hasRule: boolean;
  /** resolved | ambiguous (two non-BASELINE templates) | no_rule. */
  status: "resolved" | "ambiguous" | "no_rule";
  /** Present only when status === "ambiguous": the colliding sources. */
  ambiguity: { sources: string[] } | null;
  /** The winning layer's default rule. */
  effective: { family: string; params: Record<string, unknown>; label: string; preview: string; reversible: boolean } | null;
  governedBy: { layer: string; source: string | null; badge: string; locked: boolean; systemRegulated: boolean; treatment: LockTreatment; stricter: boolean; stricterOver: string | null } | null;
  citation: string | null;
  /** The winning-source bucket for the coverage tiles: each field counted once. */
  winningSource: "baseline" | "regional" | "tenant" | "attention";
  chain: LayerView[];
  channels: ChannelView[];
  overrideCount: number;
  exceptions: ExceptionView[];
  pendingChangeId: string | null;
  createdBy: string | null;
}
