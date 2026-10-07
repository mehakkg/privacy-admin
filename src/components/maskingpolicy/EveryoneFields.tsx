"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Lock, ChevronDown, ChevronRight, X, SlidersHorizontal } from "lucide-react";
import { AddFieldModal } from "@/components/maskingpolicy/AddFieldModal";
import {
  deriveMasking, renderValue, strengthLabel, STRENGTHS, TIERS, TIER_TONE, TIER_DEFAULT_RANK, LEGAL_MIN_RANK,
  inferDataType, type Tier, type DataType,
} from "@/lib/maskingpolicy";
import type { GridView, SensitivityRuleView } from "@/lib/engines/maskingpolicy";
import { setFieldStrengthAction, setSensitivityRulesAction, classifyFieldAction, bulkBaselineAction, removeFieldAction } from "@/app/actions/maskingpolicy";

interface Cat { id: string; name: string; definition: string }
type Row = GridView["rows"][number];

/** A small coloured sensitivity chip. "Not classified" when the tier is unset. */
function TierChip({ tier }: { tier: string }) {
  const tone = TIER_TONE[tier] ?? TIER_TONE["Not classified"];
  return <span className="mp-tier"><span className="mp-tier-dot" style={{ background: tone.dot }} />{tier}</span>;
}

/** The status line for a field in the Everyone pane. */
function statusOf(r: Row): { text: string; tone: "muted" | "warn" | "accent" } {
  if (r.status === "not_used") return { text: "Not used", tone: "muted" };
  if (r.status === "needs_decision") return { text: "Not classified — classify to set masking", tone: "warn" };
  if (r.mode === "custom") return { text: r.overrideReason ? "Custom · shows more than its sensitivity" : "Custom strength", tone: r.overrideReason ? "warn" : "accent" };
  if (r.mode === "held") return { text: "Held — not following its sensitivity yet", tone: "accent" };
  if (r.cappedByLaw) return { text: `Follows ${r.sensitivity} (kept at the legal minimum)`, tone: "muted" };
  return { text: `Follows ${r.sensitivity}`, tone: "muted" };
}

/** The Everyone pane: category groups of field rows whose masking follows each
 *  field's sensitivity. A row opens the strength picker; Select enables bulk. */
