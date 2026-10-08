/**
 * PROCESSING ACTIVITIES — versions, signed snapshots and the conflict model (M1).
 * Pure functions, no DB and no React, so they can be unit-tested (see
 * ./versions.test.ts). The engine assembles the SnapshotInput from domain rows and
 * calls buildSnapshot()/sha256Hex8() at activation; the autosave action calls
 * resolveWrite() to classify each write.
 */

// --- Canonical JSON ---------------------------------------------------------

/** Deterministic JSON: object keys sorted recursively, so the same record always
 *  produces the same bytes (and therefore the same hash). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}
function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = sortDeep((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

// --- Snapshot ---------------------------------------------------------------

export interface SnapshotData { fieldId: string; path: string; dataType: string; sensitivity: string | null }
export interface SnapshotProcessor { vendor: string; country: string | null }
export interface SnapshotPurpose {
  purposeId: string;
  approvedVersion: number | null;
  legalBasis: string;
  retention: string;
  data: SnapshotData[];
  processors: SnapshotProcessor[];
  noProcessor: boolean;
}
export interface SnapshotInput {
  name: string;
  description: string;
  owner: string | null;
  department: string | null;
  entity: string | null;
  principals: string[];
  reviewPeriodMonths: number;
  nextReviewDue: string | null;
  purposes: SnapshotPurpose[];
}

/** The canonical snapshot string stored on an ActivityVersion. Arrays are sorted so
 *  the hash depends on content, not on row order. */
export function buildSnapshot(input: SnapshotInput): string {
  const norm = {
    name: input.name,
    description: input.description,
    owner: input.owner,
    department: input.department,
    entity: input.entity,
    principals: [...input.principals].sort(),
    reviewPeriodMonths: input.reviewPeriodMonths,
    nextReviewDue: input.nextReviewDue,
    purposes: [...input.purposes]
      .sort((a, b) => a.purposeId.localeCompare(b.purposeId))
      .map((p) => ({
        purposeId: p.purposeId,
        approvedVersion: p.approvedVersion,
        legalBasis: p.legalBasis,
        retention: p.retention,
        noProcessor: p.noProcessor,
        data: [...p.data].sort((a, b) => a.fieldId.localeCompare(b.fieldId)),
        processors: [...p.processors].sort((a, b) => a.vendor.localeCompare(b.vendor)),
      })),
  };
  return canonicalJson(norm);
}

// --- Hash + verify ----------------------------------------------------------

/** First 8 hex characters of SHA-256(s), via Web Crypto (Node 20+/browsers). */
export async function sha256Hex8(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 8);
}

/** Recompute the hash from the STORED snapshot string (never from live data) and
 *  compare. Returns true when the record matches what was signed. */
export async function verifyRecord(snapshot: string, hash: string): Promise<boolean> {
  return (await sha256Hex8(snapshot)) === hash;
}

// --- Diff -------------------------------------------------------------------

export interface VersionDiff { added: string[]; removed: string[]; changed: string[] }

interface ParsedSnapshot {
  name: string; owner: string | null; department: string | null; entity: string | null;
  reviewPeriodMonths: number; nextReviewDue: string | null; principals: string[]; purposes: SnapshotPurpose[];
}

/** A plain-language diff between two canonical snapshot strings, for the
 *  "What changed since version N" block (M5 enriches the per-row provenance). */
export function diffSnapshots(prevSnapshot: string, nextSnapshot: string): VersionDiff {
  const prev = JSON.parse(prevSnapshot) as ParsedSnapshot;
  const next = JSON.parse(nextSnapshot) as ParsedSnapshot;
  const added: string[] = [], removed: string[] = [], changed: string[] = [];

  for (const k of ["name", "owner", "department", "entity", "reviewPeriodMonths", "nextReviewDue"] as const) {
    if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) changed.push(labelFor(k));
  }
  if (JSON.stringify([...(prev.principals ?? [])]) !== JSON.stringify([...(next.principals ?? [])])) changed.push("Whose data");

  const prevP = new Map((prev.purposes ?? []).map((p) => [p.purposeId, p]));
  const nextP = new Map((next.purposes ?? []).map((p) => [p.purposeId, p]));
  for (const id of nextP.keys()) if (!prevP.has(id)) added.push(`Purpose ${id}`);
  for (const id of prevP.keys()) if (!nextP.has(id)) removed.push(`Purpose ${id}`);
  for (const [id, np] of nextP) {
    const pp = prevP.get(id);
    if (!pp) continue;
    const dataChanged = JSON.stringify(pp.data) !== JSON.stringify(np.data);
    const procChanged = JSON.stringify(pp.processors) !== JSON.stringify(np.processors);
    const metaChanged = pp.legalBasis !== np.legalBasis || pp.retention !== np.retention || pp.approvedVersion !== np.approvedVersion || pp.noProcessor !== np.noProcessor;
    if (dataChanged || procChanged || metaChanged) changed.push(`Purpose ${id}`);
  }
  return { added, removed, changed };
}
function labelFor(k: string): string {
  return ({ name: "Name", owner: "Owner", department: "Department", entity: "Entity", reviewPeriodMonths: "Review period", nextReviewDue: "Next review" } as Record<string, string>)[k] ?? k;
}

// --- Conflict model ---------------------------------------------------------

export interface LastWriter { sessionId: string; by: string; at: string; fields: string[] }
export type WriteOutcome =
  | { action: "apply" }                        // base is current — a clean write
  | { action: "rebase" }                       // base is older, but my own session wrote since — silent
  | { action: "merge" }                        // base is older, another session wrote, but different fields
  | { action: "conflict"; fields: string[] };  // base is older, another session wrote the SAME field(s)

/**
 * Classify a write against the current server state. A write carries its baseRev
 * (the rev the editor last saw) and the fields it touches. Writes are serialised
 * per session, so a same-session stale write just rebases; only a DIFFERENT
 * session touching OVERLAPPING fields is a true conflict. Never a reload, never a
 * discard.
 */
export function resolveWrite(params: {
  baseRev: number;
  currentRev: number;
  lastWriter: LastWriter | null;
  sessionId: string;
  fields: string[];
}): WriteOutcome {
  const { baseRev, currentRev, lastWriter, sessionId, fields } = params;
  if (baseRev >= currentRev) return { action: "apply" };
  // The record moved on since this editor last saw it.
  if (!lastWriter || lastWriter.sessionId === sessionId) return { action: "rebase" };
  const overlap = fields.filter((f) => lastWriter.fields.includes(f));
  if (overlap.length === 0) return { action: "merge" };
  return { action: "conflict", fields: overlap };
}
