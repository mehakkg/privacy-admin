import Link from "next/link";
import { Plus, AlertTriangle, Eye, X } from "lucide-react";
import { Shell } from "@/components/Shell";
import { PageHead, Pill, type PillTone } from "@/components/ui";
import { EnforcementNotice } from "@/components/masking/EnforcementNotice";
import { PolicyFilters } from "@/components/masking/PolicyFilters";
import { FieldDrawer } from "@/components/masking/FieldDrawer";
import { AddFieldDrawer } from "@/components/masking/AddFieldDrawer";
import { getInventory, getCoverage, resolveField, getPendingChange, fieldHistory, type InventoryRow } from "@/lib/engines/masking";
import { getCurrentRole } from "@/lib/session";
import { CHANNEL_LABEL, FAMILY_LABEL, formatRelative } from "@/lib/masking";
import { formatDateTime } from "@/components/ui";

export const dynamic = "force-dynamic";

const GOVERNED_TONE: Record<string, PillTone> = { baseline: "red", regional: "gray", tenant: "purple" };
const PER_PAGE = 25;

type SP = { q?: string; family?: string; governedBy?: string; sensitivity?: string; channel?: string; status?: string; field?: string; add?: string; created?: string; page?: string };

function matchGoverned(row: InventoryRow, gb: string): boolean {
  const g = row.governedBy;
  if (!g) return false;
  if (gb === "baseline") return g.layer === "baseline";
  if (gb === "tenant") return g.layer === "tenant";
  if (gb === "regional") return g.layer === "regional";
  if (gb === "DPDP" || gb === "RBI") return g.layer === "regional" && g.source === gb;
  return true;
}