export function EveryoneFields({ view, categories, focusField, rules }: { view: GridView; categories: Cat[]; focusField?: string | null; rules: SensitivityRuleView[] }) {
  const router = useRouter();
  const vid = view.version.id;
  const [open, setOpen] = useState<{ code: string; anchor: { top: number; left: number } } | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(view.categories.filter((c) => c.changedCount === 0).map((c) => c.id)));
  const [bulk, setBulk] = useState<{ anchor: { top: number; left: number } } | null>(null);
  const [addField, setAddField] = useState(false);
  const [editRules, setEditRules] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const row = (c: string) => view.rows.find((r) => r.code === c)!;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="mp-sens-legend">
        <span className="cell-sub">Masking follows each field&rsquo;s sensitivity:</span>
        {rules.map((r) => <span key={r.tier} className="mp-sens-legend-item"><TierChip tier={r.tier} /><span className="cell-sub">→ {r.label}</span></span>)}
        <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => setEditRules(true)}><SlidersHorizontal size={13} /> Masking by sensitivity</button>
      </div>
      <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
        <button className="btn ghost sm" onClick={() => { setSelectMode((s) => !s); setSel(new Set()); }}>{selectMode ? "Done selecting" : "Select"}</button>
        <button className="btn sm" onClick={() => setAddField(true)}>+ Add a field</button>
      </div>
      {justAdded && <div className="notice info" style={{ margin: 0 }}><div className="row" style={{ gap: 8, justifyContent: "space-between", alignItems: "center" }}><span>Ask your developers to mark this data with <span className="mono">{justAdded}</span></span><button className="link-btn" onClick={() => navigator.clipboard?.writeText(justAdded)}>Copy field code</button></div></div>}
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
                {members.map((r) => {
                  const st = statusOf(r);
                  return (
                    <div key={r.code} className={`mp-fieldrow${focusField === r.code ? " hl" : ""}`} id={`mp-field-${r.code}`}>
                      {selectMode && r.status !== "not_used" && <input type="checkbox" checked={sel.has(r.code)} onChange={() => setSel((s) => { const n = new Set(s); n.has(r.code) ? n.delete(r.code) : n.add(r.code); return n; })} />}
                      <button className="mp-fieldrow-main" onClick={(e) => { const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); setOpen({ code: r.code, anchor: { top: b.bottom + 4, left: Math.min(b.left, window.innerWidth - 460) } }); }}>
                        <span className="cell-primary">{r.displayName}</span>
                        <TierChip tier={r.sensitivity} />
                        <span className="mono mp-fieldval">{r.baseline.example}</span>
                        <span className="cell-sub">{r.status === "not_used" ? "—" : strengthLabel(r.strengthRank)}</span>
                        <span className={`cell-sub mp-status-${st.tone}`}>{st.text}</span>
                        <span className="row" style={{ gap: 4, marginLeft: "auto" }}>
                          {r.regulated && <span className="mp-tag lock"><Lock size={9} /> Regulated</span>}
                          {r.origin === "your_organization" && <span className="mp-tag">Yours</span>}
                          {r.isNew && <span className="mp-tag new">New from apps</span>}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </>}
          </div>
        );
      })}

      {selectMode && sel.size > 0 && (
        <BulkBar vid={vid} codes={[...sel]} onDone={() => { setSel(new Set()); router.refresh(); }} onPick={(e) => { const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); setBulk({ anchor: { top: b.bottom + 4, left: Math.max(8, b.left - 260) } }); }} />
      )}

      {open && <StrengthPicker row={row(open.code)} vid={vid} rules={rules} anchor={open.anchor} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); router.refresh(); }} />}
      {bulk && <BulkPopover vid={vid} codes={[...sel]} anchor={bulk.anchor} onClose={() => setBulk(null)} onSaved={() => { setBulk(null); setSel(new Set()); router.refresh(); }} />}
      {addField && <AddFieldModal draftId={vid} categories={categories} onClose={() => setAddField(false)} onAdded={(code) => { setAddField(false); setJustAdded(code); setTimeout(() => document.getElementById(`mp-field-${code}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 300); }} />}
      {editRules && <SensitivityEditor vid={vid} rules={rules} onClose={() => setEditRules(false)} onSaved={() => { setEditRules(false); router.refresh(); }} />}
    </div>
  );
}

function Shell({ anchor, title, onClose, children, width = 440 }: { anchor: { top: number; left: number }; title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  const [m, setM] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setM(true); const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }; document.addEventListener("mousedown", c); return () => document.removeEventListener("mousedown", c); }, [onClose]);
  if (!m) return null;
  return createPortal(<div ref={ref} className="mp-pop" style={{ position: "fixed", top: anchor.top, left: Math.max(8, anchor.left), width }}><div className="mp-pop-head"><strong>{title}</strong><button className="icon-btn" onClick={onClose}><X size={14} /></button></div><div className="mp-pop-body">{children}</div></div>, document.body);
}

/** C — the field strength picker. Strength cards follow/override the sensitivity. */
function StrengthPicker({ row, vid, rules, anchor, onClose, onSaved }: { row: Row; vid: string; rules: SensitivityRuleView[]; anchor: { top: number; left: number }; onClose: () => void; onSaved: () => void }) {
  const [, start] = useTransition();
  const [reason, setReason] = useState(row.overrideReason ?? "");
  const [err, setErr] = useState<string | null>(null);
  const dataType = inferDataType(row.code) as DataType;
  const tierDefined = (TIERS as string[]).includes(row.sensitivity);

  const preview = (rank: number) => renderValue(deriveMasking(dataType, rank, row.regulated).masking, row.sampleValue);
  const save = (input: { mode: "follows" | "custom" | "held"; rank?: number; reason?: string }) => start(async () => {
    const r = await setFieldStrengthAction(vid, row.code, input);
    if (r.ok) onSaved(); else setErr(r.error ?? "Could not save.");
  });

  // Not classified: can't derive masking. Offer to classify (stays hidden until then).
  if (!tierDefined) {
    return (
      <Shell anchor={anchor} title={row.displayName} onClose={onClose}>
        <p className="cell-sub" style={{ marginTop: 0 }}>Not classified yet, so it stays fully hidden. Give it a sensitivity and its masking follows automatically.</p>
        <div className="mp-strengthgrid">
          {TIERS.map((t) => (
            <button key={t} className="mp-tiercard" onClick={() => start(async () => { const r = await classifyFieldAction(row.code, t); if (r.ok) onSaved(); else setErr(r.error ?? "Could not classify."); })}>
              <TierChip tier={t} /><span className="cell-sub">→ {strengthLabel(rules.find((x) => x.tier === t)?.rank ?? TIER_DEFAULT_RANK[t])}</span>
            </button>
          ))}
        </div>
        {err && <div className="notice warn" style={{ margin: "8px 0 0" }}>{err}</div>}
      </Shell>
    );
  }

  const tierRank = row.tierRank;
  const legalFloor = row.regulated ? LEGAL_MIN_RANK : 0;
  return (
    <Shell anchor={anchor} title={row.displayName} onClose={onClose}>
      <div className="row" style={{ gap: 8, marginTop: 0, marginBottom: 8, alignItems: "center" }}>
        <TierChip tier={row.sensitivity} />
        <span className="cell-sub">Its sensitivity makes it <strong>{strengthLabel(tierRank)}</strong>.</span>
      </div>

      <button className={`mp-followbtn${row.mode === "follows" ? " on" : ""}`} onClick={() => save({ mode: "follows" })}>
        <span>Follow its sensitivity</span>
        <span className="mono cell-sub">{preview(tierRank)} · {strengthLabel(tierRank)}</span>
      </button>

      <div className="cell-sub" style={{ margin: "10px 0 4px" }}>Or set a strength for this field only</div>
      <div className="mp-strengthgrid">
        {STRENGTHS.map((s) => {
          const belowLegal = s.rank < legalFloor;
          const fullNotPublic = s.rank === 0 && row.sensitivity !== "Public";
          const disabled = belowLegal || fullNotPublic;
          const looser = s.rank < tierRank;
          const active = row.mode !== "follows" && row.strengthRank === s.rank;
          return (
            <button key={s.rank} disabled={disabled} className={`mp-strengthcard${active ? " on" : ""}${disabled ? " off" : ""}`}
              title={belowLegal ? "Protected by law — can't be shown this openly" : fullNotPublic ? "Only a Public field can be shown in full" : ""}
              onClick={() => {
                if (looser && !reason.trim()) { setErr("Showing more than this field's sensitivity allows needs a reason."); return; }
                save({ mode: "custom", rank: s.rank, reason: looser ? reason.trim() : undefined });
              }}>
              <span>{s.label}{looser && !disabled ? " ↑" : ""}</span>
              <span className="mono cell-sub">{disabled ? "—" : preview(s.rank)}</span>
            </button>
          );
        })}
      </div>

      <label className="stack" style={{ gap: 4, marginTop: 10 }}>
        <span className="cell-sub">Reason (needed to show more than the sensitivity allows)</span>
        <textarea className="mp-textarea" rows={2} value={reason} onChange={(e) => { setReason(e.target.value); setErr(null); }} placeholder="e.g. Fraud team needs the last 6 digits to match disputes." />
      </label>

      <div className="row" style={{ gap: 8, justifyContent: "space-between", marginTop: 10, alignItems: "center" }}>
        <button className="link-btn" onClick={() => save({ mode: "held", rank: row.strengthRank })}>Hold — don&rsquo;t follow for now</button>
        {row.origin === "your_organization" && <RemoveFromPolicy code={row.code} onDone={onSaved} />}
      </div>
      {err && <div className="notice warn" style={{ margin: "8px 0 0" }}>{err}</div>}
    </Shell>
  );
}

function RemoveFromPolicy({ code, onDone }: { code: string; onDone: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [, start] = useTransition();
  if (!confirm) return <button className="link-btn" style={{ color: "var(--red)" }} onClick={() => setConfirm(true)}>Remove from policy</button>;
  return (
    <div className="row" style={{ gap: 6 }}><button className="btn danger sm" onClick={() => start(async () => { await removeFieldAction(code); onDone(); })}>Remove</button><button className="btn ghost sm" onClick={() => setConfirm(false)}>Cancel</button></div>
  );
}

/** B — the masking-by-sensitivity editor. One strength per tier, monotonic. */
function SensitivityEditor({ vid, rules, onClose, onSaved }: { vid: string; rules: SensitivityRuleView[]; onClose: () => void; onSaved: () => void }) {
  const [m, setM] = useState(false); const ref = useRef<HTMLDivElement>(null);
  const [ranks, setRanks] = useState<Record<string, number>>(Object.fromEntries(TIERS.map((t) => [t, rules.find((r) => r.tier === t)?.rank ?? TIER_DEFAULT_RANK[t]])));
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();
  useEffect(() => { setM(true); }, []);
  if (!m) return null;

  // Monotonic preview: a tier may not reveal more than a more-sensitive one.
  const monoOk = TIERS.every((t, i) => i === 0 || ranks[t] <= ranks[TIERS[i - 1]]);
  const save = () => {
    if (!monoOk) { setErr("A less-sensitive tier can't be shown more openly than a more-sensitive one."); return; }
    start(async () => { const r = await setSensitivityRulesAction(vid, TIERS.map((t) => ({ tier: t as Tier, rank: ranks[t] }))); if (r.ok) onSaved(); else setErr(r.error ?? "Could not save."); });
  };

  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="modal std-modal md" role="dialog" aria-modal="true" aria-label="Masking by sensitivity">
        <div className="std-modal-head"><h3 style={{ margin: 0 }}>Masking by sensitivity</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="std-modal-body">
          <p className="cell-sub" style={{ marginTop: 0 }}>Each tier shows its default strength. Fields that follow their sensitivity move with these. Fields set individually don&rsquo;t change.</p>
          <div className="stack" style={{ gap: 10 }}>
            {TIERS.map((t) => (
              <div key={t} className="mp-sensrow">
                <div style={{ minWidth: 130 }}><TierChip tier={t} /></div>
                <div className="mp-segment mp-segment-wrap">
                  {STRENGTHS.slice().reverse().map((s) => (
                    <button key={s.rank} className={ranks[t] === s.rank ? "on" : ""} onClick={() => { setRanks((r) => ({ ...r, [t]: s.rank })); setErr(null); }}>{s.label}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {err && <div className="notice warn" style={{ margin: "10px 0 0" }}>{err}</div>}
        </div>
        <div className="std-modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!monoOk} onClick={save}>Save</button></div>
      </div>
    </div>, document.body);
}

function BulkBar({ vid, codes, onDone, onPick }: { vid: string; codes: string[]; onDone: () => void; onPick: (e: React.MouseEvent) => void }) {
  const [, start] = useTransition();
  return (
    <div className="mask-selbar">
      <span>{codes.length} selected</span>
      <div className="row" style={{ gap: 8, marginLeft: "auto" }}>
        <button className="btn sm" onClick={onPick}>Set strength</button>
        <button className="btn sm" onClick={() => start(async () => { await Promise.all(codes.map((c) => setFieldStrengthAction(vid, c, { mode: "follows" }))); onDone(); })}>Follow sensitivity</button>
        <button className="btn sm" onClick={() => start(async () => { await bulkBaselineAction(vid, codes, null, "not_used"); onDone(); })}>Mark not used</button>
      </div>
    </div>
  );
}

/** Bulk strength: applies a custom rank to all selected; reports any skipped by guardrails. */
function BulkPopover({ vid, codes, anchor, onClose, onSaved }: { vid: string; codes: string[]; anchor: { top: number; left: number }; onClose: () => void; onSaved: () => void }) {
  const [skipped, setSkipped] = useState<string[] | null>(null);
  const [, start] = useTransition();
  const apply = (rank: number) => start(async () => {
    const results = await Promise.all(codes.map(async (c) => ({ c, r: await setFieldStrengthAction(vid, c, { mode: "custom", rank }) })));
    const bad = results.filter((x) => !x.r.ok).map((x) => x.c);
    if (bad.length) setSkipped(bad); else onSaved();
  });
  return (
    <Shell anchor={anchor} title={`Set strength (${codes.length})`} onClose={onClose} width={320}>
      {!skipped ? <>
        <p className="cell-sub" style={{ marginTop: 0 }}>Applies to all selected. Fields protected by law, or that would show more than their sensitivity allows, are skipped.</p>
        <div className="stack" style={{ gap: 6 }}>
          {STRENGTHS.filter((s) => s.rank !== 0).map((s) => <button key={s.rank} className="btn" onClick={() => apply(s.rank)}>{s.label}</button>)}
        </div>
      </> : <>
        <div className="notice warn" style={{ marginTop: 0 }}>Skipped {skipped.length}: {skipped.join(", ")}. Set these individually with a reason.</div>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}><button className="btn primary sm" onClick={onSaved}>Done</button></div>
      </>}
    </Shell>
  );
}
