"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X, Plus, ChevronDown, ChevronRight, Lock, AlertTriangle } from "lucide-react";
import { MaskEditor } from "@/components/maskingpolicy/MaskEditor";
import { PolicyGrid } from "@/components/maskingpolicy/PolicyGrid";
import { PreviewDrawer } from "@/components/maskingpolicy/PreviewDrawer";
import { ManageChannelsModal } from "@/components/maskingpolicy/ManageChannelsModal";
import { defaultParamsForChoice, MASK_CHOICES, strengthOf, renderValue, type Masking } from "@/lib/maskingpolicy";
import type { GridView } from "@/lib/engines/maskingpolicy";
import { setGrantAction, addChannelAction } from "@/app/actions/maskingpolicy";

type Cell = GridView["rows"][number]["audiences"][number];

/** Group heading for a channel scope. "and" before the last item. */
function scopeHeading(ids: string[], channels: GridView["channels"]): string {
  if (ids.length === 0) return "Sees more everywhere";
  const names = ids.map((id) => channels.find((c) => c.id === id)?.label ?? id);
  const joined = names.length === 1 ? names[0] : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  return `Only on ${joined}`;
}

export function AudiencePane({ view, liveView, audienceId, audienceLabel }: { view: GridView; liveView: GridView | null; audienceId: string; audienceLabel: string }) {
  const router = useRouter();
  const vid = view.version.id;
  const [popover, setPopover] = useState<null | { editCode?: string }>(null);
  const [manageCh, setManageCh] = useState(false);
  const [gridView, setGridView] = useState(false);
  const [sameOpen, setSameOpen] = useState(false);
  const [, start] = useTransition();

  const cellOf = (r: GridView["rows"][number]) => r.audiences.find((c) => c.audienceId === audienceId)!;
  const moreRows = view.rows.filter((r) => { const c = cellOf(r); return c.kind === "more" || c.kind === "full_raw"; });
  const sameRows = view.rows.filter((r) => { const c = cellOf(r); return c.kind === "same" || c.kind === "locked"; });

  // Group by channel scope. Any-channel first, then each distinct scope, alpha.
  const anyGroup = moreRows.filter((r) => (cellOf(r).grant?.channelIds.length ?? 0) === 0);
  const scopedMap = new Map<string, GridView["rows"]>();
  for (const r of moreRows) { const ids = cellOf(r).grant?.channelIds ?? []; if (ids.length === 0) continue; const key = [...ids].sort().join(","); if (!scopedMap.has(key)) scopedMap.set(key, []); scopedMap.get(key)!.push(r); }
  const scopedGroups = [...scopedMap.entries()].map(([key, rows]) => ({ ids: key.split(","), rows })).sort((a, b) => scopeHeading(a.ids, view.channels).localeCompare(scopeHeading(b.ids, view.channels)));
  const hasScoped = scopedGroups.length > 0;

  if (gridView) return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between" }}><strong>All audiences · grid</strong><button className="btn ghost sm" onClick={() => setGridView(false)}>List view</button></div>
      <PolicyGrid view={view} />
    </div>
  );

  const Row = ({ r }: { r: GridView["rows"][number] }) => { const c = cellOf(r); return (
    <button className={`mp-seesmore-row${c.kind === "full_raw" ? " fullraw" : ""}`} onClick={() => setPopover({ editCode: r.code })}>
      <div className="stack" style={{ gap: 2, flex: 1, textAlign: "left" }}>
        <span className="cell-primary">{r.displayName}</span>
        <span className="mono cell-sub">{r.baseline.example} → {c.example}</span>
        {c.kind === "full_raw" && <span className="row cell-sub" style={{ gap: 4, color: "var(--yellow-700, #b45309)" }}><AlertTriangle size={12} /> Full raw value.{c.reason ? ` Reason: ${c.reason}` : ""}</span>}
      </div>
      <span className="link-btn" role="button" onClick={(e) => { e.stopPropagation(); start(async () => { await setGrantAction(vid, audienceId, r.code, null); router.refresh(); }); }}>Remove</span>
    </button>
  ); };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div className="stack" style={{ gap: 2 }}>
          <h3 style={{ margin: 0 }}>What {audienceLabel} sees</h3>
          <span className="cell-sub">{audienceLabel} sees what everyone sees, except the fields below.</span>
        </div>
        <div className="row" style={{ gap: 12, alignItems: "center" }}>
          <PreviewDrawer draft={view} live={liveView} label={`See as ${audienceLabel}`} startVersion="draft" startAudience={audienceLabel} />
          <button className="link-btn" onClick={() => setManageCh(true)}>Manage channels</button>
          <button className="btn ghost sm" onClick={() => setGridView(true)}>Grid view</button>
        </div>
      </div>

      {moreRows.length === 0 ? (
        <p className="cell-sub">No exceptions yet. {audienceLabel} sees what everyone sees. For example: fraud investigators seeing a full mobile number, or branch managers seeing loan account numbers only in the mobile app.</p>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          {anyGroup.length > 0 && (
            <div className="stack" style={{ gap: 4 }}>
              <div className="mp-group-h">{hasScoped ? "Sees more everywhere" : "Sees more"}</div>
              <div className="mp-seesmore">{anyGroup.map((r) => <Row key={r.code} r={r} />)}</div>
            </div>
          )}
          {scopedGroups.map((g) => (
            <div key={g.ids.join(",")} className="stack" style={{ gap: 4 }}>
              <div className="mp-group-h">{scopeHeading(g.ids, view.channels)}</div>
              <div className="mp-seesmore">{g.rows.map((r) => <Row key={r.code} r={r} />)}</div>
            </div>
          ))}
        </div>
      )}

      <div><button className="btn" onClick={() => setPopover({})}><Plus size={14} /> Let {audienceLabel} see more of…</button></div>

      <div className="mp-samecollapse">
        <button className="mp-catgroup-head" onClick={() => setSameOpen((o) => !o)}>{sameOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<strong>Same as everyone · {sameRows.length} fields</strong></button>
        {sameOpen && <div className="table-wrap"><table className="dtable compact"><tbody>
          {sameRows.map((r) => { const c = cellOf(r); return <tr key={r.code}><td>{r.displayName}</td><td className="mono cell-sub">{r.baseline.example}</td><td>{c.kind === "locked" && <span className="row" style={{ gap: 4 }}><Lock size={11} /> legal limit</span>}</td></tr>; })}
        </tbody></table></div>}
      </div>

      {popover && <SeeMorePopover view={view} vid={vid} audienceId={audienceId} audienceLabel={audienceLabel} editCode={popover.editCode} onManageChannels={() => { setPopover(null); setManageCh(true); }} onClose={() => setPopover(null)} onSaved={() => { setPopover(null); router.refresh(); }} />}
      {manageCh && <ManageChannelsModal draftId={vid} onClose={() => setManageCh(false)} />}
    </div>
  );
}

