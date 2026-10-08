"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { X, Search } from "lucide-react";
import { getPurposePickerAction, addExistingPurposeAction } from "@/app/actions/purposes";
import type { PurposePickerData } from "@/lib/engines/purposes";

/** SCREEN 5a — Add purpose popover (approved + in-progress purposes). */
export function AddPurposePopover({ activityId, anchor, onClose, onAdded, onCreate }: {
  activityId: string; anchor: { top: number; left: number }; onClose: () => void; onAdded: (id: string, name: string) => void; onCreate: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [m, setM] = useState(false);
  const [q, setQ] = useState("");
  const [data, setData] = useState<PurposePickerData | null>(null);
  const [, start] = useTransition();
  useEffect(() => { setM(true); getPurposePickerAction(activityId).then(setData); const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }; document.addEventListener("mousedown", c); return () => document.removeEventListener("mousedown", c); }, [activityId, onClose]);
  if (!m) return null;

  const add = (id: string, name: string) => start(async () => { const r = await addExistingPurposeAction(activityId, id); if (r.ok) onAdded(id, name); });
  const filt = (rows: PurposePickerData["approved"]) => rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));
  const Group = ({ title, rows }: { title: string; rows: PurposePickerData["approved"] }) => filt(rows).length === 0 ? null : (
    <div className="pa-pick-group"><div className="cell-sub pa-pick-h">{title} <span className="tnum">{filt(rows).length}</span></div>
      {filt(rows).map((r) => (
        <button key={r.id} className="pa-pick-row" disabled={r.added} onClick={() => add(r.id, r.name)}>
          <span className="stack" style={{ gap: 1 }}><span>{r.name}</span><span className="cell-sub">{r.sub}</span></span>
          {r.added && <span className="cell-sub">Added</span>}
        </button>
      ))}
    </div>
  );

  return createPortal(
    <div ref={ref} className="mp-pop" style={{ position: "fixed", top: Math.max(8, anchor.top), left: Math.max(8, anchor.left), width: 400, maxHeight: "70vh", display: "flex", flexDirection: "column" }}>
      <div className="mp-pop-head"><strong>Add a purpose</strong><button className="icon-btn" onClick={onClose}><X size={14} /></button></div>
      <div className="mp-pop-body" style={{ overflowY: "auto" }}>
        <div className="inv-search" style={{ marginBottom: 8 }}><Search size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search purposes" aria-label="Search purposes" /></div>
        {!data ? <span className="cell-sub">Loading…</span> : <>
          <Group title="Approved" rows={data.approved} />
          <Group title="Waiting for DPO" rows={data.waiting} />
          <Group title="Your drafts" rows={data.drafts} />
          <Group title="Needs changes" rows={data.changes} />
          {[...data.approved, ...data.waiting, ...data.drafts, ...data.changes].length === 0 && <span className="cell-sub">No purposes yet.</span>}
        </>}
      </div>
      <div className="mp-pop-foot"><button className="link-btn" onClick={onCreate}>Can&rsquo;t find it? Create a purpose</button></div>
    </div>, document.body);
}
