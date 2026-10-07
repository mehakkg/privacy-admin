/**
 * MASKING POLICY (DDM Console) — pure, client-safe layer.
 *
 * Reuses the four plain-language masking choices and the executor from
 * `@/lib/masking` (runMaskCore) so a rendered example is the same code path the
 * engine reports. Adds the policy model's own notions: rendering a baseline or a
 * grant to a sample value, visibility STRENGTH (how much real data is revealed),
 * and the Looser / Tighter / Neutral direction of a change. No DB import.
 */

import { runMaskCore, type Rule } from "@/lib/masking";

/** A masking choice = a function family + params (reusing the executor's shape). */
export type Masking = Rule;

/** The four choices this module offers. Never show function names. */
export interface MaskChoice { key: "full" | "partial" | "pattern" | "email"; label: string; description: string }
export const MASK_CHOICES: MaskChoice[] = [
  { key: "full", label: "Hide completely", description: "Nothing is shown." },
  { key: "partial", label: "Show first or last characters", description: "Reveal a few characters, mask the rest." },
  { key: "pattern", label: "Keep a pattern", description: "Show the value in a fixed shape, revealing the trailing characters." },
  { key: "email", label: "Email style", description: "Reveal a little of the name and keep the domain." },
];
export const CHOICE_LABEL: Record<string, string> = Object.fromEntries(MASK_CHOICES.map((c) => [c.key, c.label]));

export function defaultParamsForChoice(key: string): Record<string, unknown> {
  switch (key) {
    case "partial": return { showFirst: 0, showLast: 4, maskChar: "*" };
    case "pattern": return { template: "****-####" };
    case "email": return { localVisibleChars: 2, localVisibleLastChars: 2, domainMode: "PRESERVE" };
    default: return { maskChar: "*" };
  }
}

/** The rendered value an audience/baseline shows for a sample. family "reveal" = shown in full. */
export function renderValue(masking: Masking | null, sample: string, fullRaw = false): string {
  if (!sample) return "—";
  if (fullRaw || masking?.family === "reveal") return sample;
  if (!masking) return runMaskCore({ family: "full", params: { maskChar: "•" } }, sample); // hidden
  return runMaskCore(masking, sample);
}

// --- Sensitivity-driven masking (DLP tiers → strength → type profile) --------

export type Tier = "Restricted" | "Confidential" | "Internal" | "Public" | "Not classified";
export const TIERS: Tier[] = ["Restricted", "Confidential", "Internal", "Public"];
export const TIER_TONE: Record<string, { dot: string }> = {
  Restricted: { dot: "var(--red)" }, Confidential: { dot: "var(--yellow-700, #b45309)" },
  Internal: { dot: "var(--blue)" }, Public: { dot: "var(--text-4, #94a3b8)" }, "Not classified": { dot: "var(--border-strong, #c7ccd1)" },
};
export const TIER_DEFAULT_RANK: Record<string, number> = { Restricted: 4, Confidential: 3, Internal: 2, Public: 1 };

export interface Strength { rank: number; key: string; label: string }
export const STRENGTHS: Strength[] = [
  { rank: 4, key: "hide", label: "Hidden completely" },
  { rank: 3, key: "mostly", label: "Mostly hidden" },
  { rank: 2, key: "part", label: "Partly shown" },
  { rank: 1, key: "most", label: "Mostly shown" },
  { rank: 0, key: "full", label: "Shown in full" },
];
export const strengthLabel = (rank: number) => STRENGTHS.find((s) => s.rank === rank)?.label ?? "—";
export const LEGAL_MIN_RANK = 3; // regulated: never looser than Mostly hidden

export type DataType = "phone" | "email" | "government_id" | "card" | "account" | "name" | "date" | "ip" | "free_text";
export function inferDataType(code: string): DataType {
  const c = code.toUpperCase();
  if (/PHONE|MOBILE/.test(c)) return "phone";
  if (/EMAIL/.test(c)) return "email";
  if (/AADHAAR|PAN|PASSPORT|VOTER|LICENSE|UAN|ABHA|GOV/.test(c)) return "government_id";
  if (/CARD/.test(c)) return "card";
  if (/ACCOUNT|IBAN|UPI|WALLET/.test(c)) return "account";
  if (/NAME/.test(c)) return "name";
  if (/DOB|DATE|BIRTH/.test(c)) return "date";
  if (/IP_|IP_ADDRESS|\bIP\b/.test(c)) return "ip";
  return "free_text";
}

const P = (showFirst: number, showLast: number): Masking => ({ family: "partial", params: { showFirst, showLast, maskChar: "*" } });
const EM = (a: number, b: number): Masking => ({ family: "email", params: { localVisibleChars: a, localVisibleLastChars: b, domainMode: "PRESERVE" } });
const PAT = (t: string): Masking => ({ family: "pattern", params: { template: t } });
/** Per data type, the masking for Mostly hidden (3), Partly shown (2), Mostly shown (1). Illustrative. */
const TYPE_PROFILES: Record<DataType, Record<number, Masking>> = {
  phone: { 3: P(0, 4), 2: P(2, 4), 1: P(0, 8) },
  email: { 3: EM(0, 0), 2: EM(2, 2), 1: EM(6, 0) },
  government_id: { 3: P(0, 4), 2: P(2, 4), 1: P(6, 0) },
  card: { 3: P(0, 4), 2: P(4, 4), 1: P(6, 4) },
  account: { 3: P(0, 4), 2: P(4, 4), 1: P(6, 4) },
  name: { 3: P(0, 2), 2: P(2, 2), 1: P(8, 2) },
  date: { 3: PAT("0000-00-00"), 2: P(0, 4), 1: P(0, 7) },
  ip: { 3: P(0, 3), 2: P(0, 5), 1: P(0, 8) },
  free_text: { 3: P(0, 4), 2: P(2, 2), 1: P(0, 8) },
};

