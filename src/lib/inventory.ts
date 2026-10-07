/**
 * DATA INVENTORY — pure, client-safe layer (no DB import).
 *
 * The inventory shows what the DLP found (read-only: systems, data type,
 * sensitivity, scan times) and lets Admin add what Privacy Admin owns (purpose,
 * data category, subject type). Sensitivity uses the DLP's four labels.
 *
 * Every field has EXACTLY ONE readiness status, chosen by priority, so the
 * statuses sum to the total and drive one source of truth for all counts.
 */

export const SENSITIVITIES = ["Restricted", "Confidential", "Internal", "Public", "Not classified"] as const;
export type Sensitivity = (typeof SENSITIVITIES)[number];
export const SENS_RANK: Record<string, number> = { Restricted: 4, Confidential: 3, Internal: 2, Public: 1, "Not classified": 0 };
export const SENS_TONE: Record<string, { dot: string; cls: string }> = {
  Restricted: { dot: "var(--red)", cls: "sev-danger" },
  Confidential: { dot: "var(--yellow-700, #b45309)", cls: "sev-warning" },
  Internal: { dot: "var(--blue)", cls: "sev-accent" },
  Public: { dot: "var(--text-4, #94a3b8)", cls: "sev-secondary" },
  "Not classified": { dot: "var(--yellow-700, #b45309)", cls: "sev-warning" },
};

/** One readiness status per field, by priority: cls > pur > link > old > ready. */
export type Readiness = "cls" | "pur" | "link" | "old" | "ready";
/** Priority order (also sort severity). */
export const READINESS_PRIORITY: Readiness[] = ["cls", "pur", "link", "old", "ready"];
/** Bar + legend order (gaps first, ready last). */
export const READINESS_ORDER: Readiness[] = ["cls", "pur", "link", "old", "ready"];
export const READINESS_META: Record<Readiness, { label: string; dot: string; cls: string; action: string | null; kind: "classify" | "assign" | "review" | null }> = {
  cls: { label: "Needs classification", dot: "var(--red)", cls: "sev-danger", action: "Classify in DLP", kind: "classify" },
  pur: { label: "Needs a purpose", dot: "var(--yellow-700, #b45309)", cls: "sev-warning", action: "Assign purpose", kind: "assign" },
  link: { label: "Purpose not linked to consent", dot: "var(--blue)", cls: "sev-accent", action: "Review purpose", kind: "review" },
  old: { label: "Out of date", dot: "var(--text-4, #94a3b8)", cls: "sev-secondary", action: null, kind: null },
  ready: { label: "Ready for ROPA", dot: "var(--green, #16a34a)", cls: "sev-success", action: null, kind: null },
};

export type Grouping = "system" | "dataType" | "none";
export type Segment = "attention" | "all";

export interface PurposeRef { id: string; name: string }
export interface InheritPreview { retention: string | null; processors: string[]; consent: "linked" | "not_linked" | "not_required" }

export interface InventoryRow {
  id: string;
  fieldPath: string;
  system: string;
  dataType: string;
  sensitivity: string;
  sensitivityProvenance: "dlp" | "override" | "manual";
  provenance: "discovered" | "declared" | "application";
  purposes: PurposeRef[];
  status: Readiness;
  isNew: boolean;
  isChanged: boolean;
  changeSummary: string | null;
  location: string;
  lastScanned: string | null;
  dataCategory: string | null;
  subjectType: string | null;
  retention: string | null;
  processors: string[];
  consent: InheritPreview["consent"];
  maskingStatus: string;
  usedInCount: number;
}

export interface GroupView {
  key: string;
  name: string;
  fieldCount: number;
  newCount: number;
  mix: { label: string; count: number }[];
  gaps: { status: Readiness; count: number }[];
  ready: boolean;
  suggestion: { purposeId: string; purposeName: string; confidence: "high" | "low"; fieldIds: string[] } | null;
  rowIds: string[];
}

export interface ReadinessCounts { total: number; ready: number; attention: number; byStatus: Record<Readiness, number> }

export interface SyncStateView {
  status: "idle" | "syncing" | "failed" | "not_connected" | "out_of_date";
  lastSyncedAgo: string | null;
  lastSyncedExact: string | null;
  systems: number;
  warnText: string | null;
}

export interface PurposeOption { id: string; name: string; retention: string | null; processors: string[]; consent: InheritPreview["consent"] }

export interface InventoryView {
  rows: InventoryRow[];
  groups: GroupView[] | null;
  grouping: Grouping;
  total: number;          // rows matching filters+segment (the "Showing X")
  personalTotal: number;  // all personal-data fields from DLP (the "of Y")
  counts: ReadinessCounts;
  sync: SyncStateView;
  systems: { id: string; name: string }[];
  dataTypes: string[];
  approvedPurposes: PurposeOption[];
  notConnected: boolean;
}

/** The readiness-card next-step line, from the whole-inventory counts + a flag for suggestions. */
export function nextStepLine(counts: ReadinessCounts, suggestedPur: number): string | null {
  if (counts.attention === 0) return "Every field is ready for ROPA.";
  const biggest = (["cls", "pur", "link", "old"] as Readiness[]).filter((s) => counts.byStatus[s] > 0).sort((a, b) => counts.byStatus[b] - counts.byStatus[a])[0];
  if (biggest === "pur") {
    const n = counts.byStatus.pur;
    if (suggestedPur >= n) return `${n} need a purpose, and DLP suggests one for all ${n}.`;
    if (suggestedPur > 0) return `${n} need a purpose; DLP suggests one for ${suggestedPur} of ${n}.`;
    return `${n} need a purpose.`;
  }
  if (biggest === "cls") return `${counts.byStatus.cls} need a classification in DLP.`;
  if (biggest === "link") return `${counts.byStatus.link} have a purpose that isn’t linked to consent.`;
  return `${counts.byStatus.old} are out of date.`;
}

/** The outlined card action for the biggest gap, or null when none. */
export function cardAction(counts: ReadinessCounts): { label: string; status: Readiness } | null {
  if (counts.attention === 0) return null;
  const biggest = (["cls", "pur", "link", "old"] as Readiness[]).filter((s) => counts.byStatus[s] > 0).sort((a, b) => counts.byStatus[b] - counts.byStatus[a])[0];
  if (biggest === "pur") return { label: "Review suggestions", status: "pur" };
  if (biggest === "cls") return { label: "Classify in DLP", status: "cls" };
  if (biggest === "link") return { label: "Review purposes", status: "link" };
  return { label: "Review out of date", status: "old" };
}