export default async function MaskingPolicyPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const role = await getCurrentRole();
  const rows = await getInventory();
  const coverage = await getCoverage(rows);

  // Filters (channel is a display modifier, not a row filter).
  let filtered = rows;
  if (sp.q) { const n = sp.q.toLowerCase(); filtered = filtered.filter((r) => r.code.toLowerCase().includes(n) || r.name.toLowerCase().includes(n)); }
  if (sp.family) filtered = filtered.filter((r) => r.effective?.family === sp.family || r.channels.some((c) => c.family === sp.family));
  if (sp.governedBy) filtered = filtered.filter((r) => matchGoverned(r, sp.governedBy!));
  if (sp.sensitivity) filtered = filtered.filter((r) => r.sensitivity === sp.sensitivity);
  if (sp.status === "active") filtered = filtered.filter((r) => r.hasRule && !r.pendingChangeId);
  if (sp.status === "norule") filtered = filtered.filter((r) => !r.hasRule);
  if (sp.status === "pending") filtered = filtered.filter((r) => r.pendingChangeId);
  if (sp.status === "exceptions") filtered = filtered.filter((r) => r.exceptions.length > 0);

  // Sort: No rule first, then pending, then alpha.
  filtered = [...filtered].sort((a, b) => {
    const rank = (r: InventoryRow) => (!r.hasRule ? 0 : r.pendingChangeId ? 1 : 2);
    return rank(a) - rank(b) || a.code.localeCompare(b.code);
  });

  const page = Math.max(1, Number(sp.page) || 1);
  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));

  const qs = (patch: SP) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) next.set(k, String(v));
    const s = next.toString();
    return s ? `/masking?${s}` : "/masking";
  };
  const chipHref = (key: keyof SP) => qs({ [key]: undefined, page: undefined } as SP);
  const activeFilters: { key: keyof SP; label: string }[] = [];
  if (sp.q) activeFilters.push({ key: "q", label: `“${sp.q}”` });
  if (sp.family) activeFilters.push({ key: "family", label: FAMILY_LABEL[sp.family] ?? sp.family });
  if (sp.governedBy) activeFilters.push({ key: "governedBy", label: `Governed: ${sp.governedBy}` });
  if (sp.sensitivity) activeFilters.push({ key: "sensitivity", label: sp.sensitivity });
  if (sp.channel) activeFilters.push({ key: "channel", label: `Channel: ${CHANNEL_LABEL[sp.channel] ?? sp.channel}` });
  if (sp.status) activeFilters.push({ key: "status", label: `Status: ${sp.status}` });

  const emptyTenant = rows.length === 0;

  // Drawer data
  const drawerCode = sp.field?.toUpperCase();
  const res = drawerCode ? await resolveField(drawerCode) : null;
  const pendingRaw = res ? await getPendingChange(res.code) : null;
  const pending = pendingRaw ? { ...pendingRaw, proposedAt: formatDateTime(pendingRaw.proposedAt) } : null;
  const historyRows = res ? await fieldHistory(res.code) : [];
  const floor = res && res.chain.length > 1 ? { family: res.chain[1].family, params: res.chain[1].params } : null;
  const floorName = res && res.chain.length > 1 ? `${res.chain[1].layer === "regional" ? `${res.chain[1].source} template` : "Baseline"} floor` : null;
  const closeHref = qs({ field: undefined, add: undefined, created: undefined });

  return (
    <Shell active="/masking" title="Masking policy">
      <PageHead
        title="Masking policy"
        subtitle="Every field, its effective rule, and who governs it."
        actions={<Link href={qs({ add: "1" })} className="btn primary"><Plus size={15} /> Add field</Link>}
      />
      <EnforcementNotice />

      {sp.created && res && (
        <div className="notice ok" style={{ marginBottom: 12 }}><div className="notice-title">{res.code} created</div></div>
      )}

      {emptyTenant ? (
        <div className="empty-hero">
          <h2>Add your first masking field</h2>
          <p className="cell-sub">Fields you add here are checked against your DPDP and RBI templates as you type.</p>
          <Link href={qs({ add: "1" })} className="btn primary"><Plus size={15} /> Add field</Link>
        </div>
      ) : (
        <>
          {/* Coverage strip */}
          <div className="mask-coverage">
            <Link href="/masking" className="mask-tile"><div className="mask-tile-label">Fields</div><div className="mask-tile-value">{coverage.total}</div></Link>
            <div className="mask-tile mask-tile-split">
              <div className="mask-tile-label">Baseline · regional · tenant</div>
              <div className="mask-tile-value">
                <Link href={qs({ governedBy: "baseline", page: undefined })}>{coverage.baseline}</Link> · <Link href={qs({ governedBy: "regional", page: undefined })}>{coverage.regional}</Link> · <Link href={qs({ governedBy: "tenant", page: undefined })}>{coverage.tenant}</Link>
              </div>
            </div>
            <Link href={qs({ status: "norule", page: undefined })} className={`mask-tile${coverage.noRule > 0 ? " warn" : ""}`}><div className="mask-tile-label">No rule applied</div><div className="mask-tile-value">{coverage.noRule}</div></Link>
            <Link href={qs({ status: "pending", page: undefined })} className="mask-tile"><div className="mask-tile-label">Pending DPO approval</div><div className="mask-tile-value">{coverage.pending}</div></Link>
          </div>

          <PolicyFilters current={sp as Record<string, string | undefined>} />
          {activeFilters.length > 0 && (
            <div className="row" style={{ gap: 6, margin: "10px 0", flexWrap: "wrap", alignItems: "center" }}>
              {activeFilters.map((f) => (
                <Link key={f.key} href={chipHref(f.key)} className="filter-chip">{f.label} <X size={11} /></Link>
              ))}
              <Link href="/masking" className="link-btn">Clear all</Link>
            </div>
          )}

          {/* Table */}
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="dtable">
              <thead><tr>
                <th>Field</th><th>Sensitivity</th><th>Effective rule{sp.channel ? ` · ${CHANNEL_LABEL[sp.channel]}` : ""}</th><th>Preview</th><th>Governed by</th><th>Channels</th><th>Last change</th><th style={{ width: 44 }} />
              </tr></thead>
              <tbody>
                {pageRows.map((r) => {
                  const chan = sp.channel ? r.channels.find((c) => c.channel === sp.channel) : null;
                  const effLabel = chan ? chan.label : r.effective?.label;
                  const effPreview = chan ? chan.preview : r.effective?.preview;
                  const masked = effPreview ? effPreview.split(" → ")[1] ?? effPreview : null;
                  const active = drawerCode === r.code;
                  return (
                    <tr key={r.code} className={active ? "row-active" : ""}>
                      <td><Link href={qs({ field: r.code })} className="plain-link"><div className="cell-stack"><span className="cell-primary mono">{r.code}</span><span className="cell-sub">{r.name}</span></div></Link></td>
                      <td><Pill tone={r.sensitivity === "Sensitive" ? "red" : r.sensitivity === "Personal" ? "yellow" : "gray"} dot={false}>{r.sensitivity}</Pill></td>
                      <td>{effLabel ? effLabel : <span className="row" style={{ gap: 4, color: "var(--red)" }}><AlertTriangle size={13} /> No rule</span>}</td>
                      <td className="mono cell-sub">{masked ?? "—"}</td>
                      <td>
                        {r.governedBy ? (
                          <Pill tone={r.pendingChangeId ? "yellow" : GOVERNED_TONE[r.governedBy.layer]} dot={false}>
                            {r.pendingChangeId ? `${r.governedBy.badge} · change pending` : `${r.governedBy.badge}${r.governedBy.stricter ? " · stricter" : ""}`}
                          </Pill>
                        ) : <span className="cell-sub">—</span>}
                      </td>
                      <td className="cell-sub">{r.overrideCount > 0 ? `${r.overrideCount} overrides` : "Same everywhere"}</td>
                      <td className="cell-sub">{r.lastChange ? `${r.lastChange.actor} · ${formatRelative(r.lastChange.at)}` : "—"}</td>
                      <td><Link href={qs({ field: r.code })} className="icon-btn" aria-label={`Open ${r.code}`}><Eye size={15} /></Link></td>
                    </tr>
                  );
                })}
                {pageRows.length === 0 && (
                  <tr><td colSpan={8}><div className="empty">No fields match these filters. <Link href="/masking" className="row-link">Clear filters</Link></div></td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="row" style={{ gap: 8, marginTop: 12, justifyContent: "flex-end", alignItems: "center" }}>
              {page > 1 && <Link className="btn ghost sm" href={qs({ page: String(page - 1) })}>Previous</Link>}
              <span className="cell-sub">Page {page} of {totalPages}</span>
              {page < totalPages && <Link className="btn ghost sm" href={qs({ page: String(page + 1) })}>Next</Link>}
            </div>
          )}
        </>
      )}

      {res && <FieldDrawer res={res} pending={pending} history={historyRows.map((h) => ({ seq: h.seq, action: h.action, actor: h.actorLabel, at: formatDateTime(h.timestamp) }))} role={role} closeHref={closeHref} floor={floor} floorName={floorName} />}
      {sp.add && <AddFieldDrawer closeHref={closeHref} />}
    </Shell>
  );
}
