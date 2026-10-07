import { db } from "@/lib/db";
import { audited, type AuditActor } from "@/lib/engines/audit";
import { getDlpHealth } from "@/lib/engines/dlp";
import {
  GAP_ORDER, SENS_RANK, topGap, level1Parts,
  type GapType, type InventoryRow, type InventoryView, type SyncStateView,
  type PurposeOption, type Segment, type InheritPreview,
} from "@/lib/inventory";

/**
 * DATA INVENTORY ENGINE (server).
 *
 * Reads what the DLP found (via ClassifiedField + its DiscoverySource) and joins
 * the Privacy-Admin-owned attributes (purposes, data category, subject type).
 * Sensitivity uses the DLP's four labels. Gaps are derived and ordered by
 * severity. Purpose coverage and the Level-1 tally are computed over the whole
 * personal-data set so they stay stable while the Admin filters.
 */

function err(name: string, message: string) { return Object.assign(new Error(message), { name }); }

function agoText(date: Date, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24); return `${d} day${d === 1 ? "" : "s"} ago`;
}
function exactText(date: Date): string {
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "");
}

export interface InventoryParams {
  segment?: Segment; q?: string; system?: string; sensitivity?: string; status?: string;
  dataType?: string; dataCategory?: string; purpose?: string; subject?: string; provenance?: string;
}

interface DerivedField extends InventoryRow { gapTally: GapType[] }

