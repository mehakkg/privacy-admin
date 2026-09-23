/** Protection Rule Library — pure, client-safe labels/tones. */
import type { PillTone } from "@/components/ui";

export const TIER_LABEL: Record<string, string> = {
  baseline_pii: "Baseline PII",
  dpdp_specific: "DPDP-Specific",
  custom: "Custom",
};
export const TIER_TONE: Record<string, PillTone> = {
  baseline_pii: "gray",
  dpdp_specific: "blue",
  custom: "purple",
};
export const TIER_BLURB: Record<string, string> = {
  baseline_pii: "General PII protections most organisations need — pre-filled method and scope.",
  dpdp_specific: "Protections tied to a specific DPDP obligation, with the statutory citation attached.",
  custom: "Compose a rule from scratch when no template fits.",
};

export const METHOD_LABEL: Record<string, string> = {
  masking: "Masking",
  encryption: "Encryption",
  tokenization: "Tokenization",
};

export const RULE_STATUS_LABEL: Record<string, string> = {
  approved: "Approved",
  pending_ciso_approval: "Pending CISO approval",
  rejected: "Rejected",
};
export const RULE_STATUS_TONE: Record<string, PillTone> = {
  approved: "green",
  pending_ciso_approval: "yellow",
  rejected: "red",
};

export const PII_CATEGORIES = ["identity", "contact", "kyc", "financial", "transaction", "marketing", "behavioural", "support"];
export const METHODS = ["masking", "encryption", "tokenization"];
export const STRICTNESS = ["high", "medium", "low"];
