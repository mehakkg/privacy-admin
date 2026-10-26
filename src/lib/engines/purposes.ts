import { db } from "@/lib/db";
import { purposeState, type Purpose, type PurposeVersion, type LegalBasis, type ConsentStatus, type PurposeVersionState } from "@/lib/activities/types";
import { noticeFor, MERIDIAN_PURPOSES } from "@/lib/activities/notices";

/**
 * Purpose reads for the Add-purpose popover and the Purpose library. Purposes are
 * PurposeTag + PurposeVersion[]; the in-force version is the latest approved one.
 */

function basisOf(b: string | null | undefined): LegalBasis { return b === "consent" ? "consent" : "legitimate_use"; }
function parseRetention(s: string | null | undefined) {
  if (!s) return { amount: 0, unit: "years" as const, trigger: "" };
  const m = s.match(/(\d+)\s*(month|year)s?\s*(.*)$/i);
  if (!m) return { amount: 0, unit: "years" as const, trigger: s };
  return { amount: Number(m[1]), unit: (m[2].toLowerCase().startsWith("month") ? "months" : "years") as "months" | "years", trigger: m[3].trim() };
}

type Tag = { id: string; name: string; description: string; status: string; retention: string | null; lawfulBasis: string | null; approvedBy: string | null; approvedAt: Date | null; proposedBy: string | null; proposedAt: Date | null; rejectionReason: string | null; purposeVersions: { number: number; state: string; name: string; description: string; legalBasis: string; legitimateUseType: string | null; retentionAmount: number | null; retentionUnit: string | null; retentionTrigger: string | null; justification: string | null; submittedBy: string | null; submittedAt: Date | null; decidedBy: string | null; decidedAt: Date | null; decisionComment: string | null; selfApproved: boolean; consent: string }[] };

export function tagToPurpose(tag: Tag): Purpose {
  const retiredAt = tag.status === "retired" ? (tag.approvedAt?.toISOString() ?? null) : null;
  if (tag.purposeVersions.length > 0) {
    const versions: PurposeVersion[] = tag.purposeVersions.map((v) => ({
      number: v.number, state: v.state as PurposeVersionState, name: v.name, description: v.description, legalBasis: basisOf(v.legalBasis), legitimateUseType: v.legitimateUseType,
      retention: { amount: v.retentionAmount ?? 0, unit: (v.retentionUnit === "months" ? "months" : "years"), trigger: v.retentionTrigger ?? "" },
      justification: v.justification ?? "", submittedBy: v.submittedBy, submittedAt: v.submittedAt?.toISOString() ?? null, decidedBy: v.decidedBy, decidedAt: v.decidedAt?.toISOString() ?? null, decisionComment: v.decisionComment, selfApproved: v.selfApproved, consent: v.consent as ConsentStatus,
    }));
    return { id: tag.id, versions, retiredAt };
  }
  const stateMap: Record<string, PurposeVersionState> = { approved: "approved", pending_dpo_approval: "waiting_for_dpo", draft: "draft", rejected: "rejected", retired: "retired" };
  const basis = basisOf(tag.lawfulBasis);
  return { id: tag.id, retiredAt, versions: [{ number: 1, state: stateMap[tag.status] ?? "approved", name: tag.name, description: tag.description, legalBasis: basis, legitimateUseType: basis === "legitimate_use" ? "Voluntarily provided for a specified purpose" : null, retention: parseRetention(tag.retention), justification: "", submittedBy: tag.proposedBy, submittedAt: tag.proposedAt?.toISOString() ?? null, decidedBy: tag.approvedBy, decidedAt: tag.approvedAt?.toISOString() ?? null, decisionComment: tag.rejectionReason, selfApproved: false, consent: basis === "consent" ? "not_linked" : "not_required" }] };
}

const retentionText = (v: PurposeVersion) => v.retention.amount ? `${v.retention.amount} ${v.retention.unit} ${v.retention.trigger}`.trim() : "No retention set";
const basisLabel = (v: PurposeVersion) => v.legalBasis === "consent" ? "Consent" : "Legitimate use";

export interface PickerRow { id: string; name: string; sub: string; added: boolean }
export interface PurposePickerData { approved: PickerRow[]; waiting: PickerRow[]; drafts: PickerRow[]; changes: PickerRow[] }

