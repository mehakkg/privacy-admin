import { db } from "@/lib/db";

/**
 * Processors for a purpose segment (Screen 6 — Processors). Processor links are
 * ActivityPurposeProcessor rows; "no processor" is recorded explicitly on the
 * segment. Suggestions are inferred from the systems of the linked data.
 */

const NOTIFIED = new Set(["IN", "SG", "AE", "JP"]); // notified-country allowlist
/** Map a discovery-source name to a vendor name (no System.vendorId in this build). */
const SOURCE_VENDOR: Record<string, string> = { "Legacy Loan Archive": "Acme Cloud", "Marketing Automation": "Northwind Mail", "Finance File Share": "Acme Cloud", "Support Desk": "Helpdesk Co" };
function vendorForSystem(system: string, vendorNames: string[]): string | null {
  const direct = vendorNames.find((v) => system.toLowerCase().includes(v.toLowerCase()));
  if (direct) return direct;
  return SOURCE_VENDOR[system] ?? null;
}

export interface ProcRow { linkId: string; vendorId: string; name: string; country: string; contract: "on_file" | "none" | "expired"; risk: string; transfer: boolean }
export interface ProcSuggestion { vendorId: string; name: string; count: number }
export interface PurposeProcessorsView { segmentId: string | null; mode: "unanswered" | "uses_processors" | "none"; noProcessorBy: string | null; noProcessorAt: string | null; rows: ProcRow[]; suggested: ProcSuggestion[] }

function contractOf(p: { dpaStatus: string; dpaExpiresAt: Date | null }): "on_file" | "none" | "expired" {
  if (p.dpaStatus !== "active") return "none";
  if (p.dpaExpiresAt && p.dpaExpiresAt.getTime() < Date.now()) return "expired";
  return "on_file";
}

export async function getPurposeProcessors(activityId: string, purposeId: string): Promise<PurposeProcessorsView> {
  const seg = await db.activityPurpose.findFirst({ where: { activityId, purposeTagId: purposeId }, include: { processorLinks: true, elements: true } });
  if (!seg) return { segmentId: null, mode: "unanswered", noProcessorBy: null, noProcessorAt: null, rows: [], suggested: [] };
  const linkVendorIds = seg.processorLinks.map((l) => l.vendorId);
  if (seg.processorId && !linkVendorIds.includes(seg.processorId)) linkVendorIds.push(seg.processorId);
  const vendors = linkVendorIds.length ? await db.dataProcessor.findMany({ where: { id: { in: linkVendorIds } } }) : [];
  const vById = new Map(vendors.map((v) => [v.id, v]));
  const rows: ProcRow[] = seg.processorLinks.map((l) => {
    const v = vById.get(l.vendorId);
    const country = v?.jurisdiction ?? "—";
    return { linkId: l.id, vendorId: l.vendorId, name: v?.name ?? "—", country, contract: v ? contractOf(v) : "none", risk: v?.riskClassification ?? "unrated", transfer: !!v?.jurisdiction && !NOTIFIED.has(v.jurisdiction) };
  });
  if (seg.processorId && !seg.processorLinks.some((l) => l.vendorId === seg.processorId)) {
    const v = vById.get(seg.processorId);
    if (v) rows.push({ linkId: `legacy:${seg.processorId}`, vendorId: seg.processorId, name: v.name, country: v.jurisdiction ?? "—", contract: contractOf(v), risk: v.riskClassification ?? "unrated", transfer: !!v.jurisdiction && !NOTIFIED.has(v.jurisdiction) });
  }

  // Suggested from the linked data's systems.
  const fieldIds = seg.elements.map((e) => e.classifiedFieldId).filter(Boolean) as string[];
  const fields = fieldIds.length ? await db.classifiedField.findMany({ where: { id: { in: fieldIds } }, include: { source: { select: { name: true } } } }) : [];
  const allVendors = await db.dataProcessor.findMany({ select: { id: true, name: true } });
  const vendorNames = allVendors.map((v) => v.name);
  const idByName = new Map(allVendors.map((v) => [v.name, v.id]));
  const counts = new Map<string, number>();
  for (const f of fields) { const vn = vendorForSystem(f.source.name, vendorNames); if (vn) counts.set(vn, (counts.get(vn) ?? 0) + 1); }
  const linkedSet = new Set(rows.map((r) => r.vendorId));
  const suggested: ProcSuggestion[] = [...counts.entries()].map(([name, count]) => ({ vendorId: idByName.get(name)!, name, count })).filter((s) => s.vendorId && !linkedSet.has(s.vendorId)).sort((a, b) => b.count - a.count);

  return { segmentId: seg.id, mode: (seg.processorMode as PurposeProcessorsView["mode"]) ?? "unanswered", noProcessorBy: seg.noProcessorBy, noProcessorAt: seg.noProcessorAt?.toISOString() ?? null, rows, suggested };
}

export interface VendorOption { id: string; name: string; country: string; contract: "on_file" | "none" | "expired"; risk: string }
export async function getVendorOptions(): Promise<VendorOption[]> {
  const vendors = await db.dataProcessor.findMany({ orderBy: { name: "asc" } });
  return vendors.map((v) => ({ id: v.id, name: v.name, country: v.jurisdiction ?? "—", contract: contractOf(v), risk: v.riskClassification ?? "unrated" }));
}
