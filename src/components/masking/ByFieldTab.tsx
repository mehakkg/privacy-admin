import Link from "next/link";
import { X } from "lucide-react";
import { PolicyFilters } from "@/components/masking/PolicyFilters";
import { FieldInventory, type InventoryRowView } from "@/components/masking/FieldInventory";
import type { CatalogField } from "@/components/masking/CreateRuleModal";
import { NewRuleButton } from "@/components/masking/NewRuleButton";
import { RuleTemplates } from "@/components/masking/TemplateSwitcher";
import { getInventory, getCoverage, getTemplates, getCustomTemplates, type InventoryRow } from "@/lib/engines/masking";
import { FAMILY_LABEL, formatRelative } from "@/lib/masking";

const PER_PAGE = 12;
const BASE = "/data-flow/protection-rules";

export type ByFieldSP = { q?: string; family?: string; governedBy?: string; sensitivity?: string; channel?: string; role?: string; owner?: string; status?: string; group?: string; field?: string; add?: string; created?: string; page?: string };

function matchGoverned(row: InventoryRow, gb: string): boolean {
  if (gb.startsWith("custom:")) return row.templateKey === gb.slice(7);
  if (gb === "baseline" || gb === "regional" || gb === "tenant") return row.winningSource === gb;
  if (gb === "DPDP" || gb === "RBI") return row.governedBy?.layer === "regional" && row.governedBy?.source === gb;
  return true;
}

/**
 * PROTECTION RULES › Rules table. Boxed stat tiles, a Rule-templates card, then
 * the Rules card: header + filter row + table + footer. Default is gap-first
 * (Needs attention); the Total tile opens the full list.
 */
