"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Lock, X, MoreHorizontal, AlertTriangle } from "lucide-react";
import type { PurposesView as View, PurposeRow } from "@/lib/engines/purposes";
import { createPurposeAction, editPurposeAction, submitPurposeAction, type PurposeInput } from "@/app/actions/purposes";

const CHIPS: { key: string; label: string; count: (c: View["counts"]) => number }[] = [
  { key: "needs_action", label: "Needs action", count: (c) => c.needs_action },
  { key: "pending", label: "Pending DPO", count: (c) => c.pending },
  { key: "approved", label: "Approved", count: (c) => c.approved },
  { key: "all", label: "All", count: (c) => c.all },
];

// Legal-basis picker (spec): Consent + the four common legitimate uses, then the
// rest behind "Show all legitimate uses".
const BASIS_OPTS: { value: string; label: string; basis: "consent" | "legitimate_use"; type: string | null; extra?: boolean }[] = [
  { value: "consent", label: "Consent (Section 6)", basis: "consent", type: null },
  { value: "7a", label: "Legitimate use: voluntarily provided (7(a))", basis: "legitimate_use", type: "Voluntarily provided (7(a))" },
  { value: "7i", label: "Legitimate use: employment (7(i))", basis: "legitimate_use", type: "Employment (7(i))" },
  { value: "7d", label: "Legitimate use: disclosure required by law (7(d))", basis: "legitimate_use", type: "Disclosure required by law (7(d))" },
  { value: "7e", label: "Legitimate use: court order (7(e))", basis: "legitimate_use", type: "Court order (7(e))" },
  { value: "7b", label: "Legitimate use: medical emergency (7(b))", basis: "legitimate_use", type: "Medical emergency (7(b))", extra: true },
  { value: "7c", label: "Legitimate use: epidemic / public health (7(c))", basis: "legitimate_use", type: "Public health (7(c))", extra: true },
  { value: "7f", label: "Legitimate use: disaster / public order (7(f))", basis: "legitimate_use", type: "Disaster (7(f))", extra: true },
  { value: "7g", label: "Legitimate use: employment safety (7(g))", basis: "legitimate_use", type: "Employment safety (7(g))", extra: true },
  { value: "7h", label: "Legitimate use: credit scoring / corporate (7(h))", basis: "legitimate_use", type: "Corporate (7(h))", extra: true },
];
function optFor(basis: string, type: string | null): string {
  if (basis === "consent") return "consent";
  return BASIS_OPTS.find((o) => o.type === type)?.value ?? "7a";
}

type Drawer = { mode: "create" | "edit" | "propose" | "view"; row?: PurposeRow };