export async function getInventory(params: InventoryParams = {}): Promise<InventoryView> {
  const [health, fields, purposeRows] = await Promise.all([
    getDlpHealth(),
    db.classifiedField.findMany({
      include: { source: true, purposeTag: true, dataCategory: true, purposeLinks: { include: { purpose: true } } },
    }),
    db.purposeTag.findMany({ where: { status: "approved" } }),
  ]);

  // Purpose inheritance maps (retention / processors / consent) for approved purposes.
  const purposeIds = purposeRows.map((p) => p.id);
  const [aps, consentRows] = await Promise.all([
    db.activityPurpose.findMany({ where: { purposeTagId: { in: purposeIds } }, select: { purposeTagId: true, processorId: true } }),
    db.consentRecord.findMany({ where: { purposeTagId: { in: purposeIds } }, select: { purposeTagId: true } }),
  ]);
  const procIds = [...new Set(aps.map((a) => a.processorId).filter(Boolean) as string[])];
  const procRows = procIds.length ? await db.dataProcessor.findMany({ where: { id: { in: procIds } }, select: { id: true, name: true } }) : [];
  const procName = new Map(procRows.map((p) => [p.id, p.name]));
  const procsByPurpose = new Map<string, Set<string>>();
  for (const a of aps) { if (!a.processorId) continue; const n = procName.get(a.processorId); if (!n) continue; (procsByPurpose.get(a.purposeTagId) ?? procsByPurpose.set(a.purposeTagId, new Set()).get(a.purposeTagId)!).add(n); }
  const consentCount = new Map<string, number>();
  for (const c of consentRows) if (c.purposeTagId) consentCount.set(c.purposeTagId, (consentCount.get(c.purposeTagId) ?? 0) + 1);

  const retentionOf = (p: { retention: string | null }) => (p.retention && p.retention.trim() ? p.retention : null);
  const processorsOf = (id: string) => [...(procsByPurpose.get(id) ?? [])];
  const consentOf = (p: { id: string; lawfulBasis: string | null }): InheritPreview["consent"] =>
    p.lawfulBasis === "consent" ? ((consentCount.get(p.id) ?? 0) > 0 ? "linked" : "not_linked") : "not_required";

  const approvedPurposes: PurposeOption[] = purposeRows
    .map((p) => ({ id: p.id, name: p.name, retention: retentionOf(p), processors: processorsOf(p.id), consent: consentOf(p) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const purposeById = new Map(purposeRows.map((p) => [p.id, p]));

  const intervalMs = health.syncIntervalHours * 3600_000;
  const now = Date.now();

  // --- Derive every field once (unfiltered), then filter/segment/sort in memory.
  const derived: DerivedField[] = fields.map((f) => {
    const linked = f.purposeLinks.map((l) => l.purpose).filter((p) => p.status === "approved");
    const ids = new Set(linked.map((p) => p.id));
    if (f.purposeTag && f.purposeTag.status === "approved" && !ids.has(f.purposeTag.id)) { linked.push(f.purposeTag); ids.add(f.purposeTag.id); }
    const purposes = linked.map((p) => ({ id: p.id, name: p.name }));

    const sensitivity = f.sensitivityTier;
    const provenance: InventoryRow["provenance"] = f.source.provenance === "manually_added" ? "declared" : "discovered";
    const lastScan = f.source.lastScanned ?? null;
    const outOfDate = health.state === "out_of_date" || (!!lastScan && now - lastScan.getTime() > intervalMs);

    const retention = linked.map((p) => retentionOf(p)).find((r) => r) ?? null;
    const processors = [...new Set(linked.flatMap((p) => processorsOf(p.id)))];
    const consentStates = linked.filter((p) => p.lawfulBasis === "consent").map((p) => consentOf(p));
    const consent: InheritPreview["consent"] = consentStates.length === 0 ? "not_required" : consentStates.every((c) => c === "linked") ? "linked" : "not_linked";

    const gaps: GapType[] = [];
    if (sensitivity === "Not classified") gaps.push("not_classified");
    if (purposes.length === 0) gaps.push("no_purpose");
    if (consentStates.some((c) => c === "not_linked")) gaps.push("purpose_not_linked_to_consent");
    if (purposes.length > 0 && !retention) gaps.push("no_retention");
    if (provenance === "declared") gaps.push("unknown_to_dlp");
    if (outOfDate) gaps.push("out_of_date");

    const isChanged = f.driftFlag;
    const isNew = !f.lastVerified && !isChanged;
    const changeSummary = isChanged && f.previousType ? `Data type ${f.previousType} → ${f.overriddenType ?? f.detectedType}` : null;

    return {
      id: f.id, fieldPath: f.fieldPath, system: f.source.name, dataType: f.overriddenType ?? f.detectedType,
      sensitivity, sensitivityProvenance: f.reviewState === "overridden" ? "override" : "dlp", provenance,
      purposes, gaps, gapTally: gaps,
      isNew, isChanged, changeSummary,
      location: f.fieldPath, firstSeen: null, lastScanned: lastScan ? agoText(lastScan, now) : null,
      dataCategory: f.dataCategory?.name ?? null, subjectType: f.dataSubjectType ?? null,
      retention, processors, consent,
      maskingStatus: sensitivity === "Not classified" ? "Not set" : `Follows ${sensitivity}`,
    };
  });

  // Whole-inventory tallies (stable while filtering).
  const personalTotal = derived.length;
  const withPurpose = derived.filter((d) => d.purposes.length > 0).length;
  const coveragePct = personalTotal ? Math.round((withPurpose / personalTotal) * 100) : 100;
  const tally: Partial<Record<GapType, number>> = {};
  for (const d of derived) { const g = topGap(d.gaps); if (g) tally[g] = (tally[g] ?? 0) + 1; }
  const counts = {
    attention: derived.filter((d) => d.gaps.length > 0).length,
    new: derived.filter((d) => d.isNew || d.isChanged).length,
    all: personalTotal,
  };
  const everyHasPurpose = withPurpose === personalTotal && personalTotal > 0;
  const level1 = { total: personalTotal, parts: level1Parts(tally), everyHasPurpose };

  // Filters.
  const term = (params.q ?? "").trim().toLowerCase();
  let rows = derived.filter((d) => {
    if (params.system && d.system !== params.system) return false;
    if (params.sensitivity && d.sensitivity !== params.sensitivity) return false;
    if (params.dataType && d.dataType !== params.dataType) return false;
    if (params.dataCategory && d.dataCategory !== params.dataCategory) return false;
    if (params.subject && d.subjectType !== params.subject) return false;
    if (params.provenance && d.provenance !== params.provenance) return false;
    if (params.purpose && !d.purposes.some((p) => p.id === params.purpose)) return false;
    if (params.status && topGap(d.gaps) !== params.status && !(params.status === "complete" && d.gaps.length === 0)) return false;
    if (term && !(`${d.fieldPath} ${d.system} ${d.dataType}`.toLowerCase().includes(term))) return false;
    return true;
  });

  const segment: Segment = params.segment ?? (counts.attention > 0 ? "attention" : "all");
  if (segment === "attention") rows = rows.filter((d) => d.gaps.length > 0);
  else if (segment === "new") rows = rows.filter((d) => d.isNew || d.isChanged);

  const gapRank = (d: DerivedField) => { const g = topGap(d.gaps); return g ? GAP_ORDER.indexOf(g) : 99; };
  rows.sort((a, b) => gapRank(a) - gapRank(b) || (SENS_RANK[b.sensitivity] ?? 0) - (SENS_RANK[a.sensitivity] ?? 0) || a.fieldPath.localeCompare(b.fieldPath));

  const sources = [...new Map(derived.map((d) => [d.system, d.system])).keys()].sort();
  const sync: SyncStateView = {
    status: health.state === "connected" ? "idle" : health.state,
    lastSyncedAgo: health.lastSyncAgo,
    lastSyncedExact: health.lastSyncAt ? exactText(health.lastSyncAt) : null,
    systems: sources.length,
    warnText: health.warnText,
  };

  return {
    rows: rows.map(({ gapTally: _gapTally, ...r }) => r),
    total: rows.length, personalTotal,
    level1, coveragePct, counts, sync,
    systems: sources.map((s) => ({ id: s, name: s })),
    approvedPurposes,
    notConnected: health.state === "not_connected",
  };
}

// --- Mutations --------------------------------------------------------------

export interface AssignResult { ok: true; assigned: number; skipped: number }

/** Assign ONE approved purpose to many fields (adds a link; keeps purposeTagId as primary). */
export async function assignPurposeToFields(fieldIds: string[], purposeTagId: string, actor: AuditActor): Promise<AssignResult> {
  const purpose = await db.purposeTag.findUnique({ where: { id: purposeTagId } });
  if (!purpose) throw err("NotFoundError", "No such purpose.");
  if (purpose.status !== "approved") throw err("ForbiddenError", `${purpose.name} is not an approved purpose.`);
  const fields = await db.classifiedField.findMany({ where: { id: { in: fieldIds } }, include: { purposeLinks: true } });
  if (fields.length !== fieldIds.length) throw err("NotFoundError", "One or more fields no longer exist.");

  let assigned = 0, skipped = 0;
  await audited(
    { actor, action: "inventory.purpose_assigned", targetType: "ClassifiedField", targetId: fieldIds.join(","), eventDescription: `Assigned purpose ${purpose.name} to ${fieldIds.length} field(s)`, payload: { purpose: purpose.name, fields: fieldIds.length } },
    async (tx) => {
      for (const f of fields) {
        if (f.purposeLinks.some((l) => l.purposeTagId === purposeTagId) || f.purposeTagId === purposeTagId) { skipped++; continue; }
        await tx.inventoryFieldPurpose.create({ data: { fieldId: f.id, purposeTagId, assignedBy: actor.label } });
        if (!f.purposeTagId) await tx.classifiedField.update({ where: { id: f.id }, data: { purposeTagId } });
        assigned++;
      }
    },
  );
  return { ok: true, assigned, skipped };
}

/** Remove one purpose link from a field; repoint the primary if needed. */
export async function removePurposeFromField(fieldId: string, purposeTagId: string, actor: AuditActor): Promise<void> {
  const field = await db.classifiedField.findUnique({ where: { id: fieldId }, include: { purposeLinks: true } });
  if (!field) throw err("NotFoundError", "No such field.");
  await audited(
    { actor, action: "inventory.purpose_removed", targetType: "ClassifiedField", targetId: fieldId, eventDescription: `Removed a purpose from ${field.fieldPath}`, payload: { purposeTagId } },
    async (tx) => {
      await tx.inventoryFieldPurpose.deleteMany({ where: { fieldId, purposeTagId } });
      if (field.purposeTagId === purposeTagId) {
        const remaining = field.purposeLinks.find((l) => l.purposeTagId !== purposeTagId);
        await tx.classifiedField.update({ where: { id: fieldId }, data: { purposeTagId: remaining?.purposeTagId ?? null } });
      }
    },
  );
}

export async function setFieldAttribute(fieldId: string, attr: "dataCategoryId" | "dataSubjectType", value: string | null): Promise<void> {
  await db.classifiedField.update({ where: { id: fieldId }, data: { [attr]: value } });
}

/** Suggested approved purposes for a field: those already used by sibling fields in
 *  the same system or data category, most-used first (a light heuristic, no ML). */
export async function suggestPurposes(fieldId: string): Promise<{ id: string; name: string; strong: boolean }[]> {
  const field = await db.classifiedField.findUnique({ where: { id: fieldId }, include: { source: true } });
  if (!field) return [];
  const siblings = await db.classifiedField.findMany({
    where: { OR: [{ sourceId: field.sourceId }, ...(field.dataCategoryId ? [{ dataCategoryId: field.dataCategoryId }] : [])], id: { not: fieldId } },
    include: { purposeLinks: { include: { purpose: true } }, purposeTag: true },
  });
  const tally = new Map<string, { name: string; n: number; sameType: boolean }>();
  for (const s of siblings) {
    const ps = [...s.purposeLinks.map((l) => l.purpose), ...(s.purposeTag ? [s.purposeTag] : [])].filter((p) => p.status === "approved");
    for (const p of ps) {
      const cur = tally.get(p.id) ?? { name: p.name, n: 0, sameType: false };
      cur.n++; if ((s.overriddenType ?? s.detectedType) === (field.overriddenType ?? field.detectedType)) cur.sameType = true;
      tally.set(p.id, cur);
    }
  }
  return [...tally.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 3).map(([id, v]) => ({ id, name: v.name, strong: v.sameType && v.n >= 2 }));
}
