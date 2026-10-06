"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Lock, ChevronDown, ChevronRight, X } from "lucide-react";
import { MaskEditor } from "@/components/maskingpolicy/MaskEditor";
import { defaultParamsForChoice, renderValue, type Masking } from "@/lib/maskingpolicy";
import type { GridView } from "@/lib/engines/maskingpolicy";
import { setBaselineAction, bulkBaselineAction } from "@/app/actions/maskingpolicy";

/** The Everyone pane: category groups of field rows (single column, no audiences).
 *  A row opens the field popover; Select mode reveals checkboxes for bulk. */
export function EveryoneFields({ view, focusField }: { view: GridView; focusField?: string | null }) {
  const router = useRouter();
  const vid = view.version.id;
  const [open, setOpen] = useState<{ code: string; anchor: { top: number; left: number } } | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(view.categories.filter((c) => c.changedCount === 0).map((c) => c.id)));
  const [bulk, setBulk] = useState<{ anchor: { top: number; left: number } } | null>(null);
  const [, start] = useTransition();
  const row = (c: string) => view.rows.find((r) => r.code === c)!;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn ghost sm" onClick={() => { setSelectMode((s) => !s); setSel(new Set()); }}>{selectMode ? "Done selecting" : "Select"}</button>
      </div>
      {view.categories.map((cat) => {
        const members = view.rows.filter((r) => r.categoryId === cat.id);
        const isC = collapsed.has(cat.id);
        return (
          <div key={cat.id} className="mp-catgroup">
            <button className="mp-catgroup-head" onClick={() => setCollapsed((s) => { const n = new Set(s); n.has(cat.id) ? n.delete(cat.id) : n.add(cat.id); return n; })}>
              {isC ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              <strong>{cat.name}</strong><span className="cell-sub">{cat.fieldCount} fields{cat.regulatedCount ? ` · ${cat.regulatedCount} regulated` : ""}</span>
            </button>
            {!isC && <>
              <p className="cell-sub mp-catdef">{cat.definition}</p>
              <div className="mp-fieldlist">
                {members.map((r) => (
                  <div key={r.code} className={`mp-fieldrow${focusField === r.code ? " hl" : ""}`} id={`mp-field-${r.code}`}>
                    {selectMode && r.status !== "not_used" && <input type="checkbox" checked={sel.has(r.code)} onChange={() => setSel((s) => { const n = new Set(s); n.has(r.code) ? n.delete(r.code) : n.add(r.code); return n; })} />}
                    <button className="mp-fieldrow-main" onClick={(e) => { const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); setOpen({ code: r.code, anchor: { top: b.bottom + 4, left: Math.min(b.left, window.innerWidth - 440) } }); }}>
                      <span className="cell-primary">{r.displayName}</span>
                      <span className="cell-sub mono">{r.code}</span>
                      <span className="mono mp-fieldval">{r.baseline.example}</span>
                      <span className="cell-sub">{r.status === "not_used" ? "Not used" : r.baseline.choiceLabel}</span>
                      <span className="row" style={{ gap: 4 }}>
                        {r.regulated && <span className="mp-tag lock"><Lock size={9} /> Regulated</span>}
                        {r.origin === "your_organization" && <span className="mp-tag">Added by your organization</span>}
                        {r.isNew && <span className="mp-tag new">New from apps</span>}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </>}
          </div>
        );
      })}

      {selectMode && sel.size > 0 && (
        <div className="mask-selbar">
          <span>{sel.size} selected</span>
          <div className="row" style={{ gap: 8, marginLeft: "auto" }}>
            <button className="btn sm" onClick={(e) => { const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); setBulk({ anchor: { top: b.bottom + 4, left: b.left - 300 } }); }}>Change masking</button>
            <button className="btn sm" onClick={() => start(async () => { await bulkBaselineAction(vid, [...sel], null, "not_used"); setSel(new Set()); router.refresh(); })}>Mark not used</button>
          </div>
        </div>
      )}

      {open && <FieldPopover row={row(open.code)} vid={vid} anchor={open.anchor} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); router.refresh(); }} />}
      {bulk && <BulkPopover vid={vid} codes={[...sel]} sample={row([...sel][0]).sampleValue} anchor={bulk.anchor} onClose={() => setBulk(null)} onSaved={() => { setBulk(null); setSel(new Set()); router.refresh(); }} />}
    </div>
  );
}

