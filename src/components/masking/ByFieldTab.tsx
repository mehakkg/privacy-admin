import Link from "next/link";
import { X } from "lucide-react";
import { PolicyFilters } from "@/components/masking/PolicyFilters";
import { FieldInventory, type InventoryRowView } from "@/components/masking/FieldInventory";
import type { CatalogField } from "@/components/masking/CreateRuleModal";
import { TemplateSwitcher } from "@/components/masking/TemplateSwitcher";
import { getInventory, getCoverage, getTemplates, type InventoryRow } from "@/lib/engines/masking";
import { CHANNEL_LABEL, FAMILY_LABEL, formatRelative } from "@/lib/masking";

const PER_PAGE = 25;
const BASE = "/data-flow/protection-rules";

export type ByFieldSP = { q?: string; family?: string; governedBy?: string; sensitivity?: string; channel?: string; status?: string; group?: string; field?: string; add?: string; created?: string; page?: string };

function matchGoverned(row: InventoryRow, gb: string): boolean {
  if (gb === "baseline" || gb === "regional" || gb === "tenant") return row.winningSource === gb;
  if (gb === "DPDP" || gb === "RBI") return row.governedBy?.layer === "regional" && row.governedBy?.source === gb;
  return true;
}

/**
 * SCREEN 1 — Protection rules › By field, gap-first. The default view surfaces
 * fields that need attention (no rule · ambiguous · diverged · pending); the
 * "Fields" tile shows everything. Selection + the sticky bar start rule creation.
 */
