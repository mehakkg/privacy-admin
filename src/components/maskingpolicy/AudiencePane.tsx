"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X, Plus, ChevronDown, ChevronRight, Lock } from "lucide-react";
import { MaskEditor } from "@/components/maskingpolicy/MaskEditor";
import { PolicyGrid } from "@/components/maskingpolicy/PolicyGrid";
import { PreviewDrawer } from "@/components/maskingpolicy/PreviewDrawer";
import { ManageChannelsModal } from "@/components/maskingpolicy/ManageChannelsModal";
import { defaultParamsForChoice, MASK_CHOICES, strengthOf, type Masking } from "@/lib/maskingpolicy";
import type { GridView } from "@/lib/engines/maskingpolicy";
import { setGrantAction, addChannelAction } from "@/app/actions/maskingpolicy";

export function AudiencePane({ view, liveView, audienceId, audienceLabel }: { view: GridView; liveView: GridView | null; audienceId: string; audienceLabel: string }) {
  const router = useRouter();
  const vid = view.version.id;
  const [adding, setAdding] = useState(false);
  const [gridView, setGridView] = useState(false);
  const [sameOpen, setSameOpen] = useState(false);
  const [, start] = useTransition();

  const cellOf = (r: GridView["rows"][number]) => r.audiences.find((c) => c.audienceId === audienceId)!;
  const moreRows = view.rows.filter((r) => { const c = cellOf(r); return c.kind === "more" || c.kind === "full_raw"; });
  const sameRows = view.rows.filter((r) => { const c = cellOf(r); return c.kind === "same" || c.kind === "locked"; });

  if (gridView) return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between" }}><strong>All audiences · grid</strong><button className="btn ghost sm" onClick={() => setGridView(false)}>List view</button></div>
      <PolicyGrid view={view} />
    </div>
  );

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div className="stack" style={{ gap: 2 }}>
          <h3 style={{ margin: 0 }}>What {audienceLabel} sees</h3>
          <span className="cell-sub">{audienceLabel} sees what everyone sees, except the fields below.</span>
        </div>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <PreviewDrawer draft={view} live={liveView} label={`See as ${audienceLabel}`} startVersion="draft" startAudience={audienceLabel} />
          <button className="btn ghost sm" onClick={() => setGridView(true)}>Grid view</button>
        </div>
      </div>

      {moreRows.length === 0 ? (
        <p className="cell-sub">Same as everyone. No exceptions yet. For example: fraud investigators seeing a full mobile number, or branch managers seeing loan account numbers only in the mobile app.</p>
      ) : (
        <div className="mp-seesmore">
          {moreRows.map((r) => { const c = cellOf(r); return (
            <div key={r.code} className={`mp-seesmore-row${c.kind === "full_raw" ? " fullraw" : ""}`}>
              <div className="stack" style={{ gap: 2, flex: 1 }}>
                <span className="cell-primary">{r.displayName}</span>
                <span className="mono cell-sub">{r.baseline.example} → {c.example}</span>
                {c.kind === "full_raw" && c.reason && <span className="cell-sub">Full raw value · {c.reason}</span>}
              </div>
              <span className="cell-sub">{c.channelLabel ? `Only on ${c.channelLabel}` : "Any channel"}</span>
              <button className="link-btn" onClick={() => start(async () => { await setGrantAction(vid, audienceId, r.code, null); router.refresh(); })}>Remove</button>
            </div>
          ); })}
        </div>
      )}

      <div><button className="btn" onClick={() => setAdding(true)}><Plus size={14} /> Let {audienceLabel} see more of…</button></div>

      <div className="mp-samecollapse">
        <button className="mp-catgroup-head" onClick={() => setSameOpen((o) => !o)}>{sameOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<strong>Same as everyone · {sameRows.length} fields</strong></button>
        {sameOpen && <div className="table-wrap"><table className="dtable compact"><tbody>
          {sameRows.map((r) => { const c = cellOf(r); return <tr key={r.code}><td>{r.displayName}</td><td className="mono cell-sub">{r.baseline.example}</td><td>{c.kind === "locked" && <span className="row" style={{ gap: 4 }}><Lock size={11} /> legal limit</span>}</td></tr>; })}
        </tbody></table></div>}
      </div>

      {adding && <AddMorePopover view={view} vid={vid} audienceId={audienceId} audienceLabel={audienceLabel} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); router.refresh(); }} />}
    </div>
  );
}

