import { db } from "@/lib/db";
import { audited, type AuditActor } from "@/lib/engines/audit";
import { getDlpHealth } from "@/lib/engines/dlp";
import {
  READINESS_PRIORITY, SENS_RANK, SENSITIVITIES,
  type Readiness, type InventoryRow, type InventoryView, type SyncStateView,
  type PurposeOption, type Segment, type Grouping, type GroupView, type ReadinessCounts, type InheritPreview,
} from "@/lib/inventory";

/**
 * DATA INVENTORY ENGINE (server).
 *
 * Reads what the DLP found (ClassifiedField + DiscoverySource) and joins the
 * Privacy-Admin-owned attributes. Every field gets ONE readiness status; the
 * whole-inventory counts are the single source of truth for the nav badge, the
 * "Needs attention" segment, the readiness bar and the sentence.
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
  grouping?: Grouping; segment?: Segment; q?: string; system?: string; sensitivity?: string; status?: string;
  dataType?: string; dataCategory?: string; purpose?: string; subject?: string; provenance?: string;
}

interface Derived { rows: InventoryRow[]; counts: ReadinessCounts; approvedPurposes: PurposeOption[]; systems: string[]; purposeFreqBySystem: Map<string, Map<string, number>>; purposeFreqByType: Map<string, Map<string, number>>; purposeName: Map<string, string>; globalFreq: Map<string, number> }

/** Derive every field once (unfiltered) with its single readiness status + counts. */
async function deriveAll(): Promise<Derived & { health: Awaited<ReturnType<typeof getDlpHealth>> }> {
  const [health, fields, purposeRows] = await Promise.all([
    getDlpHealth(),
    db.classifiedField.findMany({ include: { source: true, purposeTag: true, dataCategory: true, purposeLinks: { include: { purpose: true } } } }),
    db.purposeTag.findMany({ where: { status: "approved" } }),
  ]);
  const purposeIds = purposeRows.map((p) => p.id);
  const [aps, consentRows, usedRows] = await Promise.all([
    db.activityPurpose.findMany({ where: { purposeTagId: { in: purposeIds } }, select: { purposeTagId: true, processorId: true } }),
    db.consentRecord.findMany({ where: { purposeTagId: { in: purposeIds } }, select: { purposeTagId: true } }),
    db.activityPurposeElement.findMany({ select: { classifiedFieldId: true } }).catch(() => [] as { classifiedFieldId: string | null }[]),
  ]);
  const procIds = [...new Set(aps.map((a) => a.processorId).filter(Boolean) as string[])];
  const procRows = procIds.length ? await db.dataProcessor.findMany({ where: { id: { in: procIds } }, select: { id: true, name: true } }) : [];
  const procName = new Map(procRows.map((p) => [p.id, p.name]));
  const procsByPurpose = new Map<string, Set<string>>();
  for (const a of aps) { if (!a.processorId) continue; const n = procName.get(a.processorId); if (!n) continue; (procsByPurpose.get(a.purposeTagId) ?? procsByPurpose.set(a.purposeTagId, new Set()).get(a.purposeTagId)!).add(n); }
  const consentCount = new Map<string, number>();
  for (const c of consentRows) if (c.purposeTagId) consentCount.set(c.purposeTagId, (consentCount.get(c.purposeTagId) ?? 0) + 1);
  const usedCount = new Map<string, number>();
  for (const u of usedRows) if (u.classifiedFieldId) usedCount.set(u.classifiedFieldId, (usedCount.get(u.classifiedFieldId) ?? 0) + 1);

  const retentionOf = (p: { retention: string | null }) => (p.retention && p.retention.trim() ? p.retention : null);
  const processorsOf = (id: string) => [...(procsByPurpose.get(id) ?? [])];
  const consentOf = (p: { id: string; lawfulBasis: string | null }): InheritPreview["consent"] =>
    p.lawfulBasis === "consent" ? ((consentCount.get(p.id) ?? 0) > 0 ? "linked" : "not_linked") : "not_required";

  const approvedPurposes: PurposeOption[] = purposeRows
    .map((p) => ({ id: p.id, name: p.name, retention: retentionOf(p), processors: processorsOf(p.id), consent: consentOf(p) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const purposeName = new Map(purposeRows.map((p) => [p.id, p.name]));

  const intervalMs = health.syncIntervalHours * 3600_000;
  const now = Date.now();

  const rows: InventoryRow[] = fields.map((f) => {
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

    // ONE readiness status, by priority.
    let status: Readiness;
    if (sensitivity === "Not classified") status = "cls";
    else if (purposes.length === 0) status = "pur";
    else if (consentStates.some((c) => c === "not_linked")) status = "link";
    else if (outOfDate) status = "old";
    else status = "ready";

    const isChanged = f.driftFlag;
    const isNew = !f.lastVerified && !isChanged;
    const changeSummary = isChanged && f.previousType ? `Data type ${f.previousType} → ${f.overriddenType ?? f.detectedType}` : null;

    return {
      id: f.id, fieldPath: f.fieldPath, system: f.source.name, dataType: f.overriddenType ?? f.detectedType,
      sensitivity, sensitivityProvenance: f.reviewState === "overridden" ? "override" : "dlp", provenance,
      purposes, status, isNew, isChanged, changeSummary,
      location: f.fieldPath, lastScanned: lastScan ? agoText(lastScan, now) : null,
      dataCategory: f.dataCategory?.name ?? null, subjectType: f.dataSubjectType ?? null,
      retention, processors, consent,
      maskingStatus: sensitivity === "Not classified" ? "Not set" : `Follows ${sensitivity}`,
      usedInCount: usedCount.get(f.id) ?? 0,
    };
  });

  // Counts (whole inventory) — the single source of truth.
  const byStatus: Record<Readiness, number> = { cls: 0, pur: 0, link: 0, old: 0, ready: 0 };
  for (const r of rows) byStatus[r.status]++;
  const total = rows.length;
  const counts: ReadinessCounts = { total, ready: byStatus.ready, attention: total - byStatus.ready, byStatus };

  // Purpose frequency (for group suggestions) from already-tagged fields.
  const purposeFreqBySystem = new Map<string, Map<string, number>>();
  const purposeFreqByType = new Map<string, Map<string, number>>();
  const globalFreq = new Map<string, number>();
  const bump = (m: Map<string, Map<string, number>>, key: string, pid: string) => { const inner = m.get(key) ?? m.set(key, new Map()).get(key)!; inner.set(pid, (inner.get(pid) ?? 0) + 1); };
  for (const r of rows) for (const p of r.purposes) { bump(purposeFreqBySystem, r.system, p.id); bump(purposeFreqByType, r.dataType, p.id); globalFreq.set(p.id, (globalFreq.get(p.id) ?? 0) + 1); }

  const systems = [...new Map(rows.map((r) => [r.system, r.system])).keys()].sort();
  return { rows, counts, approvedPurposes, systems, purposeFreqBySystem, purposeFreqByType, purposeName, globalFreq, health };
}

/** Nav badge + anywhere else the attention count is needed — same derivation. */
export async function getInventoryCounts(): Promise<ReadinessCounts> {
  return (await deriveAll()).counts;
}

export async function getInventory(params: InventoryParams = {}): Promise<InventoryView> {
  const d = await deriveAll();
  const grouping: Grouping = params.grouping ?? "system";
  const segment: Segment = params.segment ?? (d.counts.attention > 0 ? "attention" : "all");

  // Filters (work list only; counts stay whole-inventory).
  const term = (params.q ?? "").trim().toLowerCase();
  let rows = d.rows.filter((r) => {
    if (params.system && r.system !== params.system) return false;
    if (params.sensitivity && r.sensitivity !== params.sensitivity) return false;
    if (params.status && r.status !== params.status) return false;
    if (params.dataType && r.dataType !== params.dataType) return false;
    if (params.dataCategory && r.dataCategory !== params.dataCategory) return false;
    if (params.subject && r.subjectType !== params.subject) return false;
    if (params.provenance && r.provenance !== params.provenance) return false;
    if (params.purpose && !r.purposes.some((p) => p.id === params.purpose)) return false;
    if (segment === "attention" && r.status === "ready") return false;
    if (term && !`${r.fieldPath} ${r.system} ${r.dataType}`.toLowerCase().includes(term)) return false;
    return true;
  });

  const rank = (s: Readiness) => READINESS_PRIORITY.indexOf(s);
  rows.sort((a, b) => rank(a.status) - rank(b.status) || (SENS_RANK[b.sensitivity] ?? 0) - (SENS_RANK[a.sensitivity] ?? 0) || a.fieldPath.localeCompare(b.fieldPath));

  // Groups.
  let groups: GroupView[] | null = null;
  if (grouping !== "none") {
    const keyOf = (r: InventoryRow) => grouping === "dataType" ? r.dataType : r.system;
    const map = new Map<string, InventoryRow[]>();
    for (const r of rows) (map.get(keyOf(r)) ?? map.set(keyOf(r), []).get(keyOf(r))!).push(r);
    groups = [...map.entries()].map(([key, rs]) => {
      const mix = SENSITIVITIES.map((label) => ({ label, count: rs.filter((r) => r.sensitivity === label).length })).filter((m) => m.count > 0);
      const gaps = (["cls", "pur", "link", "old"] as Readiness[]).map((status) => ({ status, count: rs.filter((r) => r.status === status).length })).filter((g) => g.count > 0);
      const purFieldIds = rs.filter((r) => r.status === "pur").map((r) => r.id);
      // Suggestion: most common approved purpose among tagged fields in the group (fallback global).
      let suggestion: GroupView["suggestion"] = null;
      if (purFieldIds.length > 0) {
        const groupFreq = (grouping === "dataType" ? d.purposeFreqByType : d.purposeFreqBySystem).get(key);
        const src = groupFreq && groupFreq.size > 0 ? groupFreq : d.globalFreq;
        const pick = [...src.entries()].sort((a, b) => b[1] - a[1])[0];
        if (pick) suggestion = { purposeId: pick[0], purposeName: d.purposeName.get(pick[0]) ?? "Purpose", confidence: pick[1] >= 2 ? "high" : "low", fieldIds: purFieldIds };
      }
      return { key, name: key, fieldCount: rs.length, newCount: rs.filter((r) => r.isNew || r.isChanged).length, mix, gaps, ready: rs.every((r) => r.status === "ready"), suggestion, rowIds: rs.map((r) => r.id) };
    });
    groups.sort((a, b) => (b.gaps.reduce((n, g) => n + g.count, 0)) - (a.gaps.reduce((n, g) => n + g.count, 0)) || a.name.localeCompare(b.name));
  }

  const sync: SyncStateView = {
    status: d.health.state === "connected" ? "idle" : d.health.state,
    lastSyncedAgo: d.health.lastSyncAgo, lastSyncedExact: d.health.lastSyncAt ? exactText(d.health.lastSyncAt) : null,
    systems: d.systems.length, warnText: d.health.warnText,
  };

  return {
    rows, groups, grouping,
    total: rows.length, personalTotal: d.counts.total,
    counts: d.counts, sync,
    systems: d.systems.map((s) => ({ id: s, name: s })),
    dataTypes: [...new Set(d.rows.map((r) => r.dataType))].sort(),
    approvedPurposes: d.approvedPurposes,
    notConnected: d.health.state === "not_connected",
  };
}

// --- Mutations --------------------------------------------------------------

export interface AssignResult { ok: true; assigned: number; skipped: number }

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

/** Suggested approved purposes for one field (drawer/popover): sibling purposes in the same system/category. */
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
