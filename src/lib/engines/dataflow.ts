import { db } from "@/lib/db";
import { decodeList } from "@/lib/codec/json";
import { getDlpHealth } from "@/lib/engines/dlp";
import { noticeFor } from "@/lib/activities/notices";
import { kindOf, KIND_LABEL, countryName, isCrossBorder, isRecipient, CHANNELS_BY_ACTIVITY, DECLARED_CHANNELS } from "@/lib/activities/systems";

/**
 * DATA FLOW — derived, read-only. Computed from the register (activities →
 * purposes → systems/recipients) + the collection-channel fixture. Never edited.
 * Six layered columns; findings are the lead element, not a risk legend. Only
 * blocking findings (+ the duplicate-category to-do) count toward "needs attention".
 * Cross-border is informational (Section 16), never styled as a violation.
 */

export type FindingKey = "no_notice" | "undeclared" | "contract" | "cross_border" | "shared_fiduciary" | "duplicate";
export interface Finding { key: FindingKey; label: string; level: "blocking" | "info"; count: number; flowIds: string[]; anchor: string }
export interface Flow {
  id: string; principal: string; channel: string; noticeBasis: string; noticeMissing: boolean;
  activity: string; activityId: string; purpose: string;
  systems: { name: string; kindLabel: string; country: string; crossBorder: boolean; contractExpired: boolean }[];
  recipients: { name: string; kindLabel: string; country: string; crossBorder: boolean }[];
  fields: string[]; findings: FindingKey[];
}
export interface FlowNode { id: string; label: string; sub: string | null; finding: string | null; crossBorder: boolean; flowIds: string[] }
export interface FlowEdge { id: string; from: string; to: string; count: number; blocking: boolean; crossBorder: boolean; flowIds: string[] }
export interface DataFlowView {
  scopeLabel: string; entities: { id: string; name: string }[]; entityId: string | null;
  summary: { channels: number; activities: number; systems: number; recipients: number; attention: number };
  findings: Finding[];
  columns: { key: string; label: string; nodes: FlowNode[] }[];
  edges: FlowEdge[];
  flows: Flow[];
  notOnMap: { id: string; name: string }[];
  stale: boolean; staleLabel: string | null;
  hasSystems: boolean;
}

const FINDING_META: Record<FindingKey, { label: string; level: "blocking" | "info"; anchor: string }> = {
  no_notice: { label: "No notice", level: "blocking", anchor: "Section 5(1), Rule 3" },
  undeclared: { label: "Undeclared channel", level: "blocking", anchor: "Section 5(1)" },
  contract: { label: "Processor without a valid contract", level: "blocking", anchor: "Section 8(2)" },
  cross_border: { label: "Cross-border", level: "info", anchor: "Section 16" },
  shared_fiduciary: { label: "Shared with another fiduciary", level: "info", anchor: "Section 8(3)" },
  duplicate: { label: "Duplicate category names", level: "info", anchor: "Register hygiene" },
};

