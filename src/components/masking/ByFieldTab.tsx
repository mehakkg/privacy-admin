import Link from "next/link";
import { CheckCircle2, X } from "lucide-react";
import { type PillTone } from "@/components/ui";
import { PolicyFilters } from "@/components/masking/PolicyFilters";
import { FieldInventory, type InventoryRowView } from "@/components/masking/FieldInventory";
import type { CatalogField } from "@/components/masking/CreateRuleModal";
import { TemplateSwitcher } from "@/components/masking/TemplateSwitcher";
import { getInventory, getCoverage, getTemplates, type InventoryRow } from "@/lib/engines/masking";
import { CHANNEL_LABEL, FAMILY_LABEL, formatRelative } from "@/lib/masking";

const GOVERNED_TONE: Record<string, PillTone> = { baseline: "red", regional: "gray", tenant: "purple" };
const PER_PAGE = 25;
const BASE = "/data-flow/protection-rules";

export type ByFieldSP = { tab?: string; q?: string; family?: string; governedBy?: string; sensitivity?: string; channel?: string; status?: string; field?: string; add?: string; created?: string; page?: string };

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

  filtered = [...filtered].sort((a, b) => {
    const rank = (r: InventoryRow) => (r.needsAttention ? 0 : 1);
    return rank(a) - rank(b) || a.code.localeCompare(b.code);
  });

  const page = Math.max(1, Number(sp.page) || 1);
  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));

  const qs = (patch: ByFieldSP) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, tab: "by-field", ...patch })) if (v) next.set(k, String(v));
    return `${BASE}?${next.toString()}`;
  };
  const chipHref = (key: keyof ByFieldSP) => qs({ [key]: undefined, page: undefined } as ByFieldSP);
  const activeFilters: { key: keyof ByFieldSP; label: string }[] = [];
  if (sp.q) activeFilters.push({ key: "q", label: `“${sp.q}”` });
  if (sp.family) activeFilters.push({ key: "family", label: FAMILY_LABEL[sp.family] ?? sp.family });
  if (sp.governedBy) activeFilters.push({ key: "governedBy", label: `Governed by: ${sp.governedBy === "baseline" ? "Baseline" : sp.governedBy === "regional" ? "Regional" : sp.governedBy === "tenant" ? "Tenant" : sp.governedBy}` });
  if (sp.sensitivity) activeFilters.push({ key: "sensitivity", label: sp.sensitivity });
  if (sp.channel) activeFilters.push({ key: "channel", label: `Channel: ${CHANNEL_LABEL[sp.channel] ?? sp.channel}` });
  if (sp.status) activeFilters.push({ key: "status", label: `Status: ${sp.status}` });

  const chan = sp.channel;
  const rowsView: InventoryRowView[] = pageRows.map((r) => {
    const c = chan ? r.channels.find((x) => x.channel === chan) : null;
    const effLabel = c ? c.label : r.effective?.label ?? null;
    const prev = c ? c.preview : r.effective?.preview ?? null;
    return {
      code: r.code, name: r.name, sensitivity: r.sensitivity,
      effLabel, masked: prev ? prev.split(" → ")[1] ?? prev : null,
      governedBadge: r.governedBy?.badge ?? null, governedTone: r.governedBy ? GOVERNED_TONE[r.governedBy.layer] : "gray",
      pending: !!r.pendingChangeId, stricter: !!r.governedBy?.stricter, overrides: r.overrideCount,
      lastChange: r.lastChange ? `${r.lastChange.actor} · ${formatRelative(r.lastChange.at)}` : "—",
      attention: r.needsAttention, ambiguous: r.status === "ambiguous",
      href: qs({ field: r.code }),
    };
  });
  const catalog: CatalogField[] = rows.map((r) => ({ code: r.code, name: r.name, sensitivity: r.sensitivity, source: r.governedBy?.badge ?? (r.status === "ambiguous" ? "Ambiguous" : "No rule"), systemRegulated: !!r.governedBy?.systemRegulated, sampleValue: r.sampleValue }));

  return (
    <>
      <TemplateSwitcher templates={templates} />

      {/* Attention summary — a prompt, not the default filter. */}
      {attn.total > 0 ? (
        <div className="mask-attn">
          <strong>{attn.total} field{attn.total === 1 ? "" : "s"} need attention</strong>
          <span className="mask-attn-chips">
            {attn.noRule > 0 && <Link href={qs({ status: "norule", page: undefined })} className="filter-chip">{attn.noRule} no rule</Link>}
            {attn.ambiguous > 0 && <Link href={qs({ status: "ambiguous", page: undefined })} className="filter-chip">{attn.ambiguous} ambiguous</Link>}
            {attn.diverged > 0 && <Link href={qs({ status: "diverged", page: undefined })} className="filter-chip">{attn.diverged} diverged</Link>}
            {attn.pending > 0 && <Link href={qs({ status: "pending", page: undefined })} className="filter-chip">{attn.pending} pending</Link>}
          </span>
          <Link href={qs({ status: "all", page: undefined })} className="link-btn" style={{ marginLeft: "auto" }}>Show all fields</Link>
        </div>
      ) : (
        <div className="mask-attn ok"><CheckCircle2 size={16} style={{ color: "var(--green)" }} /> <strong>All fields covered</strong> — every field resolves to a rule, nothing pending or diverged.</div>
      )}

      {/* Reconciling tiles: each field counted once by winning source. */}
      <div className="mask-coverage">
        <Link href={qs({ status: "all", page: undefined, governedBy: undefined, sensitivity: undefined, family: undefined, q: undefined })} className="mask-tile"><div className="mask-tile-label">Fields</div><div className="mask-tile-value">{coverage.total}</div></Link>
        <div className="mask-tile mask-tile-split">
          <div className="mask-tile-label">Baseline · regional · tenant</div>
          <div className="mask-tile-value"><Link href={qs({ status: "all", governedBy: "baseline", page: undefined })}>{coverage.baseline}</Link> · <Link href={qs({ status: "all", governedBy: "regional", page: undefined })}>{coverage.regional}</Link> · <Link href={qs({ status: "all", governedBy: "tenant", page: undefined })}>{coverage.tenant}</Link></div>
        </div>
        <Link href={qs({ status: "attention", page: undefined })} className={`mask-tile${coverage.attention > 0 ? " warn" : ""}`}><div className="mask-tile-label">Unresolved (no rule · ambiguous)</div><div className="mask-tile-value">{coverage.attention}</div></Link>
        <Link href={`${BASE}?tab=pending`} className="mask-tile"><div className="mask-tile-label">Pending DPO approval</div><div className="mask-tile-value">{coverage.pending}</div></Link>
      </div>

      <PolicyFilters current={sp as Record<string, string | undefined>} basePath={BASE} />
      {activeFilters.length > 0 && (
        <div className="row" style={{ gap: 6, margin: "10px 0", flexWrap: "wrap", alignItems: "center" }}>
          {activeFilters.map((f) => <Link key={f.key} href={chipHref(f.key)} className="filter-chip">{f.label} <X size={11} /></Link>)}
          <Link href={qs({ status: "all", q: undefined, family: undefined, governedBy: undefined, sensitivity: undefined, channel: undefined })} className="link-btn">Clear all</Link>
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