export async function ByFieldTab({ sp }: { sp: ByFieldSP }) {
  const [rows, templates] = await Promise.all([getInventory(), getTemplates()]);
  const coverage = getCoverage(rows);
  const attn = {
    total: rows.filter((r) => r.needsAttention).length,
    noRule: rows.filter((r) => r.status === "no_rule").length,
    ambiguous: rows.filter((r) => r.status === "ambiguous").length,
    diverged: rows.filter((r) => r.diverged).length,
    pending: rows.filter((r) => r.pendingChangeId).length,
  };

  let filtered = rows;
  // Default shows the full applied-rules list (BASELINE + any associated templates);
  // "needs attention" is an explicit filter, not the default.
  if (sp.status === "attention") filtered = filtered.filter((r) => r.needsAttention);
  if (sp.status === "norule") filtered = filtered.filter((r) => r.status === "no_rule");
  if (sp.status === "ambiguous") filtered = filtered.filter((r) => r.status === "ambiguous");
  if (sp.status === "diverged") filtered = filtered.filter((r) => r.diverged);
  if (sp.status === "pending") filtered = filtered.filter((r) => r.pendingChangeId);
  if (sp.status === "active") filtered = filtered.filter((r) => r.status === "resolved" && !r.needsAttention);
  if (sp.status === "exceptions") filtered = filtered.filter((r) => r.exceptions.length > 0);
  if (sp.q) { const n = sp.q.toLowerCase(); filtered = filtered.filter((r) => r.code.toLowerCase().includes(n) || r.name.toLowerCase().includes(n)); }
  if (sp.family) filtered = filtered.filter((r) => r.effective?.family === sp.family || r.channels.some((c) => c.family === sp.family));
  if (sp.governedBy) filtered = filtered.filter((r) => matchGoverned(r, sp.governedBy!));
  if (sp.sensitivity) filtered = filtered.filter((r) => r.sensitivity === sp.sensitivity);
  if (sp.group) filtered = filtered.filter((r) => r.group === sp.group);

  filtered = [...filtered].sort((a, b) => {
    const rank = (r: InventoryRow) => (r.needsAttention ? 0 : 1);
    return rank(a) - rank(b) || a.code.localeCompare(b.code);
  });

  const page = Math.max(1, Number(sp.page) || 1);
  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));

  const qs = (patch: ByFieldSP) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) next.set(k, String(v));
    const s = next.toString();
    return s ? `${BASE}?${s}` : BASE;
  };
  const chipHref = (key: keyof ByFieldSP) => qs({ [key]: undefined, page: undefined } as ByFieldSP);
  const activeFilters: { key: keyof ByFieldSP; label: string }[] = [];
  if (sp.q) activeFilters.push({ key: "q", label: `“${sp.q}”` });
  if (sp.family) activeFilters.push({ key: "family", label: FAMILY_LABEL[sp.family] ?? sp.family });
  if (sp.governedBy) activeFilters.push({ key: "governedBy", label: `Governed by: ${sp.governedBy === "baseline" ? "Baseline" : sp.governedBy === "regional" ? "Regional" : sp.governedBy === "tenant" ? "Tenant" : sp.governedBy}` });
  if (sp.sensitivity) activeFilters.push({ key: "sensitivity", label: sp.sensitivity });
  if (sp.channel) activeFilters.push({ key: "channel", label: `Channel: ${CHANNEL_LABEL[sp.channel] ?? sp.channel}` });
  if (sp.status) activeFilters.push({ key: "status", label: `Status: ${sp.status}` });
  if (sp.group) activeFilters.push({ key: "group", label: `Group: ${sp.group}` });

  const chan = sp.channel;
  const rowsView: InventoryRowView[] = pageRows.map((r) => {
    const c = chan ? r.channels.find((x) => x.channel === chan) : null;
    const effLabel = c ? c.label : r.effective?.label ?? null;
    const prev = c ? c.preview : r.effective?.preview ?? null;
    return {
      code: r.code, name: r.name, sensitivity: r.sensitivity,
      effLabel, masked: prev ? prev.split(" → ")[1] ?? prev : null,
      governedBadge: r.governedBy?.badge ?? null,
      governedLayer: r.governedBy?.layer ?? null,
      systemRegulated: !!r.governedBy?.systemRegulated,
      selfLocked: r.governedBy?.treatment === "self",
      pending: !!r.pendingChangeId, stricter: !!r.governedBy?.stricter, overrides: r.overrideCount,
      group: r.group ?? null,
      groupHref: r.group ? qs({ group: r.group, field: undefined, status: undefined, page: undefined }) : null,
      lastChange: r.lastChange ? `${r.lastChange.actor} · ${formatRelative(r.lastChange.at)}` : "—",
      attention: r.needsAttention, ambiguous: r.status === "ambiguous",
      href: qs({ field: r.code }),
    };
  });
  const catalog: CatalogField[] = rows.map((r) => ({ code: r.code, name: r.name, sensitivity: r.sensitivity, source: r.governedBy?.badge ?? (r.status === "ambiguous" ? "Ambiguous" : "No rule"), systemRegulated: !!r.governedBy?.systemRegulated, sampleValue: r.sampleValue }));

  return (
    <>
      <TemplateSwitcher templates={templates} />

      {/* Compact hairline stat strip — reconciled (b·r·t·attention sums to Fields). */}
      <div className="mask-statstrip">
        <Link href={qs({ status: undefined, governedBy: undefined, sensitivity: undefined, family: undefined, q: undefined, page: undefined })} className="stat-seg"><b>{coverage.total}</b> Fields</Link>
        <Link href={qs({ governedBy: "baseline", page: undefined })} className="stat-seg"><b>{coverage.baseline}</b> baseline</Link>
        <Link href={qs({ governedBy: "regional", page: undefined })} className="stat-seg"><b>{coverage.regional}</b> regional</Link>
        <Link href={qs({ governedBy: "tenant", page: undefined })} className="stat-seg"><b>{coverage.tenant}</b> tenant</Link>
        <Link href={qs({ status: "attention", page: undefined })} className={`stat-seg${attn.total > 0 ? " warn" : ""}`}><b>{attn.total}</b> need attention</Link>
        <Link href={qs({ status: "pending", page: undefined })} className="stat-seg"><b>{coverage.pending}</b> pending</Link>
      </div>

      <PolicyFilters current={sp as Record<string, string | undefined>} basePath={BASE} />
      {activeFilters.length > 0 && (
        <div className="row" style={{ gap: 6, margin: "10px 0", flexWrap: "wrap", alignItems: "center" }}>
          {activeFilters.map((f) => <Link key={f.key} href={chipHref(f.key)} className="filter-chip">{f.label} <X size={11} /></Link>)}
          <Link href={BASE} className="link-btn">Clear all</Link>
        </div>
      )}

      <FieldInventory rows={rowsView} catalog={catalog} channelLabel={sp.channel ? CHANNEL_LABEL[sp.channel] ?? null : null} />

      {totalPages > 1 && (
        <div className="row" style={{ gap: 8, marginTop: 12, justifyContent: "flex-end", alignItems: "center" }}>
          {page > 1 && <Link className="btn ghost sm" href={qs({ page: String(page - 1) })}>Previous</Link>}
          <span className="cell-sub">Page {page} of {totalPages}</span>
          {page < totalPages && <Link className="btn ghost sm" href={qs({ page: String(page + 1) })}>Next</Link>}
        </div>
      )}
    </>
  );
}
