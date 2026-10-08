import { db } from "@/lib/db";
import { purposeState, type Purpose, type PurposeVersion, type LegalBasis, type ConsentStatus, type PurposeVersionState } from "@/lib/activities/types";

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
