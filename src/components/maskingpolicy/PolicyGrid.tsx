"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Lock, Plus, X, ChevronDown, ChevronRight, Eye } from "lucide-react";
import { MaskEditor } from "@/components/maskingpolicy/MaskEditor";
import {
  MASK_CHOICES, defaultParamsForChoice, renderValue, strengthOf, type Masking,
} from "@/lib/maskingpolicy";
import type { GridView } from "@/lib/engines/maskingpolicy";
import {
  setBaselineAction, setGrantAction, addAudienceAction, addChannelAction, bulkBaselineAction,
} from "@/app/actions/maskingpolicy";

type Anchor = { top: number; left: number };
type OpenCell = { code: string; audienceId: string | null; anchor: Anchor };

export function PolicyGrid({ view, highlight }: { view: GridView; highlight?: string | null }) {
  const router = useRouter();
  const vid = view.version.id;
  const [open, setOpen] = useState<OpenCell | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addAud, setAddAud] = useState(false);
  const [bulk, setBulk] = useState<null | { anchor: Anchor }>(null);
  const [, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });

  const rowByCode = (c: string) => view.rows.find((r) => r.code === c)!;
  const toggleSel = (c: string) => setSelected((s) => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const anchorOf = (e: React.MouseEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); return { top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 360) }; };

  return (
    <div className="mp-grid-wrap">
      <div className="mp-exposure">
        <Eye size={14} /> <strong>{view.exposure.more}</strong> audience{view.exposure.more === 1 ? "" : "s"} see more · <strong>{view.exposure.fullRaw}</strong> see full raw values
      </div>

      <div className="table-wrap">
        <table className="dtable mp-grid">
          <thead>
            <tr>
              <th style={{ width: 30 }} />
              <th>Field</th>
              <th>Everyone sees</th>
              {view.audiences.map((a) => <th key={a.id}>{a.label}<div className="cell-sub mono">{a.identifier}</div></th>)}
              <th style={{ width: 130 }}>{addAud ? <AddAudience vid={vid} onDone={() => { setAddAud(false); router.refresh(); }} /> : <button className="btn ghost sm" onClick={() => setAddAud(true)}><Plus size={13} /> Add audience</button>}</th>
            </tr>
          </thead>
          <tbody>
            {view.categories.map((cat) => {
              const members = view.rows.filter((r) => r.categoryId === cat.id);
              const isCollapsed = collapsed.has(cat.id);
              const allSel = members.every((m) => selected.has(m.code));
              return (
                <>
                  <tr key={cat.id} className="mp-cat-row">
                    <td><input type="checkbox" checked={allSel} onChange={() => setSelected((s) => { const n = new Set(s); members.forEach((m) => allSel ? n.delete(m.code) : n.add(m.code)); return n; })} /></td>
                    <td colSpan={2 + view.audiences.length + 1}>
                      <button className="mp-cat-toggle" onClick={() => setCollapsed((s) => { const n = new Set(s); n.has(cat.id) ? n.delete(cat.id) : n.add(cat.id); return n; })}>
                        {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                        <strong>{cat.name}</strong>
                        <span className="cell-sub">{cat.fieldCount} fields · {cat.regulatedCount} regulated{cat.changedCount ? ` · ${cat.changedCount} new` : ""}</span>
                      </button>
                      <div className="cell-sub mp-cat-def">{cat.definition}</div>
                    </td>
                  </tr>
                  {!isCollapsed && members.map((r) => (
                    <tr key={r.code} className={highlight === r.code ? "mp-row-hl" : ""} id={`mp-field-${r.code}`}>
                      <td>{r.status !== "not_used" && <input type="checkbox" checked={selected.has(r.code)} onChange={() => toggleSel(r.code)} />}</td>
                      <td>
                        <div className="cell-stack">
                          <span className="cell-primary">{r.displayName}</span>
                          <span className="cell-sub mono">{r.code}</span>
                          <span className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                            {r.regulated && <span className="mp-tag lock"><Lock size={9} /> Regulated</span>}
                            {r.origin === "your_organization" && <span className="mp-tag">Added by your organization</span>}
                            {r.isNew && <span className="mp-tag new">New from apps</span>}
                            {r.status === "not_used" && <span className="mp-tag">Not used</span>}
                            {r.status === "needs_decision" && <span className="mp-tag need">Needs a decision</span>}
                          </span>
                        </div>
                      </td>
                      {/* Everyone */}
                      <td>
                        <button className="mp-cell" onClick={(e) => setOpen({ code: r.code, audienceId: null, anchor: anchorOf(e) })}>
                          <span className="mono">{r.baseline.example}</span>
                          <span className="cell-sub">{r.baseline.choiceLabel}</span>
                        </button>
                      </td>
                      {/* Audiences */}
                      {r.audiences.map((c) => {
                        const inert = c.kind === "not_used";
                        return (
                          <td key={c.audienceId} className={inert ? "mp-inert" : ""}>
                            {c.kind === "locked" ? (
                              <span className="mp-cell locked" tabIndex={0} title="Protected by law — no one can see it in full."><Lock size={12} /> <span className="mono">{c.example}</span></span>
                            ) : inert ? <span className="cell-sub">—</span> : (
                              <button className={`mp-cell${c.kind === "same" ? " same" : ""}${c.kind === "full_raw" ? " fullraw" : ""}`} onClick={(e) => setOpen({ code: r.code, audienceId: c.audienceId, anchor: anchorOf(e) })} aria-label={`${view.audiences.find((a) => a.id === c.audienceId)?.label}, ${r.displayName}: ${c.kind === "same" ? "same as everyone" : c.choiceLabel}`}>
                                {c.kind === "same" ? <span className="cell-sub">Same</span> : <>
                                  {c.kind === "full_raw" && <Eye size={12} />}
                                  <span className="mono">{c.example}</span>
                                  {c.channelLabel && <span className="mp-chan">{c.channelLabel}</span>}
                                </>}
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td />
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {view.audiences.length === 0 && (
        <div className="mp-empty-aud">Does anyone need to see more? Add an audience like Teller or Manager. Skip this if everyone should see the same.</div>
      )}

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="mask-selbar">
          <span>{selected.size} field{selected.size === 1 ? "" : "s"} selected</span>
          <button className="link-btn" onClick={() => setSelected(new Set())}><X size={12} /> Clear</button>
          <div className="row" style={{ gap: 8, marginLeft: "auto" }}>
            <button className="btn sm" onClick={(e) => setBulk({ anchor: anchorOf(e) })}>Change what everyone sees</button>
            <button className="btn sm" onClick={() => run(async () => { await bulkBaselineAction(vid, [...selected], null, "not_used"); setSelected(new Set()); })}>Mark not used</button>
          </div>
        </div>
      )}

      {/* Popovers */}
      {open && (open.audienceId === null
        ? <BaselinePopover row={rowByCode(open.code)} vid={vid} anchor={open.anchor} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); router.refresh(); }} />
        : <AudiencePopover row={rowByCode(open.code)} vid={vid} audienceId={open.audienceId} audienceLabel={view.audiences.find((a) => a.id === open.audienceId)?.label ?? ""} channels={view.channels} anchor={open.anchor} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); router.refresh(); }} />)}

      {bulk && <BulkPopover vid={vid} codes={[...selected]} rows={view.rows} anchor={bulk.anchor} onClose={() => setBulk(null)} onSaved={() => { setBulk(null); setSelected(new Set()); router.refresh(); }} />}
    </div>
  );
}

// ---- Popover shell ----
function Popover({ anchor, title, onClose, children, width = 340 }: { anchor: Anchor; title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setMounted(true); const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }; document.addEventListener("mousedown", c); return () => document.removeEventListener("mousedown", c); }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <div ref={ref} className="mp-pop" style={{ position: "fixed", top: anchor.top, left: anchor.left, width }}>
      <div className="mp-pop-head"><strong>{title}</strong><button className="icon-btn" onClick={onClose}><X size={14} /></button></div>
      <div className="mp-pop-body">{children}</div>
    </div>,
    document.body,
  );
}

function BaselinePopover({ row, vid, anchor, onClose, onSaved }: { row: GridView["rows"][number]; vid: string; anchor: Anchor; onClose: () => void; onSaved: () => void }) {
  const [m, setM] = useState<Masking>(row.baseline.masking ?? { family: "partial", params: defaultParamsForChoice("partial") });
  const [, start] = useTransition();
  const save = (masking: Masking | null, status: "ready" | "not_used" = "ready") => start(async () => { await setBaselineAction(vid, row.code, masking, status); onSaved(); });

  if (row.regulated) {
    return (
      <Popover anchor={anchor} title={`Everyone sees ${row.displayName}`} onClose={onClose}>
        <p className="cell-sub" style={{ marginTop: 0 }}>Protected by law. Choose its legal minimum or hide it completely. No one can ever see it in full.</p>
        <div className="stack" style={{ gap: 6 }}>
          <button className="btn" onClick={() => save(row.legalMinimum)}>Legal minimum <span className="mono cell-sub">{renderValue(row.legalMinimum, row.sampleValue)}</span></button>
          <button className="btn" onClick={() => save(null)}>Hide completely</button>
        </div>
      </Popover>
    );
  }
  return (
    <Popover anchor={anchor} title={`Everyone sees ${row.displayName}`} onClose={onClose} width={420}>
      <MaskEditor value={m} onChange={setM} sample={row.sampleValue} />
      <div className="row" style={{ gap: 8, justifyContent: "space-between", marginTop: 10 }}>
        <button className="btn ghost sm" onClick={() => save(null)}>Hide completely</button>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={() => save(null, "not_used")}>Mark not used</button>
          <button className="btn primary sm" onClick={() => save(m)}>Done</button>
        </div>
      </div>
    </Popover>
  );
}

function AudiencePopover({ row, vid, audienceId, audienceLabel, channels, anchor, onClose, onSaved }: { row: GridView["rows"][number]; vid: string; audienceId: string; audienceLabel: string; channels: GridView["channels"]; anchor: Anchor; onClose: () => void; onSaved: () => void }) {
  const cell = row.audiences.find((c) => c.audienceId === audienceId)!;
  const baseStrength = strengthOf(row.baseline.masking, row.sampleValue);
  // choices that reveal MORE than the baseline
  const moreChoices = MASK_CHOICES.filter((c) => strengthOf({ family: c.key, params: defaultParamsForChoice(c.key) }, row.sampleValue) > baseStrength).map((c) => c.key);
  const [mode, setMode] = useState<"same" | "more" | "full_raw">(cell.kind === "full_raw" ? "full_raw" : cell.kind === "more" ? "more" : "same");
  const [m, setM] = useState<Masking>({ family: (moreChoices[0] as string) ?? "partial", params: defaultParamsForChoice(moreChoices[0] ?? "partial") });
  const [scopeAny, setScopeAny] = useState(!cell.channelLabel);
  const [scopeIds, setScopeIds] = useState<string[]>([]);
  const [reason, setReason] = useState(cell.reason ?? "");
  const [addCh, setAddCh] = useState(false);
  const [, start] = useTransition();
  const canMore = moreChoices.length > 0;

  const save = () => start(async () => {
    if (mode === "same") { await setGrantAction(vid, audienceId, row.code, null); onSaved(); return; }
    const scope = scopeAny || scopeIds.length === 0 ? "ANY" : scopeIds;
    await setGrantAction(vid, audienceId, row.code, { visibility: mode, masking: mode === "more" ? m : null, channelScope: scope, reason: mode === "full_raw" ? reason : undefined });
    onSaved();
  });

  return (
    <Popover anchor={anchor} title={`${audienceLabel} can see more of ${row.displayName}`} onClose={onClose} width={440}>
      <div className="stack" style={{ gap: 8 }}>
        <label className="mp-radio"><input type="radio" checked={mode === "same"} onChange={() => setMode("same")} /> Same as everyone <span className="cell-sub">({row.baseline.example})</span></label>
        {canMore && <label className="mp-radio"><input type="radio" checked={mode === "more"} onChange={() => setMode("more")} /> Show more</label>}
        <label className="mp-radio"><input type="radio" checked={mode === "full_raw"} onChange={() => setMode("full_raw")} /> Full raw value <span className="cell-sub">reveals everything</span></label>

        {mode === "more" && (
          <div className="stack" style={{ gap: 8, paddingLeft: 6 }}>
            <MaskEditor value={m} onChange={setM} sample={row.sampleValue} allow={moreChoices} />
            <div className="stack" style={{ gap: 4 }}>
              <label className="mp-radio"><input type="radio" checked={scopeAny} onChange={() => setScopeAny(true)} /> On any channel</label>
              <label className="mp-radio"><input type="radio" checked={!scopeAny} onChange={() => setScopeAny(false)} /> Only on…</label>
              {!scopeAny && (
                <div className="stack" style={{ gap: 4, paddingLeft: 18 }}>
                  {channels.map((c) => <label key={c.id} className="mp-radio"><input type="checkbox" checked={scopeIds.includes(c.id)} onChange={() => setScopeIds((s) => s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id])} /> {c.label}</label>)}
                  {addCh ? <AddChannel vid={vid} onDone={() => { setAddCh(false); onSaved(); }} /> : <button className="link-btn" onClick={() => setAddCh(true)}><Plus size={12} /> Add channel</button>}
                </div>
              )}
            </div>
          </div>
        )}
        {mode === "full_raw" && (
          <label className="fld"><span>Why does {audienceLabel} need the full value?</span><input className="input sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Stored and shown at activation." /></label>
        )}
        <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
          <button className="btn primary sm" disabled={mode === "full_raw" && !reason.trim()} onClick={save}>Done</button>
        </div>
      </div>
    </Popover>
  );
}

function BulkPopover({ vid, codes, rows, anchor, onClose, onSaved }: { vid: string; codes: string[]; rows: GridView["rows"]; anchor: Anchor; onClose: () => void; onSaved: () => void }) {
  const sample = rows.find((r) => codes.includes(r.code))?.sampleValue ?? "";
  const [m, setM] = useState<Masking>({ family: "partial", params: defaultParamsForChoice("partial") });
  const [result, setResult] = useState<{ applied: number; skipped: { code: string; reason: string }[] } | null>(null);
  const [, start] = useTransition();
  const apply = () => start(async () => { const r = await bulkBaselineAction(vid, codes, m, "ready"); if (r.ok && r.result) { if (r.result.skipped.length) setResult(r.result); else onSaved(); } });
  return (
    <Popover anchor={anchor} title={`Change what everyone sees (${codes.length})`} onClose={onClose} width={420}>
      <MaskEditor value={m} onChange={setM} sample={sample} />
      {result && result.skipped.length > 0 && (
        <div className="notice warn" style={{ margin: "8px 0" }}><div className="notice-title">{result.applied} applied · {result.skipped.length} skipped</div><div>Regulated fields keep their legal minimum: {result.skipped.map((s) => s.code).join(", ")}.</div></div>
      )}
      <div className="row" style={{ justifyContent: "flex-end", gap: 6, marginTop: 8 }}>
        {result ? <button className="btn primary sm" onClick={onSaved}>Done</button> : <button className="btn primary sm" onClick={apply}>Apply to {codes.length}</button>}
      </div>
    </Popover>
  );
}

function AddAudience({ vid, onDone }: { vid: string; onDone: () => void }) {
  const [label, setLabel] = useState(""); const [ident, setIdent] = useState(""); const [, start] = useTransition();
  return (
    <div className="stack" style={{ gap: 4 }}>
      <input className="input sm" placeholder="Name, e.g. Teller" value={label} onChange={(e) => setLabel(e.target.value)} />
      <input className="input sm" placeholder="How your app names this role" value={ident} onChange={(e) => setIdent(e.target.value)} />
      <div className="row" style={{ gap: 4 }}><button className="btn primary sm" disabled={!label.trim() || !ident.trim()} onClick={() => start(async () => { await addAudienceAction(vid, label, ident); onDone(); })}>Add</button></div>
    </div>
  );
}
function AddChannel({ vid, onDone }: { vid: string; onDone: () => void }) {
  const [label, setLabel] = useState(""); const [ident, setIdent] = useState(""); const [, start] = useTransition();
  return (
    <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
      <input className="input sm" style={{ flex: "1 1 100px" }} placeholder="Channel name" value={label} onChange={(e) => setLabel(e.target.value)} />
      <input className="input sm" style={{ flex: "1 1 100px" }} placeholder="Identifier" value={ident} onChange={(e) => setIdent(e.target.value)} />
      <button className="btn sm" disabled={!label.trim() || !ident.trim()} onClick={() => start(async () => { await addChannelAction(vid, label, ident); onDone(); })}>Add</button>
    </div>
  );
}
