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

// ---------------------------------------------------------------------------
// Starter templates for the creation panel. Each ships Rule 3-shaped content
// (the three links plus itemisation/purpose scaffolding) so a notice created
// from one starts far closer to publishable than a blank draft does.
// ---------------------------------------------------------------------------

export interface NoticeTemplate {
  id: string;
  name: string;
  description: string;
  suggestedCategory: string;
  content: string;
}

const LINKS =
  "You may withdraw consent at any time: https://example.in/consent/withdraw. " +
  "Exercise your rights (access, correct, erase, nominate): https://example.in/rights. " +
  "Complain to the Data Protection Board: https://example.in/grievance/board.";

export const NOTICE_TEMPLATES: NoticeTemplate[] = [
  {
    id: "tpl_privacy",
    name: "Customer privacy notice",
    description: "General-purpose s.5 notice covering identity, contact, KYC and transaction data.",
    suggestedCategory: "kyc",
    content:
      "We collect and process the following personal data — identity, contact, KYC and " +
      "transaction records — to open and service your accounts, meet our regulatory " +
      "obligations, and prevent fraud. " + LINKS,
  },
  {
    id: "tpl_cookie",
    name: "Cookie notice",
    description: "Behavioural analytics and cookie disclosure for web properties.",
    suggestedCategory: "behavioural",
    content:
      "This site uses cookies for behavioural analytics to improve the service. We collect " +
      "device and usage data. " + LINKS,
  },
  {
    id: "tpl_marketing",
    name: "Marketing consent notice",
    description: "Opt-in notice for marketing communications, consent-first.",
    suggestedCategory: "marketing",
    content:
      "We would like to send you marketing communications about our products, using your " +
      "contact details and marketing preferences. This is entirely optional. " + LINKS,
  },
  {
    id: "tpl_employee",
    name: "Employee data notice",
    description: "Processing notice for employee identity, contact and payroll data.",
    suggestedCategory: "identity",
    content:
      "We process your identity, contact and payroll data to administer your employment, " +
      "meet statutory obligations, and operate benefits. " + LINKS,
  },
];