export async function getDataFlow(entityId?: string | null, today: Date = new Date()): Promise<DataFlowView> {
  const [rows, tags, entities, health] = await Promise.all([
    db.processingActivity.findMany({ where: { lifecycleState: { not: "retired" } }, include: { purposeSegments: { include: { elements: true, processorLinks: true } }, entity: { select: { id: true, name: true } } } }),
    db.purposeTag.findMany({ include: { purposeVersions: { orderBy: { number: "desc" } } } }),
    db.entity.findMany({ where: { name: { in: ["Meridian Financial Services Ltd", "Meridian Securities Ltd"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getDlpHealth(),
  ]);
  const tagById = new Map(tags.map((t) => { const v = t.purposeVersions[0]; return [t.id, { name: t.name, legalBasis: v?.legalBasis ?? t.lawfulBasis, legitimateUseType: v?.legitimateUseType ?? null }]; }));
  const vendorIds = [...new Set(rows.flatMap((r) => r.purposeSegments.flatMap((s) => { const ids = s.processorLinks.filter((p) => p.linkState === "confirmed").map((p) => p.vendorId); if (s.processorId) ids.push(s.processorId); return ids; })))];
  const vendors = vendorIds.length ? await db.dataProcessor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true, jurisdiction: true, dpaStatus: true, dpaExpiresAt: true } }) : [];
  const vById = new Map(vendors.map((v) => [v.id, v]));

  const scoped = entityId ? rows.filter((r) => r.entityId === entityId) : rows;
  const onMap = scoped.filter((r) => r.purposeSegments.some((s) => s.elements.filter((e) => e.linkState === "confirmed").length > 0));
  const notOnMap = scoped.filter((r) => !onMap.includes(r)).map((r) => ({ id: r.id, name: r.activity }));

  // Duplicate principal/channel category names (case-insensitive), across ALL scoped activities.
  const allPrincipals = [...new Set(scoped.flatMap((r) => (decodeList(r.principalsJson) as string[]) ?? []))];
  const dupSeen = new Map<string, string>(); const dupNames: string[] = [];
  for (const p of allPrincipals) { const k = p.toLowerCase(); if (dupSeen.has(k)) dupNames.push(`${dupSeen.get(k)} / ${p}`); else dupSeen.set(k, p); }

  const flows: Flow[] = [];
  for (const r of onMap) {
    const principals = (decodeList(r.principalsJson) as string[]) ?? [];
    const seg = r.purposeSegments.find((s) => s.purposeTagId && s.elements.some((e) => e.linkState === "confirmed")) ?? r.purposeSegments[0];
    const info = seg?.purposeTagId ? tagById.get(seg.purposeTagId) : null;
    const purpose = info?.name ?? "—";
    const legitUse = (info?.legalBasis ?? "consent") !== "consent";
    const notice = noticeFor(purpose);
    const fields = seg ? seg.elements.filter((e) => e.linkState === "confirmed").map((e) => e.fieldName) : [];
    const vids = new Set((seg?.processorLinks.filter((p) => p.linkState === "confirmed").map((p) => p.vendorId)) ?? []); if (seg?.processorId) vids.add(seg.processorId);
    const systems = [...vids].map((id) => vById.get(id)).filter(Boolean).filter((v) => !isRecipient(v!.name)).map((v) => ({ name: v!.name, kindLabel: KIND_LABEL[kindOf(v!.name)], country: countryName(v!.jurisdiction), crossBorder: isCrossBorder(v!.jurisdiction), contractExpired: v!.dpaStatus === "expired" || !!(v!.dpaExpiresAt && v!.dpaExpiresAt.getTime() < today.getTime()) }));
    const recipients = [...vids].map((id) => vById.get(id)).filter(Boolean).filter((v) => isRecipient(v!.name)).map((v) => ({ name: v!.name, kindLabel: KIND_LABEL[kindOf(v!.name)], country: countryName(v!.jurisdiction), crossBorder: isCrossBorder(v!.jurisdiction) }));
    const channels = CHANNELS_BY_ACTIVITY[r.activity] ?? ["Web portal"];

    for (const channel of channels) {
      const undeclared = !DECLARED_CHANNELS.has(channel);
      // One flow per channel. For an activity with two principals, the undeclared
      // channel carries the second principal (e.g. Partner API → Prospect).
      const principal = channels.length > 1 && undeclared && principals.length > 1 ? principals[1] : principals[0] ?? "—";
      const noticeBasis = legitUse ? `Legitimate use · ${info?.legitimateUseType ?? "7(i)"}` : (notice ?? "No notice");
      const noticeMissing = !legitUse && !notice;
      const findings: FindingKey[] = [];
      if (undeclared) findings.push("undeclared");
      else if (noticeMissing) findings.push("no_notice"); // count once: undeclared OR no_notice
      if (systems.some((s) => s.contractExpired)) findings.push("contract");
      if (systems.some((s) => s.crossBorder) || recipients.some((rc) => rc.crossBorder)) findings.push("cross_border");
      if (recipients.some((rc) => kindOf(rc.name) === "fiduciary")) findings.push("shared_fiduciary");
      flows.push({ id: `${r.id}:${channel}`, principal, channel, noticeBasis, noticeMissing, activity: r.activity, activityId: r.id, purpose, systems, recipients, fields, findings });
    }
  }

  // --- Findings (counts per spec: no_notice=flows, undeclared=channels, contract=processors) ---
  const flowsWith = (k: FindingKey) => flows.filter((f) => f.findings.includes(k)).map((f) => f.id);
  const findings: Finding[] = [];
  const noNoticeFlows = flows.filter((f) => f.findings.includes("no_notice"));
  if (noNoticeFlows.length) findings.push({ key: "no_notice", ...FINDING_META.no_notice, count: noNoticeFlows.length, flowIds: noNoticeFlows.map((f) => f.id) });
  const undeclaredChannels = [...new Set(flows.filter((f) => f.findings.includes("undeclared")).map((f) => f.channel))];
  if (undeclaredChannels.length) findings.push({ key: "undeclared", ...FINDING_META.undeclared, count: undeclaredChannels.length, flowIds: flowsWith("undeclared") });
  const expiredProcessors = [...new Set(flows.flatMap((f) => f.systems.filter((s) => s.contractExpired).map((s) => s.name)))];
  if (expiredProcessors.length) findings.push({ key: "contract", ...FINDING_META.contract, count: expiredProcessors.length, flowIds: flowsWith("contract") });
  const crossBorderNodes = [...new Set(flows.flatMap((f) => [...f.systems.filter((s) => s.crossBorder).map((s) => s.name), ...f.recipients.filter((rc) => rc.crossBorder).map((rc) => rc.name)]))];
  if (crossBorderNodes.length) findings.push({ key: "cross_border", ...FINDING_META.cross_border, count: crossBorderNodes.length, flowIds: flowsWith("cross_border") });
  const fiduciaries = [...new Set(flows.flatMap((f) => f.recipients.filter((rc) => kindOf(rc.name) === "fiduciary").map((rc) => rc.name)))];
  if (fiduciaries.length) findings.push({ key: "shared_fiduciary", ...FINDING_META.shared_fiduciary, count: fiduciaries.length, flowIds: flowsWith("shared_fiduciary") });
  if (dupNames.length) findings.push({ key: "duplicate", ...FINDING_META.duplicate, count: dupNames.length, flowIds: flows.filter((f) => dupNames.some((d) => d.toLowerCase().includes(f.principal.toLowerCase()))).map((f) => f.id) });

  // attention = blocking findings + the duplicate to-do (cross-border & shared are info only)
  const attention = findings.filter((f) => f.level === "blocking" || f.key === "duplicate").reduce((n, f) => n + f.count, 0);

  // --- Columns + edges ---
  const col = (key: string, label: string, pick: (f: Flow) => { id: string; label: string; sub: string | null; crossBorder?: boolean; finding?: string | null }[]) => {
    const map = new Map<string, FlowNode>();
    for (const f of flows) for (const n of pick(f)) {
      const ex = map.get(n.id); if (ex) { ex.flowIds.push(f.id); if (n.finding) ex.finding = n.finding; if (n.crossBorder) ex.crossBorder = true; }
      else map.set(n.id, { id: n.id, label: n.label, sub: n.sub, finding: n.finding ?? null, crossBorder: !!n.crossBorder, flowIds: [f.id] });
    }
    return { key, label, nodes: [...map.values()] };
  };
  const columns = [
    col("principal", "Data principal", (f) => [{ id: `p:${f.principal}`, label: f.principal, sub: null }]),
    col("channel", "Collection channel", (f) => [{ id: `c:${f.channel}`, label: f.channel, sub: null, finding: f.findings.includes("undeclared") ? "Undeclared channel" : null }]),
    col("notice", "Notice / legal basis", (f) => [{ id: `n:${f.noticeBasis}`, label: f.noticeBasis, sub: null, finding: f.noticeMissing ? "No notice" : null }]),
    col("activity", "Processing activity", (f) => [{ id: `a:${f.activityId}`, label: f.activity, sub: f.purpose }]),
    col("system", "Storage & systems", (f) => f.systems.map((s) => ({ id: `s:${s.name}`, label: s.name, sub: `${s.kindLabel} · ${s.country}`, crossBorder: s.crossBorder, finding: s.contractExpired ? "Contract expired" : null }))),
    col("recipient", "Shared with", (f) => f.recipients.map((rc) => ({ id: `r:${rc.name}`, label: rc.name, sub: `${rc.kindLabel} · ${rc.country}`, crossBorder: rc.crossBorder }))),
  ];

  const edgeMap = new Map<string, FlowEdge>();
  const addEdge = (from: string, to: string, f: Flow, crossBorder: boolean) => {
    const id = `${from}->${to}`; const blocking = f.findings.some((k) => FINDING_META[k].level === "blocking");
    const ex = edgeMap.get(id);
    if (ex) { ex.count++; ex.flowIds.push(f.id); ex.blocking = ex.blocking || blocking; ex.crossBorder = ex.crossBorder || crossBorder; }
    else edgeMap.set(id, { id, from, to, count: 1, blocking, crossBorder, flowIds: [f.id] });
  };
  for (const f of flows) {
    addEdge(`p:${f.principal}`, `c:${f.channel}`, f, false);
    addEdge(`c:${f.channel}`, `n:${f.noticeBasis}`, f, false);
    addEdge(`n:${f.noticeBasis}`, `a:${f.activityId}`, f, false);
    for (const s of f.systems) addEdge(`a:${f.activityId}`, `s:${s.name}`, f, s.crossBorder);
    for (const rc of f.recipients) addEdge(`a:${f.activityId}`, `r:${rc.name}`, f, rc.crossBorder);
  }

  const systemNames = new Set(flows.flatMap((f) => f.systems.map((s) => s.name)));
  const recipientNames = new Set(flows.flatMap((f) => f.recipients.map((r) => r.name)));
  const channelNames = new Set(flows.map((f) => f.channel));
  const stale = health.state === "stale";

  return {
    scopeLabel: entityId ? (entities.find((e) => e.id === entityId)?.name ?? "Fiduciary") : `All fiduciaries (${entities.length})`,
    entities, entityId: entityId ?? null,
    summary: { channels: channelNames.size, activities: onMap.length, systems: systemNames.size, recipients: recipientNames.size, attention },
    findings, columns, edges: [...edgeMap.values()], flows, notOnMap,
    stale, staleLabel: stale ? (health.lastSyncAgo ?? "recently") : null,
    hasSystems: vendors.length > 0,
  };
}
