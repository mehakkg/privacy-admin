"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { channelUsageAction, renameChannelAction, changeChannelIdentifierAction, removeChannelAction, addChannelAction } from "@/app/actions/maskingpolicy";
import type { ChannelUsage } from "@/lib/engines/maskingpolicy";

/** D — Manage channels. Rename, change identifier (with warning), remove (with
 *  grant cleanup), add. Opens from the workspace ⋯ and the "Only on…" foot. */
export function ManageChannelsModal({ draftId, onClose }: { draftId: string; onClose: () => void }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [channels, setChannels] = useState<ChannelUsage[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [, start] = useTransition();
  const reload = () => channelUsageAction(draftId).then(({ channels }) => setChannels(channels));
  useEffect(() => { setMounted(true); reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return null;
  return createPortal(
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal std-modal md" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Manage channels">
        <div className="std-modal-head"><h3 style={{ margin: 0 }}>Manage channels</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="std-modal-body">
          {channels === null ? <p className="cell-sub">Loading…</p> : channels.length === 0 && !adding ? (
            <div className="stack" style={{ gap: 10 }}>
              <p className="cell-sub" style={{ margin: 0 }}>No channels yet. Without channels, a rule applies on any channel. Add one only if an audience should see more in one place, like the mobile app.</p>
              <div><button className="btn" onClick={() => setAdding(true)}><Plus size={13} /> Add channel</button></div>
            </div>
          ) : (
            <div className="stack" style={{ gap: 4 }}>
              {channels.map((c) => <ChannelRow key={c.id} c={c} onChanged={() => { reload(); router.refresh(); }} />)}
              {adding ? <AddRow draftId={draftId} onDone={() => { setAdding(false); reload(); router.refresh(); }} /> : <button className="mp-fieldpick-item" onClick={() => setAdding(true)}><Plus size={13} /> Add channel</button>}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ChannelRow({ c, onChanged }: { c: ChannelUsage; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "rename" | "ident" | "remove">("view");
  const [label, setLabel] = useState(c.label); const [ident, setIdent] = useState(c.identifier);
  const [, start] = useTransition();
  return (
    <div className="mp-chrow">
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <button className="mp-catgroup-head" style={{ flex: 1 }} onClick={() => setOpen((o) => !o)}>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <strong>{c.label}</strong><span className="cell-sub mono">{c.identifier}</span><span className="cell-sub">Used by {c.grants.length} grant{c.grants.length === 1 ? "" : "s"}</span>
        </button>
        <button className="link-btn" onClick={() => setMode("ident")}>Change identifier</button>
        <button className="link-btn" style={{ color: "var(--red)" }} onClick={() => setMode("remove")}>Remove</button>
      </div>
      {open && c.grants.length > 0 && <div className="stack" style={{ gap: 2, paddingLeft: 22, marginTop: 4 }}>{c.grants.map((g, i) => <span key={i} className="cell-sub">{g.audience} · {g.field}</span>)}</div>}
      {mode === "rename" && <div className="row" style={{ gap: 6, marginTop: 6 }}><input className="input sm" value={label} onChange={(e) => setLabel(e.target.value)} /><button className="btn primary sm" onClick={() => start(async () => { await renameChannelAction(c.id, label); setMode("view"); onChanged(); })}>Save</button></div>}
      {mode === "ident" && <div className="stack" style={{ gap: 4, marginTop: 6 }}><span className="cell-sub" style={{ color: "var(--yellow-700, #b45309)" }}>Your applications must send the new identifier. Until they do, grants on this channel don&rsquo;t match and people see what everyone sees.</span><div className="row" style={{ gap: 6 }}><input className="input sm mono" value={ident} onChange={(e) => setIdent(e.target.value)} /><button className="btn primary sm" onClick={() => start(async () => { await changeChannelIdentifierAction(c.id, ident); setMode("view"); onChanged(); })}>Save</button><button className="btn ghost sm" onClick={() => setMode("view")}>Cancel</button></div></div>}
      {mode === "remove" && <div className="stack" style={{ gap: 4, marginTop: 6 }}><span>Remove {c.label}? {c.onlyHere} grant{c.onlyHere === 1 ? "" : "s"} apply only on this channel, so they&rsquo;ll be removed too. People will see what everyone sees instead.</span><div className="row" style={{ gap: 6 }}><button className="btn danger sm" onClick={() => start(async () => { await removeChannelAction(c.id); setMode("view"); onChanged(); })}>Remove channel{c.onlyHere ? ` and ${c.onlyHere} grants` : ""}</button><button className="btn ghost sm" onClick={() => setMode("view")}>Cancel</button></div></div>}
    </div>
  );
}

function AddRow({ draftId, onDone }: { draftId: string; onDone: () => void }) {
  const [label, setLabel] = useState(""); const [ident, setIdent] = useState(""); const [, start] = useTransition();
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap", padding: "8px 0" }}>
      <input className="input sm" placeholder="Channel name" value={label} onChange={(e) => setLabel(e.target.value)} />
      <input className="input sm mono" placeholder="Identifier" value={ident} onChange={(e) => setIdent(e.target.value)} />
      <button className="btn primary sm" disabled={!label.trim() || !ident.trim()} onClick={() => start(async () => { await addChannelAction(draftId, label, ident); onDone(); })}>Add</button>
    </div>
  );
}
