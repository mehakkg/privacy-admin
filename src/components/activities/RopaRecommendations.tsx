"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import { X, MoreHorizontal, RefreshCw } from "lucide-react";
import type { RopaRecsView } from "@/lib/engines/ropaRecs";
import type { PendingRec, RecField } from "@/lib/activities/ropaRecs";
import { DISMISS_REASONS } from "@/lib/activities/ropaRecs";
import { createDraftActivityAction } from "@/app/actions/activities";

const BASE = "/data-map/processing-activities";

/**
 * ROPA recommendations — suggested activities from DLP-classified data. Nothing
 * enters the register until accepted + DPO-approved. Evidence shows masked samples
 * only; never a raw value.
 */
export function RopaRecommendations({ view }: { view: RopaRecsView }) {
  const router = useRouter();
  const [tab, setTab] = useState<"pending" | "accepted" | "dismissed">("pending");
  const [drawer, setDrawer] = useState<PendingRec | null>(null);
  const [dismissing, setDismissing] = useState<PendingRec | null>(null);
  const [merging, setMerging] = useState<(PendingRec & { matchActivityId: string | null }) | null>(null);
  const [locallyDismissed, setLocallyDismissed] = useState<{ name: string; reason: string }[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [, start] = useTransition();
  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 5000); };

  const pending = view.pending.filter((p) => !dismissedIds.has(p.id));
  const dismissed = [...locallyDismissed.map((d) => ({ name: d.name, reason: d.reason, by: "Ritu Nair", at: "just now" })), ...view.dismissed];

  const doCreate = (rec: PendingRec) => start(async () => {
    const r = await createDraftActivityAction(rec.activity);
    if (r.ok && r.id) { notify(`Draft activity '${rec.activity}' created. Add its data, then submit for DPO review.`); router.push(`${BASE}/${r.id}`); }
    else notify(r.error ?? "Could not create the activity.");
  });

  if (!view.connected) {
    return (
      <div className="pa-list">
        <Header view={view} refreshing={refreshing} onRefresh={() => {}} />
        <div className="inv-noresult" style={{ marginTop: 16 }}>DLP isn’t connected, so there are no recommendations. <Link href="/integrations/dlp" className="link-btn">Connect DLP in Settings › Integrations</Link></div>
      </div>
    );
  }

  return (
    <div className="pa-list">
      <Header view={view} refreshing={refreshing} onRefresh={() => { setRefreshing(true); notify("Refreshing recommendations…"); setTimeout(() => setRefreshing(false), 1200); }} />

      <div className="dm-tabs" style={{ marginTop: 14 }}>
        <button className={`dm-tab${tab === "pending" ? " on" : ""}`} onClick={() => setTab("pending")}>Pending ({pending.length})</button>
        <button className={`dm-tab${tab === "accepted" ? " on" : ""}`} onClick={() => setTab("accepted")}>Accepted ({view.accepted.length})</button>
        <button className={`dm-tab${tab === "dismissed" ? " on" : ""}`} onClick={() => setTab("dismissed")}>Dismissed ({dismissed.length})</button>
      </div>

      {tab === "pending" && (pending.length === 0 ? (
        <div className="inv-noresult" style={{ marginTop: 14 }}>No pending suggestions. Recommendations update after each DLP sync.</div>
      ) : (
        <table className="av-table" style={{ marginTop: 14 }}>
          <thead><tr><th>Suggested activity</th><th>System</th><th>Fields</th><th>Suggested purpose</th><th>Principal</th><th>Closest match</th><th>Generated</th><th></th></tr></thead>
          <tbody>
            {pending.map((r) => (
              <tr key={r.id} className="av-row" onClick={(e) => { if ((e.target as HTMLElement).closest("button,a")) return; setDrawer(r); }}>
                <td className="av-name">{r.activity}</td>
                <td className="cell-sub">{r.source}</td>
                <td className="cell-sub">{r.fields.length}: {r.fields.slice(0, 3).map((f) => f.name).join(", ")}</td>
                <td className="cell-sub">{r.purpose ?? <span className="sev-warning">No matching purpose</span>}</td>
                <td className="cell-sub">{r.principal}</td>
                <td className="cell-sub">{r.match ? `${r.match.activityName} · ${r.match.overlap}` : "No match"}</td>
                <td className="cell-sub">{r.generated}</td>
                <td>
                  <div className="row" style={{ gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                    {r.match ? <button className="btn primary sm" onClick={() => setMerging(r)}>Merge into {r.match.activityName}</button> : <button className="btn primary sm" onClick={() => doCreate(r)}>Create activity</button>}
                    <RowMenu hasMatch={!!r.match} onCreate={() => doCreate(r)} onDismiss={() => setDismissing(r)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}

      {tab === "accepted" && (
        <table className="av-table" style={{ marginTop: 14 }}>
          <thead><tr><th>Activity</th><th>Created</th><th>By</th></tr></thead>
          <tbody>{view.accepted.map((a, i) => (
            <tr key={i}><td className="av-name">{a.activityId ? <Link href={`${BASE}/${a.activityId}`} className="row-link">{a.activityName}</Link> : a.activityName}</td><td className="cell-sub">{a.createdAt}</td><td className="cell-sub">{a.by}</td></tr>
          ))}</tbody>
        </table>
      )}

      {tab === "dismissed" && (
        <table className="av-table" style={{ marginTop: 14 }}>
          <thead><tr><th>Suggestion</th><th>Reason</th><th>By</th><th>When</th></tr></thead>
          <tbody>{dismissed.map((d, i) => (
            <tr key={i}><td className="av-name">{d.name}</td><td className="cell-sub">{d.reason}</td><td className="cell-sub">{d.by}</td><td className="cell-sub">{d.at}</td></tr>
          ))}</tbody>
        </table>
      )}

      {drawer && <EvidenceDrawer rec={drawer} onClose={() => setDrawer(null)} />}
      {dismissing && <DismissModal rec={dismissing} onClose={() => setDismissing(null)} onDismiss={(reason) => { setDismissedIds((s) => new Set(s).add(dismissing.id)); setLocallyDismissed((l) => [{ name: dismissing.activity, reason }, ...l]); setDismissing(null); notify("Suggestion dismissed."); }} />}
      {merging && <MergeModal rec={merging} onClose={() => setMerging(null)} onConfirm={() => { const id = merging.matchActivityId; setMerging(null); if (id) { notify(`Fields merged into ${merging.match?.activityName}.`); router.push(`${BASE}/${id}`); } }} />}
      {toast && createPortal(<div className="inv-toast" role="status"><span>{toast}</span></div>, document.body)}
    </div>
  );
}

function Header({ view, refreshing, onRefresh }: { view: RopaRecsView; refreshing: boolean; onRefresh: () => void }) {
  return (
    <div className="pa-head">
      <div className="stack" style={{ gap: 4 }}>
        <h1 className="inv-title">ROPA recommendations</h1>
        <p className="cell-sub" style={{ margin: 0, maxWidth: 720 }}>Suggested activities generated from data DLP has classified. Nothing enters the register until you accept it and Kavita Menon approves it.</p>
      </div>
      <div className="stack" style={{ gap: 4, alignItems: "flex-end" }}>
        <button className="btn sec" onClick={onRefresh} disabled={refreshing}><RefreshCw size={13} className={refreshing ? "spin" : ""} /> Refresh recommendations</button>
        <span className="cell-sub">{view.generatedAt}</span>
      </div>
    </div>
  );
}

function RowMenu({ hasMatch, onCreate, onDismiss }: { hasMatch: boolean; onCreate: () => void; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="inv-more" style={{ position: "relative" }} onMouseLeave={() => setOpen(false)}>
      <button className="icon-btn" aria-label="More actions" onClick={() => setOpen((o) => !o)}><MoreHorizontal size={16} /></button>
      {open && (
        <div className="inv-more-pop" style={{ right: 0, minWidth: 170 }}>
          {hasMatch && <button className="menu-item" onClick={() => { setOpen(false); onCreate(); }}>Create new activity</button>}
          <button className="menu-item" onClick={() => { setOpen(false); onDismiss(); }}>Dismiss</button>
        </div>
      )}
    </div>
  );
}

function EvidenceDrawer({ rec, onClose }: { rec: PendingRec; onClose: () => void }) {
  return createPortal(
    <div className="mp-drawer-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="mp-drawer" role="dialog" aria-label={rec.activity}>
        <div className="mp-drawer-head"><div className="stack" style={{ gap: 2 }}><strong>{rec.activity}</strong><span className="cell-sub">{rec.source}</span></div><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="mp-drawer-body stack" style={{ gap: 10 }}>
          <p className="cell-sub" style={{ margin: 0 }}>What DLP found. Samples are masked — the register never stores a raw value.</p>
          {rec.fields.map((f: RecField, i) => (
            <div key={i} className="stack" style={{ gap: 2, borderTop: i ? "1px solid var(--border-soft)" : "none", paddingTop: i ? 10 : 0 }}>
              <div className="row" style={{ justifyContent: "space-between" }}><strong>{f.name}</strong><span className="chip">{f.label}</span></div>
              <div className="cell-sub">{f.location} · {f.records.toLocaleString()} records</div>
              <div className="cell-sub mono">Sample: {f.sample}</div>
            </div>
          ))}
        </div>
      </aside>
    </div>, document.body);
}

function DismissModal({ rec, onClose, onDismiss }: { rec: PendingRec; onClose: () => void; onDismiss: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const [err, setErr] = useState(false);
  const confirm = () => { if (!reason) { setErr(true); return; } onDismiss(reason === "Other" ? (other.trim() || "Other") : reason); };
  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal std-modal sm" role="dialog" aria-modal="true" aria-label="Dismiss suggestion">
        <div className="std-modal-head"><h3 style={{ margin: 0 }}>Dismiss “{rec.activity}”</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="std-modal-body stack" style={{ gap: 8 }}>
          <p className="cell-sub" style={{ margin: 0 }}>Why are you dismissing this? It won’t come back unless the underlying fields change.</p>
          {DISMISS_REASONS.map((r) => (
            <label key={r} className="row" style={{ gap: 8, alignItems: "center" }}><input type="radio" name="reason" checked={reason === r} onChange={() => { setReason(r); setErr(false); }} /> {r}</label>
          ))}
          {reason === "Other" && <input className="input" value={other} onChange={(e) => setOther(e.target.value)} placeholder="Reason" />}
          {err && <div className="notice warn" style={{ margin: 0 }}>Choose a reason.</div>}
        </div>
        <div className="std-modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn danger" onClick={confirm}>Dismiss</button></div>
      </div>
    </div>, document.body);
}

function MergeModal({ rec, onClose, onConfirm }: { rec: PendingRec & { matchActivityId: string | null }; onClose: () => void; onConfirm: () => void }) {
  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal std-modal sm" role="dialog" aria-modal="true" aria-label="Merge suggestion">
        <div className="std-modal-head"><h3 style={{ margin: 0 }}>Merge into {rec.match?.activityName}</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="std-modal-body"><p className="cell-sub" style={{ margin: 0 }}>This adds the {rec.fields.length} fields to {rec.match?.activityName}. Because it’s approved, this creates v2 as a draft and marks it Review due — v1 stays in the register until Kavita Menon approves.</p></div>
        <div className="std-modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={onConfirm}>Create draft &amp; open</button></div>
      </div>
    </div>, document.body);
}