function SeeMorePopover({ view, vid, audienceId, audienceLabel, editCode, onManageChannels, onClose, onSaved }: { view: GridView; vid: string; audienceId: string; audienceLabel: string; editCode?: string; onManageChannels: () => void; onClose: () => void; onSaved: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const cellOf = (code: string) => view.rows.find((r) => r.code === code)?.audiences.find((c) => c.audienceId === audienceId);
  const editCell = editCode ? cellOf(editCode) : null;

  const eligible = view.rows.filter((r) => { const c = r.audiences.find((x) => x.audienceId === audienceId)!; return !r.regulated && r.status === "ready" && c.kind === "same"; });
  const lockedFields = view.rows.filter((r) => r.regulated && r.status !== "not_used");
  const [q, setQ] = useState("");
  const firstPick = editCode ?? eligible[0]?.code ?? "";
  const [code, setCode] = useState(firstPick);
  const picked = view.rows.find((r) => r.code === code) ?? null;

  const moreChoices = (r: GridView["rows"][number]) => MASK_CHOICES.filter((c) => strengthOf({ family: c.key, params: defaultParamsForChoice(c.key) }, r.sampleValue) > strengthOf(r.baseline.masking, r.sampleValue)).map((c) => c.key);
  const choices = picked ? moreChoices(picked) : [];
  const [mode, setMode] = useState<"more" | "full_raw">(editCell?.grant?.fullRaw ? "full_raw" : "more");
  const [mask, setMask] = useState<Masking>(editCell?.grant && !editCell.grant.fullRaw ? { family: editCell.grant.family, params: editCell.grant.params } : { family: (choices[0] ?? "partial"), params: defaultParamsForChoice(choices[0] ?? "partial") });
  const [scopeAny, setScopeAny] = useState((editCell?.grant?.channelIds.length ?? 0) === 0);
  const [scopeIds, setScopeIds] = useState<string[]>(editCell?.grant?.channelIds ?? []);
  const [reason, setReason] = useState(editCell?.grant?.reason ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();

  const where = scopeAny ? "on any channel" : scopeIds.length === 0 ? "on the channels you choose" : "only on " + scopeIds.map((id) => view.channels.find((c) => c.id === id)?.label ?? id).join(scopeIds.length > 2 ? ", " : " and ");
  const sentence = !picked ? "Choose a field to start." : `${audienceLabel} will see ${picked.displayName} as ${mode === "full_raw" ? picked.sampleValue : renderValue(mask, picked.sampleValue)} ${where}.`;

  const save = () => {
    if (!picked) { setErr("Choose a field."); return; }
    if (mode === "full_raw" && !reason.trim()) { setErr("Add a reason. It is recorded with the change."); return; }
    if (!scopeAny && scopeIds.length === 0) { setErr("Choose at least one channel."); return; }
    start(async () => { await setGrantAction(vid, audienceId, picked.code, { visibility: mode, masking: mode === "more" ? mask : null, channelScope: scopeAny ? "ANY" : scopeIds, reason: mode === "full_raw" ? reason : undefined }); onSaved(); });
  };

  if (!mounted) return null;
  return createPortal(
    <div className="modal-scrim" onClick={onClose}>
      <div className="mp-pop mp-pop-center" style={{ width: 470 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="mp-pop-head"><strong>Let {audienceLabel} see more</strong><button className="icon-btn" onClick={onClose}><X size={14} /></button></div>
        <div className="mp-pop-body">
          <div className="stack" style={{ gap: 12 }}>
            <div className="mp-result" aria-live="polite">{sentence}</div>

            {/* Field */}
            {editCode ? <div className="fld"><span>Field</span><div className="cell-primary">{picked?.displayName}</div></div> : (
              <div className="fld"><span>Field</span>
                {eligible.length > 8 && <input className="input sm" placeholder="Search fields" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 6 }} />}
                <div className="mp-fieldpick">
                  {eligible.filter((r) => !q.trim() || (r.displayName + r.code).toLowerCase().includes(q.toLowerCase())).map((r) => (
                    <button key={r.code} className={`mp-fieldpick-item${code === r.code ? " on" : ""}`} onClick={() => { setCode(r.code); const mc = moreChoices(r); setMask({ family: (mc[0] ?? "partial"), params: defaultParamsForChoice(mc[0] ?? "partial") }); }}>{r.displayName} <span className="cell-sub mono">{r.baseline.example}</span></button>
                  ))}
                  {lockedFields.map((r) => <div key={r.code} className="mp-fieldpick-item locked"><Lock size={11} /> {r.displayName} <span className="cell-sub">Already at the legal limit</span></div>)}
                  {eligible.length === 0 && lockedFields.length === 0 && <p className="cell-sub" style={{ padding: 8 }}>Every field {audienceLabel} can see more of already has an exception.</p>}
                </div>
              </div>
            )}

            {/* How much */}
            {picked && (
              <div className="fld"><span>How much</span>
                <div className="stack" style={{ gap: 6 }}>
                  <label className="mp-radio"><input type="radio" checked={mode === "more"} onChange={() => setMode("more")} /> Show more</label>
                  {mode === "more" && choices.length > 0 && <MaskEditor value={mask} onChange={setMask} sample={picked.sampleValue} allow={choices} />}
                  <label className="mp-radio"><input type="radio" checked={mode === "full_raw"} onChange={() => setMode("full_raw")} /> <span style={{ color: "var(--yellow-700, #b45309)" }}>Full raw value</span></label>
                  {mode === "full_raw" && <input className="input sm" placeholder={`Why does ${audienceLabel} need the full value?`} value={reason} onChange={(e) => setReason(e.target.value)} />}
                </div>
              </div>
            )}

            {/* Where */}
            {picked && (
              <div className="fld"><span>Where</span>
                <div className="mp-segment"><button className={scopeAny ? "on" : ""} onClick={() => setScopeAny(true)}>Any channel</button><button className={!scopeAny ? "on" : ""} onClick={() => setScopeAny(false)}>Only on…</button></div>
                {scopeAny ? <span className="cell-sub">Applies on every channel, including when an application doesn&rsquo;t say which one.</span> : (
                  view.channels.length === 0 ? <div className="stack" style={{ gap: 6 }}><span className="cell-sub">No channels yet. Add one if this should apply in one place only, like the mobile app.</span><InlineAddChannel vid={vid} onAdded={(id) => { setScopeIds((s) => [...s, id]); onSaved(); }} /></div>
                    : <div className="stack" style={{ gap: 4 }}>
                      {view.channels.map((c) => <label key={c.id} className="mp-radio"><input type="checkbox" checked={scopeIds.includes(c.id)} onChange={() => setScopeIds((s) => s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id])} /> {c.label} <span className="cell-sub mono">{c.identifier}</span></label>)}
                      <InlineAddChannel vid={vid} onAdded={(id) => { setScopeIds((s) => [...s, id]); onSaved(); }} />
                    </div>
                )}
              </div>
            )}
            {err && <span className="cell-sub" style={{ color: "var(--red)" }}>{err}</span>}
          </div>
        </div>
        <div className="mp-pop-foot">
          <button className="link-btn" onClick={onManageChannels}>Manage channels</button>
          <div className="row" style={{ gap: 6 }}><button className="btn ghost sm" onClick={onClose}>Cancel</button><button className="btn primary sm" onClick={save}>{editCode ? "Save changes" : "Save"}</button></div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function InlineAddChannel({ vid, onAdded }: { vid: string; onAdded: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(""); const [ident, setIdent] = useState(""); const [, start] = useTransition();
  if (!open) return <button className="link-btn" onClick={() => setOpen(true)}><Plus size={12} /> Add channel</button>;
  return (
    <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
      <input className="input sm" placeholder="Channel name" value={name} onChange={(e) => { setName(e.target.value); setIdent(e.target.value.toLowerCase().replace(/\s+/g, "-")); }} />
      <input className="input sm mono" placeholder="identifier" value={ident} onChange={(e) => setIdent(e.target.value)} />
      <button className="btn sm" disabled={!name.trim() || !ident.trim()} onClick={() => start(async () => { const r = await addChannelAction(vid, name, ident); if (r.ok && r.id) onAdded(r.id); })}>Add</button>
    </div>
  );
}
