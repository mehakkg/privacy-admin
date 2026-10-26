"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, X, AlertTriangle, MoreHorizontal, Lock } from "lucide-react";
import { FIDUCIARY_PEOPLE } from "@/lib/activities/fiduciaries";
import { addEntityAction, editFiduciaryAction } from "@/app/actions/entities";

export interface FiduciaryRow {
  id: string; name: string; legalName: string | null; usedBy: number;
  short: string; cin: string; officeCity: string; officeState: string; website: string;
  dpo: string; grievanceContact: string; publishedEmail: string;
  sdfNotified: boolean; sdfNotifiedOn: string | null; notificationRef: string | null;
}

/**
 * Fiduciaries (Master spec Part C) — Settings › Organization › Fiduciaries tab.
 * One table of the legal entities data is attributed to, with the contacts the
 * law requires. SDF status is view-only unless acting as the DPO.
 */
export function FiduciariesManager({ rows, role, openAdd }: { rows: FiduciaryRow[]; role: string; openAdd?: boolean }) {
  const router = useRouter();
  const isDpo = role === "dpo";
  const [q, setQ] = useState("");
  const [add, setAdd] = useState(!!openAdd);
  const [edit, setEdit] = useState<FiduciaryRow | null>(null);
  const [menu, setMenu] = useState<string | null>(null);

  const sdfCount = rows.filter((r) => r.sdfNotified).length;
  const filtered = rows.filter((r) => !q || `${r.name} ${r.short} ${r.cin} ${r.dpo}`.toLowerCase().includes(q.toLowerCase()));
  const allShorts = rows.map((r) => r.short.toUpperCase());

  if (rows.length === 0) {
    return (
      <div className="inv-noresult" style={{ textAlign: "center", padding: "40px 16px" }}>
        <p style={{ margin: "0 0 12px" }}>Add your first fiduciary. Every activity belongs to one.</p>
        <button className="btn primary" onClick={() => setAdd(true)}>Add fiduciary</button>
        {add && <FiduciaryDrawer mode="add" isDpo={isDpo} allShorts={allShorts} onClose={() => setAdd(false)} onDone={() => { setAdd(false); router.refresh(); }} />}
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="cell-sub"><strong className="tnum">{rows.length}</strong> {rows.length === 1 ? "fiduciary" : "fiduciaries"} · <strong className="tnum">{sdfCount}</strong> notified as Significant Data Fiduciary</div>
        <button className="btn primary" onClick={() => setAdd(true)}>Add fiduciary</button>
      </div>

      <div className="inv-search" style={{ flex: "0 0 auto", maxWidth: 280 }}><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search fiduciary" aria-label="Search fiduciary" /></div>

      <table className="inv-table">
        <thead><tr>
          <th>Fiduciary</th><th>CIN</th><th>Registered office</th><th>SDF status</th><th>DPO</th><th>Grievance contact</th><th>Activities</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id} className="inv-row">
              <td className="cell-primary">
                {r.name}
                <span className="chip" style={{ marginLeft: 8, fontSize: 10.5 }}>{r.short}</span>
                {!r.publishedEmail && (
                  <span className="nav-warn" role="img" aria-label="Rule 9 contact missing" style={{ marginLeft: 8, color: "var(--yellow-700, #b45309)", display: "inline-flex", verticalAlign: "middle" }} title="Rule 9 contact missing"><AlertTriangle size={14} /></span>
                )}
              </td>
              <td className="cell-sub mono">{r.cin || "—"}</td>
              <td className="cell-sub">{r.officeCity ? `${r.officeCity}, ${r.officeState}` : "—"}</td>
              <td>{r.sdfNotified ? <span className="cell-sub">Notified{r.sdfNotifiedOn ? ` on ${r.sdfNotifiedOn}` : ""}</span> : <span className="cell-sub">Not notified</span>}</td>
              <td className="cell-sub">{r.dpo || "—"}</td>
              <td className="cell-sub">{r.grievanceContact || "—"}</td>
              <td><Link className="link-btn" href={`/data-map/processing-activities?tab=register&fiduciary=${r.id}`}><span className="tnum">{r.usedBy}</span></Link></td>
              <td><span className="rchip success">Active</span></td>
              <td style={{ position: "relative" }}>
                <button className="icon-btn" aria-label="Actions" onClick={() => setMenu(menu === r.id ? null : r.id)}><MoreHorizontal size={16} /></button>
                {menu === r.id && (
                  <>
                    <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setMenu(null)} />
                    <div className="popover-menu" style={{ position: "absolute", right: 0, top: "100%", zIndex: 11, minWidth: 160 }}>
                      <button className="pm-item" onClick={() => { setMenu(null); setEdit(r); }}>Edit</button>
                      <button className="pm-item" disabled title={r.usedBy > 0 ? `Move or archive its ${r.usedBy} ${r.usedBy === 1 ? "activity" : "activities"} first.` : undefined}>Deactivate</button>
                    </div>
                  </>
                )}
              </td>
            </tr>
          ))}
          {filtered.length === 0 && <tr><td colSpan={9} className="cell-sub" style={{ padding: 16 }}>No fiduciaries match.</td></tr>}
        </tbody>
      </table>

      {add && <FiduciaryDrawer mode="add" isDpo={isDpo} allShorts={allShorts} onClose={() => setAdd(false)} onDone={() => { setAdd(false); router.refresh(); }} />}
      {edit && <FiduciaryDrawer mode="edit" row={edit} isDpo={isDpo} allShorts={allShorts.filter((s) => s !== edit.short.toUpperCase())} onClose={() => setEdit(null)} onDone={() => { setEdit(null); router.refresh(); }} />}
    </div>
  );
}