export function PurposesView({ view, segment }: { view: View; segment: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const seg = ["needs_action", "pending", "approved", "all"].includes(segment) ? segment : "needs_action";

  const rows = view.rows.filter((r) => seg === "all" ? true : seg === "needs_action" ? (r.status === "draft" || r.status === "rejected") : seg === "pending" ? r.status === "pending" : r.status === "approved");

  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 5000); };

  return (
    <div className="pa-list">
      <div className="pa-head">
        <div className="stack" style={{ gap: 4 }}>
          <h1 className="inv-title">Purposes</h1>
          <p className="cell-sub" style={{ margin: 0, maxWidth: 680 }}>Why personal data is processed. A consent-based purpose must appear in a published notice before data is collected for it.</p>
        </div>
        <button className="btn primary" onClick={() => setDrawer({ mode: "create" })}>Add purpose</button>
      </div>

      <div className="inv-controls" style={{ marginTop: 16 }}>
        <div className="mp-segment">
          {CHIPS.map((c) => <button key={c.key} className={seg === c.key ? "on" : ""} onClick={() => router.push(`/data-map/purposes?segment=${c.key}`)}>{c.label} <span className="tnum">{c.count(view.counts)}</span></button>)}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="inv-noresult" style={{ marginTop: 14 }}>No purposes here. <button className="link-btn" onClick={() => setDrawer({ mode: "create" })}>Add a purpose</button></div>
      ) : (
        <table className="av-table" style={{ marginTop: 14 }}>
          <thead><tr><th>Purpose</th><th>Legal basis</th><th>Used by</th><th>In notice</th><th>Status</th><th>Version</th><th aria-label="Actions"></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="av-name">{r.name}</td>
                <td className="cell-sub">{r.legalBasisLabel}</td>
                <td className="cell-sub">{r.usedByCount === 0 ? "Not used" : `${r.usedByFirst}${r.usedByCount > 1 ? ` +${r.usedByCount - 1}` : ""}`}</td>
                <td>{r.inNotice ? <span className="cell-sub">{r.inNotice}</span> : r.noticeRequired ? <span className="sev-warning"><AlertTriangle size={12} /> Not in any notice</span> : <span className="cell-sub">Not required</span>}</td>
                <td><span className="row" style={{ gap: 6, alignItems: "center" }}><span className={`rchip ${r.status === "approved" ? "success" : r.status === "pending" ? "info" : r.status === "rejected" ? "amber-fill" : "amber-outline"}`}>{r.statusLabel}</span>{r.status === "approved" && <Lock size={12} />}</span></td>
                <td className="cell-sub tnum">v{r.version}</td>
                <td><RowActions r={r} onView={() => setDrawer({ mode: "view", row: r })} onPropose={() => setDrawer({ mode: "propose", row: r })} onEdit={() => setDrawer({ mode: "edit", row: r })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {drawer && <PurposeDrawer drawer={drawer} onClose={() => setDrawer(null)}
        onSaved={(msg) => { setDrawer(null); if (msg) notify(msg); start(() => router.refresh()); }} />}
      {toast && createPortal(<div className="inv-toast" role="status"><span>{toast}</span></div>, document.body)}
    </div>
  );
}

function RowActions({ r, onView, onPropose, onEdit }: { r: PurposeRow; onView: () => void; onPropose: () => void; onEdit: () => void }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [open, setOpen] = useState(false);
  if (r.status === "approved") return <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}><button className="link-btn" onClick={onView}>View</button><button className="link-btn" onClick={onPropose}>Propose change</button></div>;
  if (r.status === "rejected") return <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn sm" onClick={onEdit}>Edit &amp; resubmit</button></div>;
  // draft / pending → ⋯
  return (
    <div className="inv-more" style={{ position: "relative", textAlign: "right" }} onMouseLeave={() => setOpen(false)}>
      <button className="icon-btn" aria-label="Actions" onClick={() => setOpen((o) => !o)}><MoreHorizontal size={16} /></button>
      {open && (
        <div className="inv-more-pop" style={{ right: 0, minWidth: 160 }}>
          <button className="menu-item" onClick={() => { setOpen(false); onEdit(); }}>Edit</button>
          {r.status === "draft" && <button className="menu-item" onClick={() => start(async () => { const res = await submitPurposeAction(r.id); setOpen(false); if (res.ok) router.refresh(); })}>Submit for approval</button>}
        </div>
      )}
    </div>
  );
}

