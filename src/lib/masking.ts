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

export type Family = "partial" | "full" | "pattern" | "format" | "email" | "hash" | "redact";

export interface FamilySpec {
  key: Family;
  label: string;
  description: string;
  reversible: boolean;
  /** Only offered on this channel, if set. */
  onlyChannel?: Channel;
}

/**
 * The eight built-in masking functions the engine supports. Labels are
 * PLAIN-LANGUAGE intents — the backend function names (PARTIAL_MASK, FULL_MASK,
 * PATTERN_MASK, FPE, EMAIL_MASK, HASH, REDACT, PASSTHROUGH) are never shown in the
 * UI. The eighth, "Show in full" (passthrough), is the REVEAL intent below.
 */
export const FAMILIES: FamilySpec[] = [
  { key: "partial", label: "Show last N / first N", description: "Reveal a few characters at the start or end; mask the rest.", reversible: false },
  { key: "full", label: "Hide completely", description: "Mask every character — nothing is shown.", reversible: false },
  { key: "pattern", label: "Keep a pattern", description: "Show the value in a fixed shape, revealing only the trailing characters.", reversible: false },
  { key: "format", label: "Keep the format", description: "Produce a same-shaped value — same length and character types — with the real data replaced.", reversible: true },
  { key: "email", label: "Email style", description: "Reveal a little of the name and keep the domain.", reversible: false },
  { key: "hash", label: "Replace with an irreversible token", description: "Swap the value for a fixed token. The original can never be recovered.", reversible: false },
  { key: "redact", label: "Remove the value", description: "Drop the value entirely — nothing is shown in its place.", reversible: false },
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

/**
 * A canonical, representative sample for each intent so the picker can show a
 * "before → after" preview on top of every card. Each uses a real masking rule
 * (so the "after" is what the engine would actually produce), not hand-typed.
 */
const INTENT_SAMPLE: Record<string, { value: string; rule: Rule }> = {
  partial: { value: "9860153210", rule: { family: "partial", params: { showFirst: 2, showLast: 2, maskChar: "*" } } },
  full: { value: "Ramkumar", rule: { family: "full", params: { maskChar: "*" } } },
  pattern: { value: "4111111111110366", rule: { family: "pattern", params: { template: "****-****-****-####" } } },
  format: { value: "9860153210", rule: { family: "format", params: {} } },
  email: { value: "karthik.nair@gmail.com", rule: { family: "email", params: { localVisibleChars: 2, localVisibleLastChars: 2, domainMode: "PRESERVE", maskChar: "*" } } },
  hash: { value: "9860153210", rule: { family: "hash", params: {} } },
  redact: { value: "confidential-note", rule: { family: "redact", params: {} } },
  [REVEAL]: { value: "Ramkumar", rule: { family: REVEAL, params: {} } },
};

/** { before, after } example for an intent card, or null if none is defined. */
export function intentPreview(key: string): { before: string; after: string } | null {
  const s = INTENT_SAMPLE[key];
  if (!s) return null;
  const after = runMaskCore(s.rule, s.value);
  return { before: s.value, after: after === "" ? "(removed)" : after };
}

// --- Strictness & the floor rule -------------------------------------------

/** redact > full > hash > format > pattern > email > partial > reveal. Higher
 *  = less real information is exposed. */
export const STRICTNESS_RANK: Record<string, number> = {
  redact: 7, full: 6, hash: 5, format: 4, pattern: 3, email: 2, partial: 1, reveal: 0,
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

/**
 * PLAIN-LANGUAGE description of a rule — e.g. "Show last 4", "Hidden completely",
 * "Pattern xxxx-xxxx-####", "Email · show first 2 + last 2, keep domain". Never
 * emits a backend function name.
 */
export function ruleLabel(rule: Rule | null | undefined): string {
  if (!rule) return "No rule";
  if (rule.family === REVEAL) return "Shown in full";
  switch (rule.family) {
    case "partial": {
      const s = showSummary(Number(rule.params.showFirst) || 0, Number(rule.params.showLast) || 0);
      return s === "none shown" ? "Masked" : `Show ${s}`;
    }
    case "full": return "Hidden completely";
    case "pattern": return `Pattern ${String(rule.params.template ?? "")}`;
    case "format": return "Format kept, value replaced";
    case "email": return `Email · show ${showSummary(Number(rule.params.localVisibleChars) || 0, Number(rule.params.localVisibleLastChars) || 0)}, keep domain`;
    case "hash": return "Irreversible token";
    case "redact": return "Removed";
    default: return FAMILY_LABEL[rule.family] ?? rule.family;
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

/**
 * FPE (format-preserving): replace each character with another of the SAME class
 * (digit→digit, upper→upper, lower→lower) so length and shape are kept but the
 * real value is gone. Pure and deterministic — illustrative, not the production
 * cipher. Reversible in principle, hence the "reversible" flag.
 */
function formatPreserve(value: string): string {
  const shift = 7;
  return value.split("").map((c) => {
    if (c >= "0" && c <= "9") return String((c.charCodeAt(0) - 48 + shift) % 10);
    if (c >= "A" && c <= "Z") return String.fromCharCode(((c.charCodeAt(0) - 65 + shift) % 26) + 65);
    if (c >= "a" && c <= "z") return String.fromCharCode(((c.charCodeAt(0) - 97 + shift) % 26) + 97);
    return c;
  }).join("");
}

/**
 * HASH: swap the value for a fixed, irreversible token. Uses a pure 32-bit string
 * digest (FNV-style) — illustrative masked output, never the production hash.
 */
function hashToken(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return "tok_" + (h >>> 0).toString(36).padStart(7, "0").slice(0, 8);
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
    case "format": return formatPreserve(value);
    case "email": return emailMask(value, Number(p.localVisibleChars) || 0, Number(p.localVisibleLastChars) || 0, String(p.domainMode ?? "PRESERVE"), ch);
    case "hash": return hashToken(value);
    case "redact": return "";
    default: return ch.repeat(value.length);
  }
}

/** "{sample} → {masked}". Redact (empty output) renders as "(removed)". */
export function maskPreview(rule: Rule, value: string): string {
  const out = runMaskCore(rule, value);
  return `${value} → ${out === "" ? "(removed)" : out}`;
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

/** Role/channel enforcement is not live: the resolver ALWAYS returns `default`. */
export const ENFORCEMENT_ACTIVE = false;

/** A role- or channel-scoped variant of a rule (the Visibility Matrix). */
export interface VariantView {
  id: string;
  scopeType: "role" | "channel" | string;
  scopeValue: string;
  family: string;
  params: Record<string, unknown>;
  label: string;
  preview: string;
  status: "approved" | "pending" | string;
}

/** A prior value of this field's tenant rule, for manual history-based revert. */
export interface RuleVersion {
  family: string;
  params: Record<string, unknown>;
  label: string;
  at: string;
  by: string;
  source: string;
}

export interface FieldResolution {
  code: string;
  name: string;
  sensitivity: string;
  sampleValue: string;
  detectionPattern: string | null;
  dataElementRef: string | null;
  hasRule: boolean;
  /** Override On/Off: a tenant rule exists but is switched off; resolution falls
   *  through live to the template/BASELINE, and the stored value is retained. */
  overrideOff: boolean;
  storedRule: { family: string; params: Record<string, unknown>; label: string } | null;
  /** The custom template this tenant rule was moved into, if any. */
  templateKey: string | null;
  /** Role/channel variants (Visibility Matrix) — never applied while enforcement is off. */
  variants: VariantView[];
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