export async function ByFieldTab({ sp }: { sp: ByFieldSP }) {
  const [rows, templates, customTemplates] = await Promise.all([getInventory(), getTemplates(), getCustomTemplates()]);
  const coverage = getCoverage(rows);
  const weekAgo = Date.now() - 7 * 86400000;
  const changedThisWeek = rows.filter((r) => r.lastChange && r.lastChange.at.getTime() > weekAgo).length;

  let filtered = rows;
  // GAP-FIRST LANDING: with no explicit Status, default to "Needs attention".
  const effectiveStatus = sp.status ?? "attention";
  if (effectiveStatus === "attention") filtered = filtered.filter((r) => r.needsAttention);
  if (sp.status === "norule") filtered = filtered.filter((r) => r.status === "no_rule");
  if (sp.status === "ambiguous") filtered = filtered.filter((r) => r.status === "ambiguous");
  if (sp.status === "diverged") filtered = filtered.filter((r) => r.diverged);
  if (sp.status === "pending") filtered = filtered.filter((r) => r.pendingChangeId);
  if (sp.status === "active") filtered = filtered.filter((r) => r.status === "resolved" && !r.needsAttention);
  if (sp.status === "exceptions") filtered = filtered.filter((r) => r.exceptions.length > 0);
  if (sp.q) { const n = sp.q.toLowerCase(); filtered = filtered.filter((r) => r.code.toLowerCase().includes(n) || r.name.toLowerCase().includes(n) || (r.dataElementRef ?? "").toLowerCase().includes(n)); }
  if (sp.family) filtered = filtered.filter((r) => r.effective?.family === sp.family);
  if (sp.governedBy) filtered = filtered.filter((r) => matchGoverned(r, sp.governedBy!));
  if (sp.sensitivity) filtered = filtered.filter((r) => r.sensitivity === sp.sensitivity);
  if (sp.channel) filtered = filtered.filter((r) => r.primaryChannel === sp.channel);
  if (sp.role) filtered = filtered.filter((r) => r.primaryRole === sp.role);
  if (sp.owner === "me") filtered = filtered.filter((r) => r.winningSource === "tenant");
  if (sp.group) filtered = filtered.filter((r) => r.group === sp.group);

  filtered = [...filtered].sort((a, b) => {
    const rank = (r: InventoryRow) => (r.needsAttention ? 0 : 1);
    return rank(a) - rank(b) || a.code.localeCompare(b.code);
  });

  const page = Math.max(1, Number(sp.page) || 1);
  const start = (page - 1) * PER_PAGE;
  const pageRows = filtered.slice(start, start + PER_PAGE);
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
  if (sp.governedBy) activeFilters.push({ key: "governedBy", label: `Governed by: ${sp.governedBy.startsWith("custom:") ? sp.governedBy.slice(7) : sp.governedBy === "baseline" ? "Baseline" : sp.governedBy === "regional" ? "Regional" : sp.governedBy === "tenant" ? "Tenant" : sp.governedBy}` });
  if (sp.sensitivity) activeFilters.push({ key: "sensitivity", label: sp.sensitivity });
  if (sp.channel) activeFilters.push({ key: "channel", label: `Channel: ${sp.channel}` });
  if (sp.role) activeFilters.push({ key: "role", label: `Role: ${sp.role}` });
  if (sp.owner === "me") activeFilters.push({ key: "owner", label: "Owned by me" });
  if (sp.status && sp.status !== "all") activeFilters.push({ key: "status", label: `Status: ${sp.status}` });
  if (sp.group) activeFilters.push({ key: "group", label: `Group: ${sp.group}` });

  const rowsView: InventoryRowView[] = pageRows.map((r) => {
    const prev = r.effective?.preview ?? null;
    return {
      code: r.code, name: r.name, path: r.dataElementRef ?? r.name, sensitivity: r.sensitivity,
      effLabel: r.effective?.label ?? null, masked: prev ? prev.split(" → ")[1] ?? prev : null,
      governedBadge: r.governedBy?.badge ?? null,
      governedLayer: r.governedBy?.layer ?? null,
      systemRegulated: !!r.governedBy?.systemRegulated,
      selfLocked: r.governedBy?.treatment === "self",
      coveredSub: r.ownerTeam, channel: r.primaryChannel, roleTag: r.primaryRole,
      pending: !!r.pendingChangeId, stricter: !!r.governedBy?.stricter, overrides: r.overrideCount,
      group: r.group ?? null,
      groupHref: r.group ? qs({ group: r.group, field: undefined, status: undefined, page: undefined }) : null,
      lastChange: r.lastChange ? `${r.lastChange.actor} · ${formatRelative(r.lastChange.at)}` : "—",
      attention: r.needsAttention, ambiguous: r.status === "ambiguous",
      href: qs({ field: r.code }),
    };
  });
  const catalog: CatalogField[] = rows.map((r) => ({ code: r.code, name: r.name, sensitivity: r.sensitivity, source: r.governedBy?.badge ?? (r.status === "ambiguous" ? "Ambiguous" : "No rule"), systemRegulated: !!r.governedBy?.systemRegulated, sampleValue: r.sampleValue }));
  const protectedFields = rows.filter((r) => r.status === "resolved").length;

  const tiles: { n: number; label: string; href?: string; warn?: boolean }[] = [
    { n: coverage.total, label: "Total rules", href: qs({ status: "all", governedBy: undefined, sensitivity: undefined, family: undefined, channel: undefined, role: undefined, owner: undefined, q: undefined, page: undefined }) },
    { n: coverage.baseline, label: "Baseline", href: qs({ governedBy: "baseline", status: "all", page: undefined }) },
    { n: coverage.regional, label: "Regional", href: qs({ governedBy: "regional", status: "all", page: undefined }) },
    { n: coverage.tenant, label: "Team-owned", href: qs({ governedBy: "tenant", status: "all", page: undefined }) },
    { n: coverage.attention, label: "Need attention", href: qs({ status: "attention", page: undefined }), warn: coverage.attention > 0 },
    { n: coverage.pending, label: "Pending", href: qs({ status: "pending", page: undefined }) },
    { n: changedThisWeek, label: "Changed this week" },
  ];

  return (
    <>
      <RuleTemplates templates={templates} customTemplates={customTemplates} />

      <div className="mask-tiles">
        {tiles.map((t) => {
          const inner = <><span className="tile-n">{t.n}</span><span className="tile-label">{t.label}</span></>;
          return t.href
            ? <Link key={t.label} href={t.href} className={`mask-tile${t.warn ? " warn" : ""}`}>{inner}</Link>
            : <div key={t.label} className="mask-tile">{inner}</div>;
        })}
      </div>

      <section className="rules-card">
        <div className="rules-card-head">
          <div className="stack" style={{ gap: 2 }}>
            <h3 className="rules-card-title">Rules</h3>
            <span className="cell-sub">{coverage.total} rules across {protectedFields} protected fields</span>
          </div>
          <NewRuleButton catalog={catalog} />
        </div>

        <div className="rules-card-filters">
          <PolicyFilters current={sp as Record<string, string | undefined>} basePath={BASE} customTemplates={customTemplates.map((t) => ({ key: t.key, name: t.name }))} resultCount={`${filtered.length} of ${coverage.total} rules`} />
          {activeFilters.length > 0 && (
            <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
              {activeFilters.map((f) => <Link key={f.key} href={chipHref(f.key)} className="filter-chip">{f.label} <X size={11} /></Link>)}
              <Link href={BASE} className="link-btn">Clear all</Link>
            </div>
          )}
        </div>

        <FieldInventory rows={rowsView} catalog={catalog} />

        <div className="rules-card-foot">
          <span className="cell-sub">Showing {filtered.length === 0 ? 0 : start + 1}–{Math.min(start + PER_PAGE, filtered.length)} of {filtered.length}</span>
          {totalPages > 1 && (
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              {page > 1 ? <Link className="btn ghost sm" href={qs({ page: String(page - 1) })}>‹</Link> : <span className="btn ghost sm disabled">‹</span>}
              <span className="page-num">{page}</span>
              {page < totalPages ? <Link className="btn ghost sm" href={qs({ page: String(page + 1) })}>›</Link> : <span className="btn ghost sm disabled">›</span>}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
