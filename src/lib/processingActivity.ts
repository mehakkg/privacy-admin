/**
 * Shared domain helpers for the Processing Activities register: lawful basis,
 * jurisdiction / cross-border, and the activity rollup. Kept in one file so the
 * table, the request flow and the seed all read the same definitions rather than
 * each spelling them out (and drifting).
 */

// -- Lawful basis (DPDP Act) -------------------------------------------------
// DPO-set on the PurposeTag. The label carries the statutory hook so a reviewer
// can trace it, matching how deadlines cite their rule elsewhere in the product.
export type LawfulBasis = "consent" | "legitimate_use" | "contractual";

export const LAWFUL_BASIS_LABEL: Record<LawfulBasis, string> = {
  consent: "Consent",
  legitimate_use: "Legitimate use (S.7)",
  contractual: "Contractual necessity",
};

export function lawfulBasisLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  return LAWFUL_BASIS_LABEL[v as LawfulBasis] ?? v;
}

// -- Jurisdiction / cross-border ---------------------------------------------
// India is home. Cross-border transfer is allowed to notified countries; a
// destination outside India that is NOT on the allowlist is flagged
// "Cross-border — unreviewed" rather than silently accepted. Modelled as an
// allowlist because that is the shape the spec calls for; the notified list is a
// governance input, centralised here so a correction is a one-line edit.
export const HOME_JURISDICTION = "IN";
export const NOTIFIED_COUNTRY_ALLOWLIST = new Set(["IN", "SG", "AE", "JP"]);

export const JURISDICTION_LABEL: Record<string, string> = {
  IN: "India",
  US: "United States",
  EU: "European Union",
  SG: "Singapore",
  AE: "United Arab Emirates",
  JP: "Japan",
  GB: "United Kingdom",
  AU: "Australia",
};

export function jurisdictionLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return JURISDICTION_LABEL[code] ?? code;
}

/** True when the processor sits outside India and off the notified allowlist. */
export function isCrossBorderUnreviewed(jurisdiction: string | null | undefined): boolean {
  if (!jurisdiction) return false; // unknown jurisdiction is a separate gap, not a cross-border flag
  return jurisdiction !== HOME_JURISDICTION && !NOTIFIED_COUNTRY_ALLOWLIST.has(jurisdiction);
}

// -- Activity lifecycle ------------------------------------------------------
export type LifecycleState = "active" | "under_review" | "archived";

export const LIFECYCLE_LABEL: Record<LifecycleState, string> = {
  active: "Active",
  under_review: "Under review",
  archived: "Archived",
};

export const LIFECYCLE_TONE: Record<LifecycleState, "green" | "yellow" | "gray"> = {
  active: "green",
  under_review: "yellow",
  archived: "gray",
};

// -- Rollup completeness -----------------------------------------------------
// Never binary: a count-based partial state, matching the three-state model used
// across the product. An element is complete when it carries an approved purpose
// (which brings its retention and lawful basis) — the processor decision is
// bundled into that same approval, so an assigned purpose means a decided flow.
export interface RollupInput {
  purposeAssigned: boolean;
  hasRetention: boolean;
}

export type RollupKind = "fully" | "partial" | "unassigned";

export interface Rollup {
  kind: RollupKind;
  assigned: number;
  total: number;
  label: string;
  tone: "green" | "yellow" | "gray";
}

export function rollup(elements: RollupInput[]): Rollup {
  const total = elements.length;
  const assigned = elements.filter((e) => e.purposeAssigned && e.hasRetention).length;
  if (total === 0) return { kind: "unassigned", assigned: 0, total: 0, label: "No elements", tone: "gray" };
  if (assigned === total) return { kind: "fully", assigned, total, label: "Fully assigned", tone: "green" };
  if (assigned === 0) return { kind: "unassigned", assigned, total, label: "Unassigned", tone: "gray" };
  return { kind: "partial", assigned, total, label: `Partially assigned (${assigned}/${total})`, tone: "yellow" };
}
