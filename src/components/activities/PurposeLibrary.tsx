"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, X, Lock } from "lucide-react";
import { PurposeModal, type PurposeModalInitial } from "@/components/activities/PurposeModal";
import { submitPurposeAction, withdrawPurposeAction } from "@/app/actions/purposes";
import type { PurposeLibraryView, LibraryRow } from "@/lib/engines/purposes";

const LIB = "/data-map/purposes";
const DOT: Record<string, string> = { approved: "var(--green)", approved_newer_waiting: "var(--green)", waiting_for_dpo: "var(--blue)", changes_requested: "var(--yellow-700, #b45309)", draft: "var(--text-4, #94a3b8)", rejected: "var(--red)", retired: "var(--text-4, #94a3b8)" };

export function PurposeLibrary({ view, segment, q }: { view: PurposeLibraryView; segment: string; q: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [qLocal, setQLocal] = useState(q);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; purposeId?: string; initial?: PurposeModalInitial; editApproved?: boolean; inForceVersion?: number } | null>(null);

  const push = (patch: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ segment, q, ...patch })) if (v) sp.set(k, v);
    start(() => router.push(`${LIB}${sp.toString() ? `?${sp}` : ""}`));
  };

  let rows = view.rows;
  if (segment === "needs-attention") rows = rows.filter((r) => ["waiting_for_dpo", "changes_requested", "draft", "rejected"].includes(r.state));
  else if (segment === "approved") rows = rows.filter((r) => r.state === "approved" || r.state === "approved_newer_waiting");
  if (qLocal.trim()) rows = rows.filter((r) => r.name.toLowerCase().includes(qLocal.toLowerCase()));

  return (
    <div className="pa-list">
      <div className="pa-head">
        <h1 className="inv-title">Purposes</h1>
        <div className="row" style={{ gap: 16, alignItems: "center" }}>
          <Link href="/data-map/processing-activities" className="row-link">← Processing activities</Link>
          <button className="btn primary" onClick={() => setModal({ mode: "create" })}>Create purpose</button>
        </div>
      </div>
      <p className="inv-sentence" style={{ marginTop: 14 }}>{view.sentence}</p>

      <div className="inv-controls" style={{ marginTop: 16 }}>
        <div className="mp-segment">
          <button className={segment === "needs-attention" ? "on" : ""} onClick={() => push({ segment: "needs-attention" })}>Needs attention <span className="tnum">{view.counts.attention}</span></button>
          <button className={segment === "approved" ? "on" : ""} onClick={() => push({ segment: "approved" })}>Approved <span className="tnum">{view.counts.approved}</span></button>
          <button className={segment === "all" ? "on" : ""} onClick={() => push({ segment: "all" })}>All <span className="tnum">{view.counts.all}</span></button>
        </div>
        <div className="inv-search" style={{ maxWidth: 260 }}><Search size={14} /><input value={qLocal} onChange={(e) => setQLocal(e.target.value)} placeholder="Search purposes" aria-label="Search" />{qLocal && <button className="icon-btn" onClick={() => setQLocal("")}><X size={13} /></button>}</div>
      </div>

      {rows.length === 0 ? <div className="inv-noresult">No purposes here.</div> : (
        <div className="pa-rows">
          {rows.map((r) => <PRow key={r.id} r={r} onEdit={() => setModal({ mode: "edit", purposeId: r.id, initial: r.edit, editApproved: r.editApproved, inForceVersion: r.inForceVersion ?? undefined })} onAction={(fn) => start(async () => { await fn(); router.refresh(); })} />)}
        </div>
      )}

      {modal && <PurposeModal {...modal} onClose={() => setModal(null)} onDone={() => { setModal(null); router.refresh(); }} />}
    </div>
  );
}

function PRow({ r, onEdit, onAction }: { r: LibraryRow; onEdit: () => void; onAction: (fn: () => Promise<unknown>) => void }) {
  const approved = r.state === "approved" || r.state === "approved_newer_waiting";
  return (
    <div className="pa-row">
      <div className="pa-row-main">
        <div className="pa-row-name">{r.name}</div>
        <div className="cell-sub">{r.sub}</div>
        <div className="row" style={{ gap: 6, alignItems: "center", marginTop: 2 }}>
          {approved && <Lock size={12} />}<span className="dot" style={{ width: 8, height: 8, borderRadius: "50%", background: DOT[r.state] }} />
          <span>{r.stateLabel}</span><span className="cell-sub">· Used by {r.usedBy} {r.usedBy === 1 ? "activity" : "activities"}</span>
        </div>
      </div>
      <div className="pa-row-right row" style={{ gap: 10 }}>
        {r.state === "waiting_for_dpo" ? <button className="link-btn" onClick={() => onAction(() => withdrawPurposeAction(r.id))}>Withdraw submission</button>
          : r.state === "changes_requested" ? <><button className="link-btn" onClick={onEdit}>Edit</button><button className="link-btn" onClick={() => onAction(() => submitPurposeAction(r.id))}>Resubmit</button></>
          : r.state === "draft" ? <><button className="link-btn" onClick={onEdit}>Edit</button><button className="link-btn" onClick={() => onAction(() => submitPurposeAction(r.id))}>Submit for approval</button></>
          : <button className="link-btn" onClick={onEdit}>Edit purpose</button>}
      </div>
    </div>
  );
}
