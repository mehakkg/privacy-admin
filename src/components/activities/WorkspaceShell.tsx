"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Notice } from "@/components/ui";
import { BasicsPane } from "@/components/activities/BasicsPane";
import { PurposePane } from "@/components/activities/PurposePane";
import { AddPurposePopover } from "@/components/activities/AddPurposePopover";
import { PurposeModal, type PurposeModalInitial } from "@/components/activities/PurposeModal";
import { setBasicsAction, type BasicsPatch } from "@/app/actions/activities";
import type { WorkspaceView } from "@/lib/engines/activities";

const LIST = "/data-map/processing-activities";
const LIFECYCLE_LABEL: Record<string, string> = { draft: "Draft", pending_dpo_review: "Waiting for DPO review", active: "Active", under_review: "Under review", retired: "Retired" };

interface PaneState { pane: string; purpose?: string; section?: string; from?: string; n?: string; of?: string }

export function WorkspaceShell({ view: initial, state }: { view: WorkspaceView; state: PaneState }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [version, setVersion] = useState(initial.version);
  const [save, setSave] = useState<{ status: "idle" | "saving" | "saved" | "error" | "conflict"; at?: string }>({ status: "idle" });
  const [popover, setPopover] = useState<{ top: number; left: number } | null>(null);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; purposeId?: string; initial?: PurposeModalInitial; editApproved?: boolean; inForceVersion?: number } | null>(null);
  const readOnly = view.lifecycle === "retired" || view.lifecycle === "pending_dpo_review";

  // Keep local view in sync when the server re-renders (navigation / refresh).
  if (initial.version !== view.version && save.status !== "saving") { /* server is newer */ }

  const pushPane = (pane: string, extra: Record<string, string | undefined> = {}) => {
    const sp = new URLSearchParams();
    sp.set("pane", pane);
    for (const [k, v] of Object.entries(extra)) if (v) sp.set(k, v);
    if (state.from) sp.set("from", state.from);
    router.push(`${LIST}/${view.id}?${sp}`);
  };

  const doSave = (patch: BasicsPatch) => {
    setSave({ status: "saving" });
    (async () => {
      const r = await setBasicsAction(view.id, patch, version);
      if (r.conflict) { setSave({ status: "conflict" }); return; }
      if (!r.ok) { setSave({ status: "error" }); return; }
      setVersion(r.version!);
      setView((v) => ({ ...v, ...patch, principals: patch.principals ?? v.principals, name: patch.name ?? v.name } as WorkspaceView));
      setSave({ status: "saved", at: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) });
      router.refresh();
    })();
  };

  // Rail + bottom-bar order.
  const order: { key: string; label: string; pane: string; purpose?: string; sub?: string; waiting?: number | null }[] = [];
  if (view.lifecycle === "under_review") order.push({ key: "review", label: "Review", pane: "review", sub: `${view.openReasons} change${view.openReasons === 1 ? "" : "s"} to check` });
  order.push({ key: "basics", label: "Basics", pane: "basics", sub: view.basicsRailText });
  for (const p of view.purposeRails) order.push({ key: `p-${p.purposeId}`, label: p.name, pane: "purpose", purpose: p.purposeId, sub: p.railText, waiting: p.waitingVersion });
  order.push({ key: "activate", label: "Review and activate", pane: "activate", sub: view.reviewBlockers > 0 ? `Fix ${view.reviewBlockers} item${view.reviewBlockers === 1 ? "" : "s"}` : "Ready" });

  const curIndex = order.findIndex((o) => o.pane === state.pane && (!o.purpose || o.purpose === state.purpose));
  const cur = curIndex >= 0 ? order[curIndex] : order.find((o) => o.pane === "basics")!;
  const prev = curIndex > 0 ? order[curIndex - 1] : null;
  const next = curIndex >= 0 && curIndex < order.length - 1 ? order[curIndex + 1] : null;

  const saveText = save.status === "saving" ? "Saving…" : save.status === "saved" ? `Saved ${save.at}` : save.status === "error" ? "Couldn’t save. Retry" : "";

  return (
    <div className="stack" style={{ gap: 12 }}>
      {state.from && (
        <div className="mp-ctxbar">
          <span>From {state.from === "data-inventory" ? "Data inventory" : state.from === "home" ? "Home" : "notification"}{state.n && state.of ? ` · ${state.n} of ${state.of}` : ""}</span>
          <div className="row" style={{ gap: 12, marginLeft: "auto" }}>
            <Link href={LIST} className="row-link">← Back</Link>
            {next && <button className="row-link" onClick={() => pushPane(next.pane, { purpose: next.purpose })}>Next: {next.label}</button>}
          </div>
        </div>
      )}

      <div className="pa-ws-top">
        <div className="stack" style={{ gap: 2 }}>
          <Link href={LIST} className="row-link">← Processing activities</Link>
          <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
            <h1 className="inv-title">{view.name}</h1>
            <span className="cell-sub">{LIFECYCLE_LABEL[view.lifecycle]}</span>
            {saveText && <span className={`cell-sub${save.status === "error" ? " sev-danger" : ""}`}>· {saveText}</span>}
          </div>
        </div>
      </div>

      {/* Banners (one at a time, by priority) */}
      {save.status === "conflict" && <Notice tone="warn" title="This activity changed elsewhere">Reload to see the latest. <button className="link-btn" onClick={() => router.refresh()}>Reload</button></Notice>}
      {view.lifecycle === "retired" ? <Notice tone="info" title="This activity is retired">History is kept.</Notice>
        : view.prepared ? <Notice tone="info" title="Prepared from a suggestion">Confirm each suggested item.</Notice>
        : view.lifecycle === "under_review" ? <Notice tone="warn" title={`${view.openReasons} change${view.openReasons === 1 ? "" : "s"} need a decision`}><button className="link-btn" onClick={() => pushPane("review")}>Review</button></Notice>
        : null}

      <div className="pa-ws">
        <nav className="pa-rail">
          {order.map((o) => (
            <button key={o.key} className={`pa-rail-item${cur.key === o.key ? " on" : ""}`} aria-current={cur.key === o.key ? "true" : undefined} onClick={() => pushPane(o.pane, { purpose: o.purpose })}>
              <span className="pa-rail-label">{o.label}</span>
              <span className="pa-rail-sub">{o.sub}{o.waiting ? ` · Version ${o.waiting} waiting` : ""}</span>
            </button>
          ))}
          <div className="pa-rail-add"><button className="link-btn" onClick={(e) => { const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); setPopover({ top: b.bottom + 4, left: b.left }); }}>+ Add purpose</button></div>
        </nav>

        <div className="pa-ws-pane">
          {cur.pane === "basics" ? (
            <BasicsPane view={view} save={doSave} readOnly={readOnly} />
          ) : cur.pane === "purpose" ? (
            state.purpose && view.purposeDetails[state.purpose] ? (
              <PurposePane data={view.purposeDetails[state.purpose]} activityId={view.id}
                onEdit={() => { const d = view.purposeDetails[state.purpose!]; setModal({ mode: "edit", purposeId: d.purposeId, initial: d.edit, editApproved: d.editApproved, inForceVersion: d.inForceVersion ?? undefined }); }}
                onReplace={() => setPopover({ top: 120, left: 360 })} />
            ) : (
              <div className="stack" style={{ gap: 12, maxWidth: 520 }}><h2 style={{ margin: 0 }}>Purposes</h2><Notice tone="info" title="No purpose selected">Add a purpose to this activity.</Notice><div><button className="btn primary" onClick={() => setPopover({ top: 120, left: 360 })}>Add a purpose</button></div></div>
            )
          ) : cur.pane === "review" ? (
            <PanePlaceholder title="Review" body="The review of changes (Keep it right) arrives in a later step (M8)." />
          ) : (
            <PanePlaceholder title="Review and activate" body={`${view.reviewBlockers > 0 ? `Fix ${view.reviewBlockers} item(s) before activating. ` : "Ready to activate. "}The full checklist and activation arrive in a later step (M7).`} />
          )}

          <div className="pa-ws-bottom">
            {prev ? <button className="btn ghost" onClick={() => pushPane(prev.pane, { purpose: prev.purpose })}>Back</button> : <span />}
            {next ? <button className="btn primary" onClick={() => pushPane(next.pane, { purpose: next.purpose })}>Next: {next.label}</button> : <span />}
          </div>
        </div>
      </div>

      {popover && <AddPurposePopover activityId={view.id} anchor={popover}
        onClose={() => setPopover(null)}
        onAdded={(id) => { setPopover(null); router.push(`${LIST}/${view.id}?pane=purpose&purpose=${id}`); router.refresh(); }}
        onCreate={() => { setPopover(null); setModal({ mode: "create" }); }} />}
      {modal && <PurposeModal mode={modal.mode} activityId={view.id} purposeId={modal.purposeId} initial={modal.initial} editApproved={modal.editApproved} inForceVersion={modal.inForceVersion}
        onClose={() => setModal(null)}
        onDone={(id) => { setModal(null); router.push(`${LIST}/${view.id}?pane=purpose&purpose=${id}`); router.refresh(); }} />}
    </div>
  );
}

function PanePlaceholder({ title, body }: { title: string; body: string }) {
  return <div className="stack" style={{ gap: 12, maxWidth: 600 }}><h2 style={{ margin: 0 }}>{title}</h2><Notice tone="info" title="Being built">{body}</Notice></div>;
}
