/**
 * DATA MAP — shared foundations (pure, client-safe; no DB, no React).
 *
 * One set of status tokens, one readiness-segmentation function, text helpers and
 * ONE date format, used identically by the four Data map pages (Data inventory,
 * Processing activities, Data flow, ROPA) so they read as one system. Unit-tested
 * in ./foundations.test.ts.
 */

// --- Status tokens ----------------------------------------------------------
// Exactly four. Red is reserved for failures and blocking errors — never these.
export type StatusToken = "attention" | "stale" | "ready" | "new";
export const STATUS_TOKENS: Record<StatusToken, { label: string; varName: string; cls: string }> = {
  attention: { label: "Needs attention", varName: "var(--yellow-700, #b45309)", cls: "sev-warning" },
  stale:     { label: "Out of date",     varName: "var(--text-4, #94a3b8)",     cls: "sev-secondary" },
  ready:     { label: "Ready",           varName: "var(--green, #16a34a)",      cls: "sev-success" },
  new:       { label: "New",             varName: "var(--blue, #2563eb)",       cls: "sev-accent" },
};

// --- Text helpers -----------------------------------------------------------
/** plural(1,"field") → "1 field"; plural(2,"field") → "2 fields". Pass an explicit
 *  plural for irregular nouns: plural(2,"entry","entries"). No "1 fields". */
export function plural(n: number, noun: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? noun : pluralForm ?? `${noun}s`}`;
}
/** Verb agreement, no count: agree(1,"needs","need") → "needs"; agree(2,…) → "need". */
export function agree(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm;
}

// --- Date -------------------------------------------------------------------
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** The ONE UI date format: "19 Oct 2026". Never an ISO date in the UI. */
export function formatDate(d: Date | string | null | undefined): string {
  if (d == null || d === "") return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "—";
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}
/** Timestamp form for sync lines: "19 Oct 2026, 12:49". */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (d == null || d === "") return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "—";
  return `${formatDate(dt)}, ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}
/** Whole-day age for staleness text, e.g. daysBetween(scan, today). */
export function daysBetween(from: Date | string, to: Date | string): number {
  const a = typeof from === "string" ? new Date(from) : from;
  const b = typeof to === "string" ? new Date(to) : to;
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

// --- Readiness segments -----------------------------------------------------
export interface SegmentInput { token: StatusToken; label: string; count: number }
export interface Segment extends SegmentInput { pct: number }

/**
 * The ONE function that feeds every readiness bar and legend. Given labelled,
 * token-coloured counts (pages name their own gaps), it drops the empty ones and
 * computes each segment's percentage width. Order is preserved as given; callers
 * put gaps first and "ready" last. Two segments may share a token (e.g. two kinds
 * of "attention") — the label distinguishes them; the colour stays one of four.
 */
export function readinessSegments(input: SegmentInput[]): Segment[] {
  const total = input.reduce((s, x) => s + Math.max(0, x.count), 0) || 1;
  return input.filter((s) => s.count > 0).map((s) => ({ ...s, pct: (s.count / total) * 100 }));
}