export async function getPurposePicker(activityId: string): Promise<PurposePickerData> {
  const [tags, segs] = await Promise.all([
    db.purposeTag.findMany({ include: { purposeVersions: true } }),
    db.activityPurpose.findMany({ where: { activityId }, select: { purposeTagId: true } }),
  ]);
  const inActivity = new Set(segs.map((s) => s.purposeTagId).filter(Boolean) as string[]);
  const data: PurposePickerData = { approved: [], waiting: [], drafts: [], changes: [] };
  for (const t of tags) {
    const p = tagToPurpose(t as Tag);
    const ps = purposeState(p);
    const inForce = ps.inForce ?? ps.latest!;
    const row: PickerRow = { id: t.id, name: t.name, added: inActivity.has(t.id), sub: "" };
    if (ps.approvedForUse) { row.sub = `${basisLabel(inForce)} · ${retentionText(inForce)}`; data.approved.push(row); }
    else if (ps.state === "waiting_for_dpo") { row.sub = `Waiting for K. Menon`; data.waiting.push(row); }
    else if (ps.state === "changes_requested") { row.sub = "Changes requested"; data.changes.push(row); }
    else if (ps.state === "draft") { row.sub = "Draft"; data.drafts.push(row); }
  }
  const byName = (a: PickerRow, b: PickerRow) => a.name.localeCompare(b.name);
  data.approved.sort(byName); data.waiting.sort(byName); data.drafts.sort(byName); data.changes.sort(byName);
  return data;
}

export interface LibraryEdit { name: string; description: string; legalBasis: "consent" | "legitimate_use"; legitimateUseType: string | null; amount: number; unit: "months" | "years"; trigger: string; justification: string }
export interface LibraryRow { id: string; name: string; sub: string; state: PurposeVersionState | "approved_newer_waiting"; stateLabel: string; usedBy: number; version: number | null; edit: LibraryEdit; editApproved: boolean; inForceVersion: number | null }
export interface PurposeLibraryView { rows: LibraryRow[]; sentence: string; counts: { attention: number; approved: number; all: number } }

const STATE_LABEL: Record<string, string> = { approved: "Approved", waiting_for_dpo: "Waiting for DPO", changes_requested: "Changes requested", draft: "Draft", rejected: "Rejected", retired: "Retired", approved_newer_waiting: "Approved · newer version waiting" };

