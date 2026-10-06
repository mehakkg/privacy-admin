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

/** The rendered value an audience/baseline shows for a sample. */
export function renderValue(masking: Masking | null, sample: string, fullRaw = false): string {
  if (!sample) return "—";
  if (fullRaw) return sample;
  if (!masking) return runMaskCore({ family: "full", params: { maskChar: "•" } }, sample); // hidden
  return runMaskCore(masking, sample);
}

/** A one-line plain-language label for a baseline/grant. */
export function choiceLabel(masking: Masking | null, fullRaw = false): string {
  if (fullRaw) return "Full raw value";
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
  if (fullRaw) return sample.replace(/[^A-Za-z0-9]/g, "").length + 1000; // full raw dominates
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
  /** same | more | full_raw | locked | not_used */
  kind: "same" | "more" | "full_raw" | "locked" | "not_used";
  example: string;
  choiceLabel: string;
  channelLabel: string | null;
  reason: string | null;
  /** Present on more/full_raw cells — the grant's level + scope, for editing + per-channel resolution. */
  grant: { fullRaw: boolean; family: string; params: Record<string, unknown>; channelIds: string[]; reason: string | null } | null;
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
