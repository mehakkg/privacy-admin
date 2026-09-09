/**
 * Vendor Risk (TPRM) shared vocabulary: the baseline-by-category lookup, the
 * questionnaire templates, and the question set the vendor answers. The vendor
 * portal (submission side) and Legal's review (classification side) read the
 * SAME question definitions, so answers line up on both surfaces without a
 * second schema.
 */

export type Risk = "low" | "medium" | "high" | "critical";

export const RISKS: Risk[] = ["low", "medium", "high", "critical"];

/**
 * The system's starting suggestion for a vendor's risk tier, by category — so
 * Legal assesses from an informed default, not from zero. It is only ever a
 * suggestion for how rigorous the questionnaire should be; the final rating is
 * set by a human on the review screen.
 */
export function baselineForCategory(category: string): Risk {
  const c = category.toLowerCase();
  if (/payment|lending|bank|credit|financial|underwrit/.test(c)) return "high";
  if (/cloud|hosting|storage|infra|data ?centre|data ?center/.test(c)) return "high";
  if (/health|biometric|children|minor/.test(c)) return "critical";
  if (/support|marketing|analytics|saas|crm|email/.test(c)) return "medium";
  if (/office|supplies|stationery|facilit|logistics|travel/.test(c)) return "low";
  return "medium";
}

export interface Template { id: string; name: string; forTiers: Risk[]; description: string }

export const ASSESSMENT_TEMPLATES: Template[] = [
  { id: "std_saas_v3", name: "Standard SaaS Vendor v3", forTiers: ["low", "medium"], description: "Baseline diligence for low/medium-risk SaaS vendors." },
  { id: "high_fin_v2", name: "High-Risk Financial Partner v2", forTiers: ["high", "critical"], description: "Deep diligence for financial and lending partners handling KYC/financial data." },
  { id: "cloud_v1", name: "Cloud Storage v1", forTiers: ["high"], description: "Hosting and storage vendors — data residency, encryption, sub-processors." },
];

export interface Question { id: string; section: string; label: string }

export const ASSESSMENT_QUESTIONS: Question[] = [
  { id: "data_categories", section: "Data handling", label: "What categories of personal data will you process on our behalf?" },
  { id: "data_residency", section: "Data handling", label: "Where is the data stored and processed (region/country)?" },
  { id: "subprocessors", section: "Data handling", label: "Do you use any sub-processors? If so, name them and their role." },
  { id: "retention", section: "Data handling", label: "What is your data retention and deletion policy for our data?" },
  { id: "certifications", section: "Security & compliance", label: "Which security certifications do you hold (ISO 27001, SOC 2, etc.)?" },
  { id: "encryption", section: "Security & compliance", label: "How is data encrypted, at rest and in transit?" },
  { id: "breach_sla", section: "Security & compliance", label: "What is your breach-notification SLA to customers?" },
];

export const ASSESSMENT_SECTIONS = [...new Set(ASSESSMENT_QUESTIONS.map((q) => q.section))];

/**
 * The TPRM-side summary a Privacy screen pulls live via a Vendor ID — the score
 * card shown identically on a Processor detail and a ROPA Processor field.
 * Everything here is a read-only mirror of TPRM data.
 */
export interface TprmSummary {
  vendorId: string;
  vendorName: string;
  riskRating: string;
  /** null means the assessment is still pending review in TPRM. */
  score: number | null;
  status: "verified" | "pending" | "none";
  openFindings: number;
  latestFinding: string | null;
  lastSynced: string;
  /** the linked Vendor no longer exists in TPRM. */
  broken?: boolean;
}

const SCORE_BY_RATING: Record<string, number> = { low: 95, medium: 82, high: 62, critical: 40 };
export function ratingScore(rating: string): number { return SCORE_BY_RATING[rating] ?? 70; }