function PurposeDrawer({ drawer, onClose, onSaved }: { drawer: Drawer; onClose: () => void; onSaved: (msg?: string) => void }) {
  const r = drawer.row;
  const readOnly = drawer.mode === "view";
  const [name, setName] = useState(r?.edit.name ?? "");
  const [desc, setDesc] = useState(r?.edit.description ?? "");
  const [opt, setOpt] = useState(r ? optFor(r.edit.legalBasis, r.edit.legitimateUseType) : "consent");
  const [showAll, setShowAll] = useState(!!BASIS_OPTS.find((o) => o.value === (r ? optFor(r.edit.legalBasis, r.edit.legitimateUseType) : ""))?.extra);
  const [trigger, setTrigger] = useState(r?.edit.trigger ?? "");
  const [justification, setJustification] = useState(r?.edit.justification ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();
  const title = drawer.mode === "create" ? "Add purpose" : drawer.mode === "propose" ? "Propose a change" : drawer.mode === "view" ? "Purpose" : "Edit purpose";
  const visibleOpts = BASIS_OPTS.filter((o) => !o.extra || showAll);

  const save = (submit: boolean) => {
    if (name.trim().length < 3) { setErr("Give the purpose a name (at least 3 characters)."); return; }
    const o = BASIS_OPTS.find((x) => x.value === opt)!;
    const input: PurposeInput = { name: name.trim(), description: desc.trim(), legalBasis: o.basis, legitimateUseType: o.type ?? undefined, amount: r?.edit.amount ?? 0, unit: r?.edit.unit ?? "years", trigger: trigger.trim(), justification: justification.trim() };
    start(async () => {
      const res = drawer.mode === "create" ? await createPurposeAction(null, input, submit)
        : await editPurposeAction(r!.id, input, submit);
      if (!res.ok) { setErr(res.error ?? "Could not save."); return; }
      onSaved(submit ? "Kavita Menon will review this. It can’t be used in a published notice until approved." : drawer.mode === "propose" ? `Draft created. v${(r?.version ?? 1) + 1} is a draft; v${r?.version} stays in force until approved.` : "Saved.");
    });
  };

  return createPortal(
    <div className="mp-drawer-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="mp-drawer" role="dialog" aria-label={title}>
        <div className="mp-drawer-head"><h3 style={{ margin: 0 }}>{title}</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="mp-drawer-body stack" style={{ gap: 16 }}>
          {r?.status === "rejected" && r.rejectionReason && (
            <div className="notice warn" style={{ margin: 0 }}><strong>Rejected by Kavita Menon.</strong> {r.rejectionReason}</div>
          )}
          {drawer.mode === "propose" && <div className="notice info" style={{ margin: 0 }}>This creates v{(r?.version ?? 1) + 1} as a draft. v{r?.version} stays approved until Kavita Menon rules.</div>}

          <label className="fld"><span>Name</span><input className="input" value={name} disabled={readOnly} onChange={(e) => { setName(e.target.value); setErr(null); }} /></label>
          <label className="fld"><span>Description</span><textarea className="input" rows={2} value={desc} disabled={readOnly} placeholder="Plain language — this is what the notice will show." onChange={(e) => setDesc(e.target.value)} /></label>
          <label className="fld"><span>Legal basis</span>
            <select className="input" value={opt} disabled={readOnly} onChange={(e) => setOpt(e.target.value)}>
              {visibleOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {!showAll && !readOnly && <button type="button" className="link-btn" style={{ marginTop: 4 }} onClick={() => setShowAll(true)}>Show all legitimate uses</button>}
          </label>
          <label className="fld"><span>Retention</span><input className="input" value={trigger} disabled={readOnly} placeholder="e.g. 5 years after account closure" onChange={(e) => setTrigger(e.target.value)} /></label>
          <label className="fld"><span>Why it is needed</span><textarea className="input" rows={2} value={justification} disabled={readOnly} onChange={(e) => setJustification(e.target.value)} /></label>
          {r && r.linkedActivities.length > 0 && (
            <div className="fld"><span>Linked activities</span><div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 4 }}>{r.linkedActivities.map((a, i) => <span key={i} className="chip">{a}</span>)}</div></div>
          )}
          {err && <div className="notice warn" style={{ margin: 0 }}>{err}</div>}
        </div>
        {!readOnly && (
          <div className="mp-drawer-foot" style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "14px 0 0" }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn" onClick={() => save(false)}>Save as draft</button>
            <button className="btn primary" onClick={() => save(true)}>Submit for DPO approval</button>
          </div>
        )}
      </aside>
    </div>, document.body);
}