export async function getPurposeLibrary(): Promise<PurposeLibraryView> {
  const [tags, segs] = await Promise.all([
    db.purposeTag.findMany({ include: { purposeVersions: true } }),
    db.activityPurpose.groupBy({ by: ["purposeTagId"], _count: true }),
  ]);
  const usedBy = new Map(segs.map((s) => [s.purposeTagId, s._count] as [string | null, number]));
  const rows: LibraryRow[] = tags.map((t) => {
    const p = tagToPurpose(t as Tag);
    const ps = purposeState(p);
    const inForce = ps.inForce ?? ps.latest!;
    const disp = ps.displayState as LibraryRow["state"];
    const stateLabel = disp === "approved" ? `Approved · version ${inForce.number}` : STATE_LABEL[disp] ?? disp;
    const nonApproved = ps.latest && ps.latest.state !== "approved" && ps.latest.state !== "retired" ? ps.latest : null;
    const src = nonApproved ?? inForce;
    return {
      id: t.id, name: t.name, sub: `${basisLabel(inForce)} · ${retentionText(inForce)}`, state: disp, stateLabel, usedBy: usedBy.get(t.id) ?? 0, version: ps.inForce?.number ?? null,
      editApproved: ps.approvedForUse && !nonApproved, inForceVersion: ps.inForce?.number ?? null,
      edit: { name: src.name, description: src.description, legalBasis: src.legalBasis, legitimateUseType: src.legitimateUseType, amount: src.retention.amount, unit: src.retention.unit, trigger: src.retention.trigger, justification: src.justification },
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const approved = rows.filter((r) => r.state === "approved" || r.state === "approved_newer_waiting").length;
  const attention = rows.filter((r) => ["waiting_for_dpo", "changes_requested", "draft", "rejected"].includes(r.state)).length;
  const waiting = rows.filter((r) => r.state === "waiting_for_dpo").length;
  const changes = rows.filter((r) => r.state === "changes_requested").length;
  const drafts = rows.filter((r) => r.state === "draft").length;
  const parts = [`${rows.length} purposes.`, `${approved} approved`];
  if (waiting) parts.push(`${waiting} waiting for your DPO`);
  if (changes) parts.push(`${changes} need${changes === 1 ? "s" : ""} changes`);
  if (drafts) parts.push(`${drafts} ${drafts === 1 ? "is a draft" : "are drafts"}`);
  const sentence = parts[0] + " " + parts.slice(1).join(", ") + ".";
  return { rows, sentence, counts: { attention, approved, all: rows.length } };
}

// --- Purposes page (Data Map redesign) --------------------------------------

export type PurposeStatus = "approved" | "pending" | "draft" | "rejected";
export interface PurposeRow {
  id: string; name: string; description: string;
  legalBasisLabel: string; legalBasisShort: string; status: PurposeStatus; statusLabel: string; version: number;
  usedByCount: number; usedByFirst: string | null;
  inNotice: string | null; noticeRequired: boolean; notInNotice: boolean; rejectionReason: string | null;
  linkedActivities: { id: string; name: string }[];
  approvedBy: string | null; approvedAt: string | null;
  edit: { name: string; description: string; legalBasis: "consent" | "legitimate_use"; legitimateUseType: string | null; amount: number; unit: "months" | "years"; trigger: string; justification: string };
}
export interface PurposesView { rows: PurposeRow[]; counts: { needs_action: number; pending: number; approved: number; draft: number; rejected: number; notInNotice: number; all: number } }

/** Short legal-basis form for the table, e.g. "Consent · S.6" / "Legitimate use · 7(i)". */
function basisShort(basis: "consent" | "legitimate_use", legitimateUseType: string | null): string {
  if (basis === "consent") return "Consent · S.6";
  if (legitimateUseType && /employ/i.test(legitimateUseType)) return "Legitimate use · 7(i)";
  return "Legitimate use · S.7";
}

const STATUS_OF: Record<string, PurposeStatus> = { approved: "approved", waiting_for_dpo: "pending", draft: "draft", changes_requested: "draft", rejected: "rejected" };
const STATUS_LABEL: Record<PurposeStatus, string> = { approved: "Approved", pending: "Pending DPO approval", draft: "Draft", rejected: "Rejected" };

/** The Purposes page: why personal data is processed, and where each purpose sits
 *  in approval + whether a consent purpose is in a published notice. */
export async function getPurposesView(): Promise<PurposesView> {
  const [tags, segs] = await Promise.all([
    db.purposeTag.findMany({ where: { name: { in: MERIDIAN_PURPOSES } }, include: { purposeVersions: { orderBy: { number: "desc" } } }, orderBy: { name: "asc" } }),
    db.activityPurpose.findMany({ where: { linkState: "confirmed" }, select: { purposeTagId: true, activity: { select: { id: true, activity: true } } } }),
  ]);
  const byPurpose = new Map<string, { id: string; name: string }[]>();
  for (const s of segs) { if (!s.purposeTagId) continue; (byPurpose.get(s.purposeTagId) ?? byPurpose.set(s.purposeTagId, []).get(s.purposeTagId)!).push({ id: s.activity.id, name: s.activity.activity }); }

  const rows: PurposeRow[] = tags.map((t) => {
    const v = t.purposeVersions[0];
    const legalBasis = (v?.legalBasis ?? t.lawfulBasis) === "consent" ? "consent" as const : "legitimate_use" as const;
    const legalBasisLabel = legalBasis === "consent" ? "Consent (Section 6)" : `Legitimate use${v?.legitimateUseType ? `: ${v.legitimateUseType}` : ""}`;
    const status = STATUS_OF[v?.state ?? t.status] ?? "approved";
    const used = [...new Map((byPurpose.get(t.id) ?? []).map((a) => [a.id, a])).values()];
    const ret = parseRetention(t.retention);
    const inNotice = noticeFor(t.name);
    return {
      id: t.id, name: t.name, description: v?.description ?? t.description,
      legalBasisLabel, legalBasisShort: basisShort(legalBasis, v?.legitimateUseType ?? null), status, statusLabel: STATUS_LABEL[status], version: v?.number ?? 1,
      usedByCount: used.length, usedByFirst: used[0]?.name ?? null,
      inNotice, noticeRequired: legalBasis === "consent", notInNotice: status === "approved" && legalBasis === "consent" && !inNotice,
      rejectionReason: status === "rejected" ? (v?.decisionComment ?? t.rejectionReason ?? null) : null,
      linkedActivities: used,
      approvedBy: status === "approved" ? (v?.decidedBy ?? t.approvedBy ?? "Kavita Menon") : null,
      approvedAt: status === "approved" ? (v?.decidedAt?.toISOString() ?? t.approvedAt?.toISOString() ?? null) : null,
      edit: { name: t.name, description: v?.description ?? t.description, legalBasis, legitimateUseType: v?.legitimateUseType ?? null, amount: ret.amount, unit: ret.unit, trigger: ret.trigger, justification: v?.justification ?? "" },
    };
  });

  const counts = {
    needs_action: rows.filter((r) => r.status === "draft" || r.status === "rejected").length,
    pending: rows.filter((r) => r.status === "pending").length,
    approved: rows.filter((r) => r.status === "approved").length,
    draft: rows.filter((r) => r.status === "draft").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
    notInNotice: rows.filter((r) => r.notInNotice).length,
    all: rows.length,
  };
  return { rows, counts };
}