function FiduciaryDrawer({ mode, row, isDpo, allShorts, onClose, onDone }: {
  mode: "add" | "edit"; row?: FiduciaryRow; isDpo: boolean; allShorts: string[]; onClose: () => void; onDone: () => void;
}) {
  const [legalName, setLegalName] = useState(row?.name ?? "");
  const [short, setShort] = useState(row?.short ?? "");
  const [cin, setCin] = useState(row?.cin ?? "");
  const [office, setOffice] = useState(row ? [row.officeCity, row.officeState].filter(Boolean).join(", ") : "");
  const [website, setWebsite] = useState(row?.website ?? "");
  const [dpo, setDpo] = useState(row?.dpo ?? "");
  const [grievance, setGrievance] = useState(row?.grievanceContact ?? "");
  const [email, setEmail] = useState(row?.publishedEmail ?? "");
  const [sdfNotified, setSdfNotified] = useState(!!row?.sdfNotified);
  const [notifiedOn, setNotifiedOn] = useState(row?.sdfNotifiedOn ?? "");
  const [ref, setRef] = useState(row?.notificationRef ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);

  const validate = (): string | null => {
    if (!legalName.trim()) return "A legal name is required.";
    const s = short.trim().toUpperCase();
    if (!s) return "A short name is required.";
    if (s.length > 5) return "Short name can be at most 5 characters.";
    if (allShorts.includes(s)) return `Short name “${s}” is already used by another fiduciary.`;
    if (!email.trim()) return "A published contact email is required (Rule 9).";
    if (sdfNotified && !dpo.trim()) return "A Significant Data Fiduciary must appoint a DPO (Section 10(2)(a)).";
    return null;
  };

  const submit = () => {
    const v = validate(); if (v) { setErr(v); return; }
    start(async () => {
      const sdfStatus = sdfNotified ? "sdf" as const : "not_assessed" as const;
      const r = mode === "add"
        ? await addEntityAction(legalName, legalName)
        : await editFiduciaryAction(row!.id, { name: legalName, legalName, sdfStatus });
      if (r.ok) onDone(); else setErr(r.error ?? "Couldn’t save.");
    });
  };

  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mp-drawer" role="dialog" aria-modal="true" aria-label={mode === "add" ? "Add fiduciary" : "Edit fiduciary"} style={{ width: 480 }}>
        <div className="mp-drawer-head"><strong>{mode === "add" ? "Add fiduciary" : "Edit fiduciary"}</strong><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="mp-drawer-body stack" style={{ gap: 12, overflow: "auto", padding: 16 }}>
          <label className="fld"><span>Legal name</span><input ref={firstRef} className="input" value={legalName} onChange={(e) => { setLegalName(e.target.value); setErr(null); }} /></label>
          <label className="fld"><span>Short name</span><input className="input" maxLength={5} value={short} onChange={(e) => { setShort(e.target.value.toUpperCase()); setErr(null); }} style={{ textTransform: "uppercase" }} /><span className="cell-sub">Shown as a tag wherever more than one fiduciary appears.</span></label>
          <label className="fld"><span>CIN</span><input className="input mono" value={cin} onChange={(e) => setCin(e.target.value)} placeholder="U65999MH2011PLC000001" /></label>
          <label className="fld"><span>Registered office</span><input className="input" value={office} onChange={(e) => setOffice(e.target.value)} placeholder="City, State" /></label>
          <label className="fld"><span>Website</span><input className="input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" /></label>
          <label className="fld"><span>DPO</span><select className="input" value={dpo} onChange={(e) => { setDpo(e.target.value); setErr(null); }}><option value="">Choose…</option>{FIDUCIARY_PEOPLE.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
          <label className="fld"><span>Grievance contact</span><select className="input" value={grievance} onChange={(e) => setGrievance(e.target.value)}><option value="">Choose…</option>{FIDUCIARY_PEOPLE.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
          <label className="fld"><span>Published contact email</span><input className="input" value={email} onChange={(e) => { setEmail(e.target.value); setErr(null); }} placeholder="dpo@example.in" /><span className="cell-sub">Rule 9: the business contact of your DPO, or of a person who can answer questions about processing, must be published on your website or app and included in every rights response.</span></label>

          <div className="fld">
            <span className="row" style={{ gap: 6, alignItems: "center" }}>SDF status {!isDpo && <span className="nav-lock" title="Set by DPO" style={{ display: "inline-flex", color: "var(--text-3)" }}><Lock size={12} /> Set by DPO</span>}</span>
            <div className="stack" style={{ gap: 6, marginTop: 4 }}>
              <label className="row" style={{ gap: 8 }}><input type="radio" name="sdf" disabled={!isDpo} checked={!sdfNotified} onChange={() => { setSdfNotified(false); setErr(null); }} /> Not notified</label>
              <label className="row" style={{ gap: 8 }}><input type="radio" name="sdf" disabled={!isDpo} checked={sdfNotified} onChange={() => { setSdfNotified(true); setErr(null); }} /> Notified as SDF</label>
              {sdfNotified && (
                <div className="stack" style={{ gap: 8, paddingLeft: 24 }}>
                  <label className="fld"><span>Notified on</span><input className="input" type="date" disabled={!isDpo} value={notifiedOn} onChange={(e) => setNotifiedOn(e.target.value)} /></label>
                  <label className="fld"><span>Notification reference</span><input className="input" disabled={!isDpo} value={ref} onChange={(e) => setRef(e.target.value)} /></label>
                </div>
              )}
            </div>
            <span className="cell-sub">SDF status is notified by the Central Government; it isn’t self-assessed.</span>
          </div>

          {err && <div className="notice warn" style={{ margin: 0 }}>{err}</div>}
        </div>
        <div className="mp-drawer-foot row" style={{ justifyContent: "flex-end", gap: 8, padding: 12, borderTop: "1px solid var(--border)" }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={pending} onClick={submit}>{mode === "add" ? "Add fiduciary" : "Save"}</button>
        </div>
      </div>
    </div>, document.body);
}
