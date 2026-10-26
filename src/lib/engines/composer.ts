import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { USERS, PRINCIPAL_OPTIONS } from "@/lib/activities/org";
import { DECLARED_CHANNELS, kindOf, KIND_LABEL, RECIPIENTS, countryName } from "@/lib/activities/systems";
import { MERIDIAN_PURPOSES, noticeFor } from "@/lib/activities/notices";

/**
 * Activity composer data (Master spec Part M). One aggregation the composer reads
 * for every token — principals, DLP fields grouped by system, channels, purposes,
 * systems/processors, recipients, templates — plus the existing activities the
 * duplicate check compares against. Nothing here is invented; every value is an
 * existing tenant vocabulary item (M8).
 */

export interface ComposerPurpose { id: string; name: string; approval: "approved" | "pending" | "draft" | "rejected"; legalBasis: "consent" | "legitimate_use"; inNotice: boolean }
export interface ComposerField { id: string; path: string; system: string; sensitivity: string }
export interface ComposerSystem { id: string; name: string; kind: string; kindLabel: string; country: string; contract: "on_file" | "none" | "expired" }
export interface ComposerTemplate { id: string; name: string; sub: string; principalIds: string[]; fieldTypes: string[] }
export interface ComposerExisting { id: string; name: string; principals: string[]; fieldIds: string[] }

export interface ComposerData {
  currentUser: string;
  multiEntity: boolean;
  entities: { id: string; name: string }[];
  owners: { name: string; department: string }[];
  principals: { id: string; label: string }[];
  channels: string[];
  purposes: ComposerPurpose[];
  fields: ComposerField[];
  systems: ComposerSystem[];
  recipients: ComposerSystem[];
  templates: ComposerTemplate[];
  existing: ComposerExisting[];
}

function approvalOf(state: string | undefined, status: string): ComposerPurpose["approval"] {
  const s = state ?? status;
  if (s === "approved") return "approved";
  if (s === "waiting_for_dpo" || s === "pending_dpo_approval") return "pending";
  if (s === "rejected") return "rejected";
  return "draft";
}

export async function getComposerData(): Promise<ComposerData> {
  const { actor } = await getSession();
  const [tags, fieldRows, vendors, templates, cfg, entities, acts] = await Promise.all([
    db.purposeTag.findMany({ where: { name: { in: MERIDIAN_PURPOSES } }, include: { purposeVersions: { orderBy: { number: "desc" } } }, orderBy: { name: "asc" } }),
    db.classifiedField.findMany({ include: { source: { select: { name: true } } } }),
    db.dataProcessor.findMany({ orderBy: { name: "asc" } }),
    db.activityTemplate.findMany({ orderBy: { name: "asc" } }),
    db.integrationConfig.findUnique({ where: { id: "singleton" }, select: { paMultiEntity: true } }),
    db.entity.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.processingActivity.findMany({ where: { lifecycleState: { not: "retired" } }, select: { id: true, activity: true, principalsJson: true, purposeSegments: { select: { elements: { select: { classifiedFieldId: true } } } } } }),
  ]);

  const purposes: ComposerPurpose[] = tags.map((t) => {
    const v = t.purposeVersions[0];
    const legalBasis = (v?.legalBasis ?? t.lawfulBasis) === "consent" ? "consent" as const : "legitimate_use" as const;
    return { id: t.id, name: t.name, approval: approvalOf(v?.state, t.status), legalBasis, inNotice: !!noticeFor(t.name) };
  });
  // Approved first, then drafts/pending/rejected, each alphabetical.
  const rank = { approved: 0, draft: 1, pending: 2, rejected: 3 } as const;
  purposes.sort((a, b) => rank[a.approval] - rank[b.approval] || a.name.localeCompare(b.name));

  const fields: ComposerField[] = fieldRows.map((f) => ({ id: f.id, path: f.fieldPath, system: f.source.name, sensitivity: f.sensitivityTier ?? "Not classified" }))
    .sort((a, b) => a.system.localeCompare(b.system) || a.path.localeCompare(b.path));

  const contractOf = (v: { dpaStatus: string; dpaExpiresAt: Date | null }): "on_file" | "none" | "expired" => {
    if (v.dpaStatus !== "active") return "none";
    if (v.dpaExpiresAt && v.dpaExpiresAt.getTime() < Date.now()) return "expired";
    return "on_file";
  };
  const allSystems: ComposerSystem[] = vendors.map((v) => {
    const kind = kindOf(v.name);
    return { id: v.id, name: v.name, kind, kindLabel: KIND_LABEL[kind], country: countryName(v.jurisdiction ?? null), contract: contractOf(v) };
  });
  const systems = allSystems.filter((s) => !RECIPIENTS.has(s.name));
  const recipients = allSystems.filter((s) => RECIPIENTS.has(s.name));

  const existing: ComposerExisting[] = acts.map((a) => ({
    id: a.id, name: a.activity,
    principals: (() => { try { return JSON.parse(a.principalsJson || "[]") as string[]; } catch { return []; } })(),
    fieldIds: [...new Set(a.purposeSegments.flatMap((s) => s.elements.map((e) => e.classifiedFieldId).filter(Boolean) as string[]))],
  }));

  // Who options = the principals actually used across the register, plus the DPDP
  // base categories — so names like "Loan applicant" and "Visitor" are offered.
  const regPrincipals = [...new Set(acts.flatMap((a) => { try { return JSON.parse(a.principalsJson || "[]") as string[]; } catch { return []; } }))];
  const principalNames = [...new Set([...regPrincipals, ...PRINCIPAL_OPTIONS.map((p) => p.label)])].filter(Boolean).sort();

  return {
    currentUser: actor.label,
    multiEntity: cfg?.paMultiEntity ?? false,
    entities,
    owners: USERS.filter((u) => u.roles.includes("admin")).map((u) => ({ name: u.name, department: u.department })),
    principals: principalNames.map((n) => ({ id: n, label: n })),
    channels: [...DECLARED_CHANNELS],
    purposes,
    fields,
    systems,
    recipients,
    templates: templates.map((t) => {
      const pids = (() => { try { return JSON.parse(t.purposeIdsJson || "[]") as string[]; } catch { return []; } })();
      const types = (() => { try { return JSON.parse(t.typicalDataTypesJson || "[]") as string[]; } catch { return []; } })();
      return { id: t.id, name: t.name, sub: `${pids.length} typical purpose${pids.length === 1 ? "" : "s"} · ${types.length} typical data types`, principalIds: [], fieldTypes: types };
    }),
    existing,
  };
}
