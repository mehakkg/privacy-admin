/**
 * Notice domain logic that both the server (gating publish) and the client
 * (rendering the checklist) need to agree on — so it lives in one place rather
 * than being re-derived on each side and drifting.
 */

import { REGIONS, SCHEDULE_8_LANGUAGES } from "@/lib/domain";

// ---------------------------------------------------------------------------
// Rule 3 compliance — DPDP Rules 2025, Rule 3.
//
// A notice must itemise the personal data, state the specified purpose, and
// carry three links: withdraw consent, exercise rights, complain to the Board.
// These are CHECKED, not assumed: the three links are auto-detected in the body
// where that is reliable; the two prose requirements can only be confirmed
// manually (with a note saying where). All five gate Publish.
// ---------------------------------------------------------------------------

export type Rule3Key =
  | "itemization"
  | "purpose"
  | "withdrawLink"
  | "rightsLink"
  | "boardLink";

export interface Rule3ItemDef {
  key: Rule3Key;
  label: string;
  /** Links are auto-detectable; the two prose statements are manual-only. */
  autoDetectable: boolean;
  hint: string;
}

export const RULE3_ITEMS: Rule3ItemDef[] = [
  {
    key: "itemization",
    label: "Itemised personal data description present",
    autoDetectable: false,
    hint: "The specific categories of personal data collected are listed, not described in general terms.",
  },
  {
    key: "purpose",
    label: "Specified purpose stated",
    autoDetectable: false,
    hint: "The purpose of processing is stated specifically, matching the linked Purpose.",
  },
  {
    key: "withdrawLink",
    label: "Link to withdraw consent",
    autoDetectable: true,
    hint: "A link the Data Principal can use to withdraw consent as easily as it was given.",
  },
  {
    key: "rightsLink",
    label: "Link to exercise rights",
    autoDetectable: true,
    hint: "A link to access, correct, or erase their data, or nominate.",
  },
  {
    key: "boardLink",
    label: "Link to complain to the Board",
    autoDetectable: true,
    hint: "A link or route to raise a grievance with the Data Protection Board.",
  },
];

/** Manual confirmations, keyed by item, each carrying the required note. */
export type Rule3Manual = Partial<Record<Rule3Key, { note: string }>>;

const LINK_PATTERNS: Record<Extract<Rule3Key, "withdrawLink" | "rightsLink" | "boardLink">, RegExp> = {
  // A URL/route on the same line as an intent keyword — the shape a real link
  // in the body takes, rather than a bare mention of the word.
  withdrawLink: /(withdraw|revoke)[^\n]*?(https?:\/\/|\/[a-z]|\[)/i,
  rightsLink: /(exercise|access|correct|erasure|your rights)[^\n]*?(https?:\/\/|\/[a-z]|\[)/i,
  boardLink: /(board|grievance|complain)[^\n]*?(https?:\/\/|\/[a-z]|\[)/i,
};

export interface Rule3ItemResult extends Rule3ItemDef {
  auto: boolean;
  manual: boolean;
  note: string | null;
  ok: boolean;
}

export interface Rule3Result {
  items: Rule3ItemResult[];
  complete: boolean;
  /** How many of the five are satisfied — for the panel header and metrics. */
  satisfied: number;
}

export function evaluateRule3(content: string, manual: Rule3Manual): Rule3Result {
  const items = RULE3_ITEMS.map<Rule3ItemResult>((def) => {
    const auto =
      def.autoDetectable && def.key in LINK_PATTERNS
        ? LINK_PATTERNS[def.key as keyof typeof LINK_PATTERNS].test(content)
        : false;
    const m = manual[def.key];
    const manualOk = Boolean(m);
    return {
      ...def,
      auto,
      manual: manualOk,
      note: m?.note ?? null,
      ok: auto || manualOk,
    };
  });
  const satisfied = items.filter((i) => i.ok).length;
  return { items, complete: satisfied === items.length, satisfied };
}

// ---------------------------------------------------------------------------
// Region ↔ language expectation.
//
// A region that plausibly needs a specific Eighth Schedule language, so the
// Variants tab can flag "Maharashtra is selected but no Marathi variant exists"
// instead of letting a region/language mismatch pass silently.
// ---------------------------------------------------------------------------

export const REGION_LANGUAGE_HINT: Record<string, string> = {
  "IN-MH": "mr", // Maharashtra → Marathi
  "IN-KA": "kn", // Karnataka → Kannada
  "IN-TN": "ta", // Tamil Nadu → Tamil
  "IN-DL": "hi", // Delhi → Hindi
};

export function regionLabel(code: string): string {
  return REGIONS.find((r) => r.code === code)?.label ?? code;
}

export function languageLabel(code: string): string {
  return SCHEDULE_8_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

export interface RegionLanguageGap {
  region: string;
  regionLabel: string;
  language: string;
  languageLabel: string;
}

/** Regions whose hinted language has no variant with content. */
export function regionLanguageGaps(regions: string[], variantLangs: string[]): RegionLanguageGap[] {
  const have = new Set(variantLangs);
  const gaps: RegionLanguageGap[] = [];
  for (const region of regions) {
    const lang = REGION_LANGUAGE_HINT[region];
    if (lang && !have.has(lang)) {
      gaps.push({
        region,
        regionLabel: regionLabel(region),
        language: lang,
        languageLabel: languageLabel(lang),
      });
    }
  }
  return gaps;
}

/** State-level region codes (everything except the "all India" umbrella). */
export const STATE_REGIONS = REGIONS.filter((r) => r.code !== "IN");
export const ALL_INDIA = "IN";
