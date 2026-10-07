"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X, Plus, ChevronDown, ChevronRight, Lock, AlertTriangle, ArrowUp, ArrowDown } from "lucide-react";
import { MaskEditor } from "@/components/maskingpolicy/MaskEditor";
import { PolicyGrid } from "@/components/maskingpolicy/PolicyGrid";
import { PreviewDrawer } from "@/components/maskingpolicy/PreviewDrawer";
import { ManageChannelsModal } from "@/components/maskingpolicy/ManageChannelsModal";
import { defaultParamsForChoice, MASK_CHOICES, strengthOf, renderValue, type Masking } from "@/lib/maskingpolicy";
import type { GridView } from "@/lib/engines/maskingpolicy";
import { setGrantAction, addChannelAction } from "@/app/actions/maskingpolicy";

type Dir = "more" | "less";

function scopeHeading(ids: string[], channels: GridView["channels"]): string {
  if (ids.length === 0) return "Everywhere";
  const names = ids.map((id) => channels.find((c) => c.id === id)?.label ?? id);
  return "Only on " + (names.length === 1 ? names[0] : names.slice(0, -1).join(", ") + " and " + names[names.length - 1]);
}

export function AudiencePane({ view, liveView, audienceId, audienceLabel }: { view: GridView; liveView: GridView | null; audienceId: string; audienceLabel: string }) {
  const router = useRouter();
  const vid = view.version.id;
  const [popover, setPopover] = useState<null | { dir: Dir; editCode?: string }>(null);
  const [manageCh, setManageCh] = useState(false);
  const [gridView, setGridView] = useState(false);
  const [sameOpen, setSameOpen] = useState(false);
  const [, start] = useTransition();

  const cellOf = (r: GridView["rows"][number]) => r.audiences.find((c) => c.audienceId === audienceId)!;
  const moreRows = view.rows.filter((r) => { const c = cellOf(r); return c.kind === "more" || c.kind === "full_raw"; });
  const lessRows = view.rows.filter((r) => cellOf(r).kind === "less");
  const nlnRows = view.rows.filter((r) => cellOf(r).noLongerNeeded);
  const sameRows = view.rows.filter((r) => { const c = cellOf(r); return (c.kind === "same" || c.kind === "locked") && !c.grant; });

  const groupRows = (rows: GridView["rows"]) => {
    const any = rows.filter((r) => (cellOf(r).grant?.channelIds.length ?? 0) === 0);
    const map = new Map<string, GridView["rows"]>();
    for (const r of rows) { const ids = cellOf(r).grant?.channelIds ?? []; if (!ids.length) continue; const k = [...ids].sort().join(","); if (!map.has(k)) map.set(k, []); map.get(k)!.push(r); }
    const scoped = [...map.entries()].map(([k, rs]) => ({ ids: k.split(","), rows: rs })).sort((a, b) => scopeHeading(a.ids, view.channels).localeCompare(scopeHeading(b.ids, view.channels)));
    return { any, scoped, hasScoped: scoped.length > 0 };
  };

  if (gridView) return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between" }}><strong>All audiences · grid</strong><button className="btn ghost sm" onClick={() => setGridView(false)}>List view</button></div>
      <PolicyGrid view={view} />
    </div>
  );

  const Row = ({ r, dir }: { r: GridView["rows"][number]; dir: Dir }) => { const c = cellOf(r); return (
    <div className={`mp-seesmore-row${c.kind === "full_raw" ? " fullraw" : ""}`}>
      <button className="mp-exrow-main" onClick={() => setPopover({ dir, editCode: r.code })}>
        <span className="cell-primary" style={{ flex: 1, textAlign: "left" }}>{r.displayName}</span>
        <span className="mono cell-sub">{r.baseline.example} → {c.example}</span>
      </button>
      <span className={`mp-dirtag ${dir}`}>{dir === "more" ? <ArrowUp size={12} /> : <ArrowDown size={12} />} {dir === "more" ? "More" : "Less"}</span>
      <button className="link-btn" onClick={() => start(async () => { await setGrantAction(vid, audienceId, r.code, null); router.refresh(); })}>Remove</button>
      {c.kind === "full_raw" && <div className="mp-exrow-note cell-sub" style={{ color: "var(--yellow-700, #b45309)" }}><AlertTriangle size={12} /> Full raw value.{c.reason ? ` Reason: ${c.reason}` : ""}</div>}
      {dir === "more" && c.overlaps.length > 0 && <div className="mp-exrow-note cell-sub">People who also hold {c.overlaps.join(", ")} see {c.overlaps.length ? "this hidden" : "less of this"}. Restrictions win.</div>}
    </div>
  ); };

  const Section = ({ title, rows, dir }: { title: string; rows: GridView["rows"]; dir: Dir }) => {
    if (rows.length === 0) return null;
    const g = groupRows(rows);
    return (
      <div className="stack" style={{ gap: 8 }}>
        <div className="mp-group-h">{title}</div>
        {g.any.length > 0 && <div className="stack" style={{ gap: 4 }}>{g.hasScoped && <div className="cell-sub mp-subhead">Everywhere</div>}<div className="mp-seesmore">{g.any.map((r) => <Row key={r.code} r={r} dir={dir} />)}</div></div>}
        {g.scoped.map((grp) => <div key={grp.ids.join(",")} className="stack" style={{ gap: 4 }}><div className="cell-sub mp-subhead">{scopeHeading(grp.ids, view.channels)}</div><div className="mp-seesmore">{grp.rows.map((r) => <Row key={r.code} r={r} dir={dir} />)}</div></div>)}
      </div>
    );
  };

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

      {moreRows.length === 0 && lessRows.length === 0 && nlnRows.length === 0 ? (
        <p className="cell-sub">No exceptions yet. {audienceLabel} sees what everyone sees.</p>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          <Section title="Sees more than everyone" rows={moreRows} dir="more" />
          <Section title="Sees less than everyone" rows={lessRows} dir="less" />
          {nlnRows.length > 0 && (
            <div className="stack" style={{ gap: 4 }}>
              {nlnRows.map((r) => { const c = cellOf(r); return (
                <div key={r.code} className="mp-seesmore-row">
                  <span style={{ flex: 1 }}>{r.displayName} <span className="mono cell-sub">{r.baseline.example} → {c.example}</span></span>
                  <span className="cell-sub">No longer needed. Same as everyone now.</span>
                  <button className="link-btn" onClick={() => start(async () => { await setGrantAction(vid, audienceId, r.code, null); router.refresh(); })}>Remove</button>
                </div>
              ); })}
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => setPopover({ dir: "more" })}><Plus size={14} /> Let {audienceLabel} see more of…</button>
        <button className="btn" onClick={() => setPopover({ dir: "less" })}><Plus size={14} /> Restrict what {audienceLabel} sees…</button>
      </div>

      <div className="mp-samecollapse">
        <button className="mp-catgroup-head" onClick={() => setSameOpen((o) => !o)}>{sameOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<strong>Same as everyone · {sameRows.length} fields</strong></button>
        {sameOpen && <div className="table-wrap"><table className="dtable compact"><tbody>
          {sameRows.map((r) => <tr key={r.code}><td>{r.displayName}</td><td className="mono cell-sub">{r.baseline.example}</td><td className="cell-sub">Same</td></tr>)}
        </tbody></table></div>}
      </div>

      {popover && <ExceptionPopover view={view} vid={vid} audienceId={audienceId} audienceLabel={audienceLabel} dir={popover.dir} editCode={popover.editCode} onManageChannels={() => { setPopover(null); setManageCh(true); }} onClose={() => setPopover(null)} onSaved={() => { setPopover(null); router.refresh(); }} />}
      {manageCh && <ManageChannelsModal draftId={vid} onClose={() => setManageCh(false)} />}
    </div>
  );
}

function ExceptionPopover({ view, vid, audienceId, audienceLabel, dir, editCode, onManageChannels, onClose, onSaved }: { view: GridView; vid: string; audienceId: string; audienceLabel: string; dir: Dir; editCode?: string; onManageChannels: () => void; onClose: () => void; onSaved: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const less = dir === "less";
  const cellOf = (code: string) => view.rows.find((r) => r.code === code)?.audiences.find((c) => c.audienceId === audienceId);
  const editCell = editCode ? cellOf(editCode) : null;

  const levelsFor = (r: GridView["rows"][number]) => {
    const bs = strengthOf(r.baseline.masking, r.sampleValue);
    return MASK_CHOICES.filter((c) => { const s = strengthOf({ family: c.key, params: defaultParamsForChoice(c.key) }, r.sampleValue); return less ? s < bs : s > bs; }).map((c) => c.key);
  };
  // eligible fields: not already an exception
  const eligibleAll = view.rows.filter((r) => { const c = r.audiences.find((x) => x.audienceId === audienceId)!; return r.status === "ready" && !c.grant; });
  const eligible = less ? eligibleAll.filter((r) => !r.baseline.hidden) : eligibleAll.filter((r) => !r.regulated);
  const locked = less ? view.rows.filter((r) => r.status === "ready" && r.baseline.hidden) : view.rows.filter((r) => r.regulated && r.status !== "not_used");

  const [q, setQ] = useState("");
  const [code, setCode] = useState(editCode ?? eligible[0]?.code ?? "");
  const picked = view.rows.find((r) => r.code === code) ?? null;
  const choices = picked ? levelsFor(picked) : [];
  const [mode, setMode] = useState<"lvl" | "full_raw">(editCell?.grant?.fullRaw ? "full_raw" : "lvl");
  const [mask, setMask] = useState<Masking>(
    editCell?.grant && !editCell.grant.fullRaw ? { family: editCell.grant.family, params: editCell.grant.params }
      : less ? { family: "full", params: defaultParamsForChoice("full") }
        : { family: (choices[0] ?? "partial"), params: defaultParamsForChoice(choices[0] ?? "partial") });
  const [scopeAny, setScopeAny] = useState((editCell?.grant?.channelIds.length ?? 0) === 0);
  const [scopeIds, setScopeIds] = useState<string[]>(editCell?.grant?.channelIds ?? []);
  const [reason, setReason] = useState(editCell?.grant?.reason ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();

  const where = scopeAny ? "on any channel" : scopeIds.length === 0 ? "on the channels you choose" : "only on " + scopeIds.map((id) => view.channels.find((c) => c.id === id)?.label ?? id).join(" and ");
  const exExample = mode === "full_raw" && picked ? picked.sampleValue : picked ? renderValue(mask, picked.sampleValue) : "";
  const sentence = !picked ? "Choose a field to start." : `${audienceLabel} will see ${picked.displayName} as ${exExample} ${where}${less ? `, down from ${picked.baseline.example}` : ""}.`;

  const save = () => {
    if (!picked) { setErr("Choose a field."); return; }
    if (!less && mode === "full_raw" && !reason.trim()) { setErr("Add a reason. It is recorded with the change."); return; }
    if (!scopeAny && scopeIds.length === 0) { setErr("Choose at least one channel."); return; }
    start(async () => {
      const r = await setGrantAction(vid, audienceId, picked.code, less
        ? { direction: "less", visibility: "restrict", masking: mask, channelScope: scopeAny ? "ANY" : scopeIds }
        : { direction: "more", visibility: mode === "full_raw" ? "full_raw" : "more", masking: mode === "full_raw" ? null : mask, channelScope: scopeAny ? "ANY" : scopeIds, reason: mode === "full_raw" ? reason : undefined });
      if (r.ok) onSaved(); else setErr(r.error ?? "Couldn't save.");
    });
  };

  if (!mounted) return null;
  return createPortal(
    <div className="modal-scrim" onClick={onClose}>
      <div className="mp-pop mp-pop-center" style={{ width: 470 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="mp-pop-head"><strong>{less ? `Restrict what ${audienceLabel} sees` : `Let ${audienceLabel} see more`}</strong><button className="icon-btn" onClick={onClose}><X size={14} /></button></div>
        <div className="mp-pop-body">
          <div className="stack" style={{ gap: 12 }}>
            <div className="mp-result" aria-live="polite">{sentence}</div>
            {editCode ? <div className="fld"><span>Field</span><div className="cell-primary">{picked?.displayName}</div></div> : (
              <div className="fld"><span>Field</span>
                {eligible.length > 8 && <input className="input sm" placeholder="Search fields" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 6 }} />}
                <div className="mp-fieldpick">
                  {eligible.filter((r) => !q.trim() || (r.displayName + r.code).toLowerCase().includes(q.toLowerCase())).map((r) => (
                    <button key={r.code} className={`mp-fieldpick-item${code === r.code ? " on" : ""}`} onClick={() => { setCode(r.code); const mc = levelsFor(r); setMask(less ? { family: "full", params: defaultParamsForChoice("full") } : { family: (mc[0] ?? "partial"), params: defaultParamsForChoice(mc[0] ?? "partial") }); }}>{r.displayName} <span className="cell-sub mono">{r.baseline.example}</span>{r.regulated && <span className="mp-tag" style={{ marginLeft: 6 }}>Protected by law</span>}</button>
                  ))}
                  {locked.map((r) => <div key={r.code} className="mp-fieldpick-item locked"><Lock size={11} /> {r.displayName} <span className="cell-sub">{less ? "Already hidden completely for everyone" : "Already at the legal limit"}</span></div>)}
                  {eligible.length === 0 && <p className="cell-sub" style={{ padding: 8 }}>Every field {audienceLabel} can {less ? "be restricted on" : "see more of"} already has an exception.</p>}
                </div>
              </div>
            )}
            {picked && (
              <div className="fld"><span>How much</span>
                {less ? <MaskEditor value={mask} onChange={setMask} sample={picked.sampleValue} allow={["partial", "full"]} /> : (
                  <div className="stack" style={{ gap: 6 }}>
                    <label className="mp-radio"><input type="radio" checked={mode === "lvl"} onChange={() => setMode("lvl")} /> Show more</label>
                    {mode === "lvl" && choices.length > 0 && <MaskEditor value={mask} onChange={setMask} sample={picked.sampleValue} allow={choices} />}
                    {!picked.regulated && <label className="mp-radio"><input type="radio" checked={mode === "full_raw"} onChange={() => setMode("full_raw")} /> <span style={{ color: "var(--yellow-700, #b45309)" }}>Full raw value</span></label>}
                    {mode === "full_raw" && <input className="input sm" placeholder={`Why does ${audienceLabel} need the full value?`} value={reason} onChange={(e) => setReason(e.target.value)} />}
                  </div>
                )}
              </div>
            )}
            {picked && (
              <div className="fld"><span>Where</span>
                <div className="mp-segment"><button className={scopeAny ? "on" : ""} onClick={() => setScopeAny(true)}>Any channel</button><button className={!scopeAny ? "on" : ""} onClick={() => setScopeAny(false)}>Only on…</button></div>
                {scopeAny ? <span className="cell-sub">Applies on every channel, including when an application doesn&rsquo;t say which one.</span> : (
                  view.channels.length === 0 ? <div className="stack" style={{ gap: 6 }}><span className="cell-sub">No channels yet. Add one if this should apply in one place only.</span><InlineAddChannel vid={vid} onAdded={(id) => { setScopeIds((s) => [...s, id]); onSaved(); }} /></div>
                    : <div className="stack" style={{ gap: 4 }}>{view.channels.map((c) => <label key={c.id} className="mp-radio"><input type="checkbox" checked={scopeIds.includes(c.id)} onChange={() => setScopeIds((s) => s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id])} /> {c.label}</label>)}<InlineAddChannel vid={vid} onAdded={(id) => setScopeIds((s) => [...s, id])} /></div>
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