function Shell({ anchor, title, onClose, children, width = 420 }: { anchor: { top: number; left: number }; title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  const [m, setM] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setM(true); const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }; document.addEventListener("mousedown", c); return () => document.removeEventListener("mousedown", c); }, [onClose]);
  if (!m) return null;
  return createPortal(<div ref={ref} className="mp-pop" style={{ position: "fixed", top: anchor.top, left: Math.max(8, anchor.left), width }}><div className="mp-pop-head"><strong>{title}</strong><button className="icon-btn" onClick={onClose}><X size={14} /></button></div><div className="mp-pop-body">{children}</div></div>, document.body);
}

function FieldPopover({ row, vid, anchor, onClose, onSaved }: { row: GridView["rows"][number]; vid: string; anchor: { top: number; left: number }; onClose: () => void; onSaved: () => void }) {
  const [m, setMask] = useState<Masking>(row.baseline.masking ?? { family: "partial", params: defaultParamsForChoice("partial") });
  const [used, setUsed] = useState(row.status !== "not_used");
  const [, start] = useTransition();
  const save = (masking: Masking | null) => start(async () => { await setBaselineAction(vid, row.code, masking, used ? "ready" : "not_used"); onSaved(); });
  if (row.regulated) return (
    <Shell anchor={anchor} title={row.displayName} onClose={onClose}>
      <p className="cell-sub" style={{ marginTop: 0 }}>Protected by law. Choose its legal minimum or hide it completely. No one can ever see it in full.</p>
      <div className="stack" style={{ gap: 6 }}>
        <button className="btn" onClick={() => save(row.legalMinimum)}>Legal minimum <span className="mono cell-sub">{renderValue(row.legalMinimum, row.sampleValue)}</span></button>
        <button className="btn" onClick={() => save(null)}>Hide completely</button>
      </div>
    </Shell>
  );
  return (
    <Shell anchor={anchor} title={row.displayName} onClose={onClose}>
      <MaskEditor value={m} onChange={setMask} sample={row.sampleValue} />
      <label className="mp-radio" style={{ marginTop: 10 }}><input type="checkbox" checked={used} onChange={(e) => setUsed(e.target.checked)} /> Used by your applications <span className="cell-sub">(off = stays hidden if it ever appears)</span></label>
      <div className="row" style={{ gap: 8, justifyContent: "space-between", marginTop: 10 }}>
        <button className="btn ghost sm" onClick={() => save(null)}>Hide completely</button>
        <button className="btn primary sm" onClick={() => save(m)}>Done</button>
      </div>
    </Shell>
  );
}

function BulkPopover({ vid, codes, sample, anchor, onClose, onSaved }: { vid: string; codes: string[]; sample: string; anchor: { top: number; left: number }; onClose: () => void; onSaved: () => void }) {
  const [m, setM] = useState<Masking>({ family: "partial", params: defaultParamsForChoice("partial") });
  const [skipped, setSkipped] = useState<{ code: string }[] | null>(null);
  const [, start] = useTransition();
  return (
    <Shell anchor={anchor} title={`Change masking (${codes.length})`} onClose={onClose}>
      <MaskEditor value={m} onChange={setM} sample={sample} />
      {skipped && skipped.length > 0 && <div className="notice warn" style={{ margin: "8px 0" }}><div>Regulated fields kept their legal minimum: {skipped.map((s) => s.code).join(", ")}.</div></div>}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
        {skipped ? <button className="btn primary sm" onClick={onSaved}>Done</button> : <button className="btn primary sm" onClick={() => start(async () => { const r = await bulkBaselineAction(vid, codes, m, "ready"); if (r.ok && r.result) { if (r.result.skipped.length) setSkipped(r.result.skipped); else onSaved(); } })}>Apply</button>}
      </div>
    </Shell>
  );
}
