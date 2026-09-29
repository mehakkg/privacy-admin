import Link from "next/link";
import { AlertTriangle, PanelRightOpen, X } from "lucide-react";
import { Pill, type PillTone } from "@/components/ui";
import { PolicyFilters } from "@/components/masking/PolicyFilters";
import { getInventory, getCoverage, type InventoryRow } from "@/lib/engines/masking";
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

/** SCREEN — Protection rules › By field. The complete inventory of every field and
 *  its effective rule; row click / Open details opens the resolver drawer. */
export async function ByFieldTab({ sp }: { sp: ByFieldSP }) {
  const rows = await getInventory();
  const coverage = getCoverage(rows);

  let filtered = rows;
  if (sp.q) { const n = sp.q.toLowerCase(); filtered = filtered.filter((r) => r.code.toLowerCase().includes(n) || r.name.toLowerCase().includes(n)); }
  if (sp.family) filtered = filtered.filter((r) => r.effective?.family === sp.family || r.channels.some((c) => c.family === sp.family));
  if (sp.governedBy) filtered = filtered.filter((r) => matchGoverned(r, sp.governedBy!));
  if (sp.sensitivity) filtered = filtered.filter((r) => r.sensitivity === sp.sensitivity);
  if (sp.status === "active") filtered = filtered.filter((r) => r.status === "resolved" && !r.pendingChangeId);
  if (sp.status === "norule" || sp.status === "attention") filtered = filtered.filter((r) => r.winningSource === "attention");
  if (sp.status === "pending") filtered = filtered.filter((r) => r.pendingChangeId);
  if (sp.status === "exceptions") filtered = filtered.filter((r) => r.exceptions.length > 0);

  filtered = [...filtered].sort((a, b) => {
    const rank = (r: InventoryRow) => (r.winningSource === "attention" ? 0 : r.pendingChangeId ? 1 : 2);
    return rank(a) - rank(b) || a.code.localeCompare(b.code);
  });

  const page = Math.max(1, Number(sp.page) || 1);
  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));

  const qs = (patch: ByFieldSP) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, tab: "by-field", ...patch })) if (v) next.set(k, String(v));
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

  if (rows.length === 0) {
    return (
      <div className="empty-hero">
        <h2>Add your first field rule</h2>
        <p className="cell-sub">Fields you add here are checked against your DPDP and RBI templates as you type.</p>
        <Link href={qs({ add: "1" })} className="btn primary">Add field</Link>
      </div>
    );
  }

  return (
    <>
      <div className="mask-coverage">
        <Link href={qs({ governedBy: undefined, status: undefined, sensitivity: undefined, family: undefined, q: undefined, page: undefined })} className="mask-tile"><div className="mask-tile-label">Fields</div><div className="mask-tile-value">{coverage.total}</div></Link>
        <div className="mask-tile mask-tile-split">
          <div className="mask-tile-label">Baseline · regional · tenant</div>
          <div className="mask-tile-value">
            <Link href={qs({ governedBy: "baseline", page: undefined })}>{coverage.baseline}</Link> · <Link href={qs({ governedBy: "regional", page: undefined })}>{coverage.regional}</Link> · <Link href={qs({ governedBy: "tenant", page: undefined })}>{coverage.tenant}</Link>
          </div>
        </div>
        <Link href={qs({ status: "attention", page: undefined })} className={`mask-tile${coverage.attention > 0 ? " warn" : ""}`}><div className="mask-tile-label">Needs attention</div><div className="mask-tile-value">{coverage.attention}</div></Link>
        <Link href={`${BASE}?tab=pending`} className="mask-tile"><div className="mask-tile-label">Pending DPO approval</div><div className="mask-tile-value">{coverage.pending}</div></Link>
      </div>

      <PolicyFilters current={sp as Record<string, string | undefined>} basePath={BASE} />
      {activeFilters.length > 0 && (
        <div className="row" style={{ gap: 6, margin: "10px 0", flexWrap: "wrap", alignItems: "center" }}>
          {activeFilters.map((f) => <Link key={f.key} href={chipHref(f.key)} className="filter-chip">{f.label} <X size={11} /></Link>)}
          <Link href={qs({ q: undefined, family: undefined, governedBy: undefined, sensitivity: undefined, channel: undefined, status: undefined })} className="link-btn">Clear all</Link>
        </div>
      )}

      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="dtable">
          <thead><tr>
            <th>Field</th><th>Sensitivity</th><th>Effective rule{sp.channel ? ` · ${CHANNEL_LABEL[sp.channel]}` : ""}</th><th>Preview</th><th>Governed by</th><th>Channels</th><th>Last change</th><th style={{ width: 120 }} />
          </tr></thead>
          <tbody>
            {pageRows.map((r) => {
              const chan = sp.channel ? r.channels.find((c) => c.channel === sp.channel) : null;
              const effLabel = chan ? chan.label : r.effective?.label;
              const effPreview = chan ? chan.preview : r.effective?.preview;
              const masked = effPreview ? effPreview.split(" → ")[1] ?? effPreview : null;
              const active = sp.field?.toUpperCase() === r.code;
              return (
                <tr key={r.code} className={active ? "row-active" : ""}>
                  <td><Link href={qs({ field: r.code })} className="plain-link"><div className="cell-stack"><span className="cell-primary mono">{r.code}</span><span className="cell-sub">{r.name}</span></div></Link></td>
                  <td><Pill tone={r.sensitivity === "Sensitive" ? "red" : r.sensitivity === "Personal" ? "yellow" : "gray"} dot={false}>{r.sensitivity}</Pill></td>
                  <td>{effLabel ? effLabel : <span className="row" style={{ gap: 4, color: "var(--red)" }}><AlertTriangle size={13} /> {r.status === "ambiguous" ? "Ambiguous" : "No rule"}</span>}</td>
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
                  <td><Link href={qs({ field: r.code })} className="row-link" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><PanelRightOpen size={14} /> Open details</Link></td>
                </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr><td colSpan={8}><div className="empty">No fields match these filters. <Link href={qs({ q: undefined, family: undefined, governedBy: undefined, sensitivity: undefined, channel: undefined, status: undefined })} className="row-link">Clear filters</Link></div></td></tr>
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
  );
}