/** Derive a concrete masking from a strength rank + data type, honouring the legal-minimum cap. */
export function deriveMasking(dataType: DataType, rank: number, regulated: boolean): { rank: number; masking: Masking | null; cappedByLaw: boolean } {
  let r = rank, capped = false;
  if (regulated && r < LEGAL_MIN_RANK) { r = LEGAL_MIN_RANK; capped = true; }
  if (r >= 4) return { rank: 4, masking: { family: "full", params: { maskChar: "•" } }, cappedByLaw: capped };
  if (r <= 0) return { rank: 0, masking: { family: "reveal", params: {} }, cappedByLaw: capped };
  return { rank: r, masking: TYPE_PROFILES[dataType][r] ?? P(0, 4), cappedByLaw: capped };
}

/** A one-line plain-language label for a baseline/grant. */
export function choiceLabel(masking: Masking | null, fullRaw = false): string {
  if (fullRaw) return "Full raw value";
  if (masking?.family === "reveal") return "Shown in full";
  if (!masking) return "Hidden completely";
  switch (masking.family) {
    case "full": return "Hidden completely";
    case "partial": {
      const f = Number(masking.params.showFirst) || 0, l = Number(masking.params.showLast) || 0;
      const parts = [f ? `first ${f}` : "", l ? `last ${l}` : ""].filter(Boolean).join(" + ");
      return parts ? `Shows ${parts}` : "Hidden completely";
    }
    case "pattern": return `Keeps a pattern`;
    case "email": return "Email style";
    default: return CHOICE_LABEL[masking.family] ?? "Masked";
  }
}

/** Characters of the ORIGINAL value that survive in the rendered output. */
export function revealedCount(masking: Masking | null, sample: string, fullRaw = false): number {
  if (fullRaw || masking?.family === "reveal") return sample.replace(/[^A-Za-z0-9]/g, "").length + 1000; // full dominates
  if (!masking) return 0;
  const out = runMaskCore(masking, sample);
  let n = 0;
  for (let i = 0; i < Math.min(out.length, sample.length); i++) {
    if (out[i] === sample[i] && /[A-Za-z0-9]/.test(sample[i])) n++;
  }
  return n;
}

/** How much real data is revealed. Full raw > partial/pattern/email > full mask/hidden. */
export function strengthOf(masking: Masking | null, sample: string, fullRaw = false): number {
  return revealedCount(masking, sample, fullRaw);
}

export type Direction = "Looser" | "Tighter" | "Neutral";
export function directionOf(before: number, after: number): Direction {
  if (after > before) return "Looser";
  if (after < before) return "Tighter";
  return "Neutral";
}

// --- View types shared by server + client ----------------------------------

export type FieldStatus = "ready" | "needs_decision" | "not_used";

export interface CategoryHeader { id: string; name: string; definition: string; fieldCount: number; regulatedCount: number; changedCount: number }

export interface AudienceVisibility {
  audienceId: string;
  /** same | more | full_raw | less | locked | not_used */
  kind: "same" | "more" | "full_raw" | "less" | "locked" | "not_used";
  example: string;
  choiceLabel: string;
  channelLabel: string | null;
  reason: string | null;
  /** True when the field is equal to the baseline despite holding an exception. */
  noLongerNeeded: boolean;
  /** Other audiences whose restriction on this field beats this grant (overlap note). */
  overlaps: string[];
  /** Present on exception cells — the exception's level + scope + direction, for editing + per-channel resolution. */
  grant: { direction: "more" | "less"; fullRaw: boolean; family: string; params: Record<string, unknown>; channelIds: string[]; reason: string | null } | null;
}

export interface GridFieldRow {
  code: string;
  displayName: string;
  categoryId: string;
  origin: string;
  regulated: boolean;
  status: FieldStatus;
  isNew: boolean;
  announced: boolean;
  sampleValue: string;
  legalMinimum: Masking | null;
  /** Sensitivity-driven fields. */
  sensitivity: string;
  dataType: string;
  mode: "follows" | "custom" | "held";
  tierRank: number;      // the strength the tier would give (post-cap)
  strengthRank: number;  // the effective strength actually applied
  cappedByLaw: boolean;
  overrideReason: string | null;
  heldRank: number | null;
  baseline: { example: string; choiceLabel: string; masking: Masking | null; hidden: boolean };
  audiences: AudienceVisibility[];
}

export interface AudienceInfo { id: string; label: string; identifier: string }
export interface ChannelInfo { id: string; label: string; identifier: string }

export interface PolicyCheck {
  key: string;
  level: "blocking" | "warning" | "info";
  ok: boolean;
  message: string;
  /** Field/cell this concerns, for linking. */
  anchor?: { fieldCode?: string; audienceId?: string };
}

export interface ImpactItem {
  audienceId: string | null; // null = Everyone
  audienceLabel: string;
  fieldCode: string;
  fieldName: string;
  channelLabel: string | null;
  before: string;
  after: string;
  afterLabel: string;
  direction: Direction;
  fullRaw: boolean;
  reason: string | null;
}
