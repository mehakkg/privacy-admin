/**
 * DATA INVENTORY — pure, client-safe layer (no DB import).
 *
 * The inventory shows what the DLP found (read-only: systems, data type,
 * sensitivity, scan times) and lets Admin add what Privacy Admin owns (purpose,
 * data category, subject type). Sensitivity uses the DLP's four labels, never
 * high/medium/low. Gaps are derived and ordered by severity.
 */

export const SENSITIVITIES = ["Restricted", "Confidential", "Internal", "Public", "Not classified"] as const;
export type Sensitivity = (typeof SENSITIVITIES)[number];
export const SENS_RANK: Record<string, number> = { Restricted: 4, Confidential: 3, Internal: 2, Public: 1, "Not classified": 0 };
/** Dot colour + text tone token per label. Severity is dot + word, never colour alone. */
export const SENS_TONE: Record<string, { dot: string; cls: string }> = {
  Restricted: { dot: "var(--red)", cls: "sev-danger" },
  Confidential: { dot: "var(--yellow-700, #b45309)", cls: "sev-warning" },
  Internal: { dot: "var(--blue)", cls: "sev-accent" },
  Public: { dot: "var(--text-4, #94a3b8)", cls: "sev-secondary" },
  "Not classified": { dot: "var(--yellow-700, #b45309)", cls: "sev-warning" },
};

export type GapType =
  | "not_classified" | "no_purpose" | "purpose_not_linked_to_consent"
  | "no_retention" | "unknown_to_dlp" | "out_of_date";

/** Severity order (most severe first) — also the table's primary sort. */
export const GAP_ORDER: GapType[] = [
  "not_classified", "no_purpose", "purpose_not_linked_to_consent", "no_retention", "unknown_to_dlp", "out_of_date",
];

/** Row status text + the one quiet inline action per gap. */
export const GAP_META: Record<GapType, { text: string; action: string | null; kind: "assign" | "classify" | "review" | "dlp" | null }> = {
  not_classified: { text: "Needs classification", action: "Classify in DLP", kind: "classify" },
  no_purpose: { text: "Needs a purpose", action: "Assign purpose", kind: "assign" },
  purpose_not_linked_to_consent: { text: "Purpose not linked to consent", action: "Review purpose", kind: "review" },
  no_retention: { text: "No retention set", action: "Review purpose", kind: "review" },
  unknown_to_dlp: { text: "Unknown to DLP", action: "Open in DLP", kind: "dlp" },
  out_of_date: { text: "Out of date", action: null, kind: null },
};

/** The most severe gap wins the Status cell; the rest show as "+N" and in the drawer. */
export function topGap(gaps: GapType[]): GapType | null {
  for (const g of GAP_ORDER) if (gaps.includes(g)) return g;
  return null;
}

export type Segment = "attention" | "new" | "all";

export interface PurposeRef { id: string; name: string }

export interface InheritPreview {
  retention: string | null;
  processors: string[];
  /** "linked" (consent collected) | "not_linked" (consent basis, none yet) | "not_required" */
  consent: "linked" | "not_linked" | "not_required";
}

export interface InventoryRow {
  id: string;
  fieldPath: string;
  system: string;
  dataType: string;
  sensitivity: string;
  sensitivityProvenance: "dlp" | "override" | "manual";
  provenance: "discovered" | "declared" | "application";
  purposes: PurposeRef[];
  gaps: GapType[];
  isNew: boolean;
  isChanged: boolean;
  changeSummary: string | null;
  // From DLP (drawer)
  location: string;
  firstSeen: string | null;
  lastScanned: string | null;
  // Added in Privacy Admin (drawer)
  dataCategory: string | null;
  subjectType: string | null;
  retention: string | null;
  processors: string[];
  consent: InheritPreview["consent"];
  maskingStatus: string;
}

export interface SyncStateView {
  status: "idle" | "syncing" | "failed" | "not_connected" | "out_of_date";
  lastSyncedAgo: string | null;
  lastSyncedExact: string | null;
  systems: number;
  warnText: string | null;
}

export interface SegmentCounts { attention: number; new: number; all: number }

export interface PurposeOption { id: string; name: string; retention: string | null; processors: string[]; consent: InheritPreview["consent"] }

export interface InventoryView {
  rows: InventoryRow[];
  total: number;            // rows matching filters+segment
  personalTotal: number;    // all personal-data fields from DLP
  level1: { total: number; parts: { label: string; count: number }[]; everyHasPurpose: boolean };
  coveragePct: number;
  counts: SegmentCounts;
  sync: SyncStateView;
  systems: { id: string; name: string }[];
  approvedPurposes: PurposeOption[];
  notConnected: boolean;
}

/** The Level-1 sentence parts from a gap tally (at most 3 shown + "+N more"). */
export function level1Parts(tally: Partial<Record<GapType, number>>): { label: string; count: number }[] {
  const order: [GapType, string][] = [
    ["no_purpose", "need a purpose"],
    ["not_classified", "need a classification"],
    ["purpose_not_linked_to_consent", "aren’t linked to consent"],
    ["no_retention", "have no retention"],
    ["unknown_to_dlp", "are unknown to DLP"],
    ["out_of_date", "are out of date"],
  ];
  return order.filter(([g]) => (tally[g] ?? 0) > 0).map(([g, label]) => ({ label, count: tally[g]! }));
}