function AddMorePopover({ view, vid, audienceId, audienceLabel, onClose, onSaved }: { view: GridView; vid: string; audienceId: string; audienceLabel: string; onClose: () => void; onSaved: () => void }) {
  const [m, setM] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setM(true); }, []);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<GridView["rows"][number] | null>(null);
  const [mode, setMode] = useState<"more" | "full_raw">("more");
  const [mask, setMask] = useState<Masking>({ family: "partial", params: defaultParamsForChoice("partial") });
  const [scopeAny, setScopeAny] = useState(true);
  const [scopeIds, setScopeIds] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [addCh, setAddCh] = useState(false);
  const [manageCh, setManageCh] = useState(false);
  const [chName, setChName] = useState(""); const [chId, setChId] = useState("");
  const [, start] = useTransition();

  // eligible: used, not regulated, not already granted more, status ready
  const eligible = view.rows.filter((r) => { const c = r.audiences.find((x) => x.audienceId === audienceId)!; return !r.regulated && r.status === "ready" && c.kind === "same"; });
  const matches = q.trim() ? eligible.filter((r) => (r.displayName + r.code).toLowerCase().includes(q.toLowerCase())) : eligible;
  const moreChoices = picked ? MASK_CHOICES.filter((c) => strengthOf({ family: c.key, params: defaultParamsForChoice(c.key) }, picked.sampleValue) > strengthOf(picked.baseline.masking, picked.sampleValue)).map((c) => c.key) : [];

  const save = () => start(async () => {
    if (!picked) return;
    const scope = scopeAny || scopeIds.length === 0 ? "ANY" : scopeIds;
    await setGrantAction(vid, audienceId, picked.code, { visibility: mode, masking: mode === "more" ? mask : null, channelScope: scope, reason: mode === "full_raw" ? reason : undefined });
    onSaved();
  });

  if (!m) return null;
  return createPortal(
    <div ref={ref} className="mp-pop mp-pop-center" style={{ width: 460 }}>
      <div className="mp-pop-head"><strong>Let {audienceLabel} see more of…</strong><button className="icon-btn" onClick={onClose}><X size={14} /></button></div>
      <div className="mp-pop-body">
        <div className="stack" style={{ gap: 10 }}>
          <label className="fld"><span>Field</span><input className="input" autoFocus placeholder="Search fields" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          {!picked && <div className="mp-fieldpick">{matches.map((r) => <button key={r.code} className="mp-fieldpick-item" onClick={() => { setPicked(r); const mc = MASK_CHOICES.find((c) => strengthOf({ family: c.key, params: defaultParamsForChoice(c.key) }, r.sampleValue) > strengthOf(r.baseline.masking, r.sampleValue)); setMask({ family: (mc?.key ?? "partial"), params: defaultParamsForChoice(mc?.key ?? "partial") }); }}>{r.displayName} <span className="cell-sub mono">{r.code}</span></button>)}{matches.length === 0 && <p className="cell-sub">No eligible fields.</p>}</div>}
          {picked && (
            <div className="stack" style={{ gap: 10 }}>
              <div className="row" style={{ gap: 6 }}><strong>{picked.displayName}</strong><button className="link-btn" onClick={() => setPicked(null)}>Change field</button></div>
              <div className="fld"><span>How much</span>
                <div className="stack" style={{ gap: 6 }}>
                  <label className="mp-radio"><input type="radio" checked={mode === "more"} onChange={() => setMode("more")} /> Show more</label>
                  {mode === "more" && moreChoices.length > 0 && <MaskEditor value={mask} onChange={setMask} sample={picked.sampleValue} allow={moreChoices} />}
                  <label className="mp-radio"><input type="radio" checked={mode === "full_raw"} onChange={() => setMode("full_raw")} /> Full raw value <span className="cell-sub">reveals everything</span></label>
                  {mode === "full_raw" && <input className="input sm" placeholder="Why does this role need the full value?" value={reason} onChange={(e) => setReason(e.target.value)} />}
                </div>
              </div>
              <div className="fld"><span>Where</span>
                <div className="stack" style={{ gap: 4 }}>
                  <label className="mp-radio"><input type="radio" checked={scopeAny} onChange={() => setScopeAny(true)} /> Any channel</label>
                  <label className="mp-radio"><input type="radio" checked={!scopeAny} onChange={() => setScopeAny(false)} /> Only on…</label>
                  {!scopeAny && <div className="stack" style={{ gap: 4, paddingLeft: 18 }}>
                    {view.channels.map((c) => <label key={c.id} className="mp-radio"><input type="checkbox" checked={scopeIds.includes(c.id)} onChange={() => setScopeIds((s) => s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id])} /> {c.label}</label>)}
                    {addCh ? <div className="row" style={{ gap: 4, flexWrap: "wrap" }}><input className="input sm" placeholder="Channel name" value={chName} onChange={(e) => setChName(e.target.value)} /><input className="input sm" placeholder="Identifier" value={chId} onChange={(e) => setChId(e.target.value)} /><button className="btn sm" disabled={!chName.trim() || !chId.trim()} onClick={() => start(async () => { await addChannelAction(vid, chName, chId); setAddCh(false); setChName(""); setChId(""); onSaved(); })}>Add</button></div>
                      : <div className="row" style={{ gap: 12 }}><button className="link-btn" onClick={() => setAddCh(true)}><Plus size={12} /> Add channel</button><button className="link-btn" onClick={() => setManageCh(true)}>Manage channels</button></div>}
                  </div>}
                </div>
              </div>
              <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn primary sm" disabled={mode === "full_raw" && !reason.trim()} onClick={save}>Save</button></div>
            </div>
          )}
        </div>
      </div>
      {manageCh && <ManageChannelsModal draftId={vid} onClose={() => setManageCh(false)} />}
    </div>,
    document.body,
  );
}
