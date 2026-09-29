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

export type Family = "partial" | "full" | "fpe" | "hash" | "tokenize" | "generalize" | "synthetic";

export interface FamilySpec {
  key: Family;
  label: string;
  description: string;
  reversible: boolean;
  /** Only offered on this channel, if set. */
  onlyChannel?: Channel;
}

export const FAMILIES: FamilySpec[] = [
  { key: "partial", label: "Partial reveal", description: "Reveal a few leading/trailing characters, mask the rest.", reversible: false },
  { key: "full", label: "Full redaction", description: "Replace the whole value — nothing recoverable.", reversible: false },
  { key: "fpe", label: "Format-preserving", description: "Encrypt while keeping the shape (digits, letters, separators).", reversible: true },
  { key: "hash", label: "Hash", description: "One-way SHA-256 digest — stable but irreversible.", reversible: false },
  { key: "tokenize", label: "Tokenize", description: "Swap for a vault token that can be reversed with authority.", reversible: true },
  { key: "generalize", label: "Generalize", description: "Reduce precision to a bucket (age band, area prefix).", reversible: false },
  { key: "synthetic", label: "Synthetic value", description: "Replace with realistic fake data — non-production only.", reversible: false, onlyChannel: "nonprod" },
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

/** full (6) > hash (5) > generalize (4) > tokenize (3) > fpe (2) > partial (1) > reveal (0). */
export const STRICTNESS_RANK: Record<string, number> = {
  full: 6, hash: 5, generalize: 4, tokenize: 3, fpe: 2, partial: 1, reveal: 0,
};

export interface Rule {
  family: Family | string;
  params: Record<string, unknown>;
}

/** Higher = stricter. Within `partial`, fewer revealed characters is stricter. */
export function strictness(rule: Rule): number {
  const rank = STRICTNESS_RANK[rule.family as Family] ?? 0;
  let base = rank * 100;
  if (rule.family === "partial") {
    const revealed = (Number(rule.params.revealFirst) || 0) + (Number(rule.params.revealLast) || 0);
    base -= revealed; // fewer revealed → stricter
  }
  return base;
}

/** A candidate rule is allowed at a higher layer only if it is equal or stricter than the floor. */
export function meetsFloor(candidate: Rule, floor: Rule | null): boolean {
  if (!floor) return true;
  return strictness(candidate) >= strictness(floor);
}

// --- Rule label -------------------------------------------------------------

function partialSummary(p: Record<string, unknown>): string {
  const first = Number(p.revealFirst) || 0;
  const last = Number(p.revealLast) || 0;
  const domain = !!p.preserveDomain;
  const parts: string[] = [];
  if (first) parts.push(`first ${first}`);
  if (last) parts.push(`last ${last}`);
  if (domain) parts.push("domain");
  return parts.length ? parts.join(" + ") : "none revealed";
}

export const GENERALIZE_BUCKETS: Record<string, string> = {
  age5: "5-year age band",
  age10: "10-year age band",
  pincode3: "first 3 of pincode",
};

/** "{Family label} · {params}", e.g. "Partial reveal · last 4", "Hash · irreversible". */
export function ruleLabel(rule: Rule | null | undefined): string {
  if (!rule) return "No rule";
  if (rule.family === REVEAL) return "Show in full";
  const label = FAMILY_LABEL[rule.family] ?? rule.family;
  switch (rule.family) {
    case "partial": return `${label} · ${partialSummary(rule.params)}`;
    case "full": return label;
    case "hash": return `${label} · irreversible`;
    case "tokenize": return `${label} · reversible`;
    case "fpe": return `${label} · reversible`;
    case "generalize": return `${label} · ${GENERALIZE_BUCKETS[String(rule.params.bucket)] ?? "bucketed"}`;
    case "synthetic": return `${label} · ${String(rule.params.generator ?? "synthetic")}`;
    default: return label;
  }
}

// --- Executor (runMaskCore) -------------------------------------------------

/** Pure, deterministic hex digest — illustrative only, NOT the production hash. */
function hexDigest(value: string, n: number): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let out = "";
  let x = h >>> 0;
  while (out.length < n) {
    out += (x >>> 0).toString(16).padStart(8, "0");
    x = Math.imul(x ^ (x >>> 13), 0x01000193) >>> 0;
  }
  return out.slice(0, n);
}

function maskMiddle(value: string, first: number, last: number, ch: string): string {
  const len = value.length;
  return value
    .split("")
    // Reveal the first/last window; keep separators (dashes, spaces) so a grouped
    // identifier stays legible, e.g. "2345-1234-9012" → "xxxx-xxxx-9012".
    .map((c, i) => (i < first || i >= len - last || /[^A-Za-z0-9]/.test(c) ? c : ch))
    .join("");
}

function fpe(value: string): string {
  // Format-preserving: remap each digit/letter to another of the same class,
  // deterministically; keep separators. Illustrative, not real FPE.
  const shift = (hexDigest(value, 2).charCodeAt(0) % 7) + 1;
  return value.replace(/[0-9]/g, (d) => String((Number(d) + shift) % 10))
    .replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + shift) % 26) + 97))
    .replace(/[A-Z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 65 + shift) % 26) + 65));
}

function generalize(value: string, bucket: string): string {
  if (bucket === "pincode3") return `${value.replace(/\s/g, "").slice(0, 3)}xxx`;
  // age band from a YYYY-MM-DD style value.
  const m = value.match(/(\d{4})/);
  if (m) {
    const age = 2026 - Number(m[1]);
    const size = bucket === "age10" ? 10 : 5;
    const lo = Math.max(0, Math.floor(age / size) * size);
    return `${lo}–${lo + size - 1}`;
  }
  return "bucketed";
}

/** Apply a masking family to a value. Always returns a string (no failure state). */
export function runMaskCore(rule: Rule, value: string): string {
  if (rule.family === REVEAL) return value;
  if (!value) return "";
  const p = rule.params ?? {};
  const ch = typeof p.maskChar === "string" && p.maskChar ? String(p.maskChar) : "*";
  switch (rule.family) {
    case "partial": {
      const first = Number(p.revealFirst) || 0;
      const last = Number(p.revealLast) || 0;
      if (p.preserveDomain && value.includes("@")) {
        const at = value.indexOf("@");
        const local = value.slice(0, at);
        return maskMiddle(local, first, last, ch) + value.slice(at);
      }
      return maskMiddle(value, first, last, ch);
    }
    case "full": return ch.repeat(Math.max(6, Math.min(value.length, 12)));
    case "hash": { const h = hexDigest(value, 8); return `${h.slice(0, 4)}…${h.slice(4)}`; }
    case "tokenize": return `tok_${hexDigest(value, 4)}…`;
    case "fpe": return fpe(value);
    case "generalize": return generalize(value, String(p.bucket ?? "age5"));
    case "synthetic": return `SYN-${hexDigest(value, 6).toUpperCase()}`;
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
