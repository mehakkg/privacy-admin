"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wifi, WifiOff, Save, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Notice, Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { captureBranchConsentAction, queueOfflineConsentAction, syncOfflineQueueAction, retryOfflineItemAction } from "@/app/actions/omnichannel";
import { CAPTURE_CHANNEL_LABEL, SYNC_STATUS_LABEL, SYNC_STATUS_TONE } from "@/lib/omnichannel";
import type { ActionResult } from "@/app/actions/requests";

export interface TemplateOpt { id: string; name: string; productOrCampaign: string }
export interface PurposeOpt { id: string; name: string }
export interface QueueItem { id: string; subjectRef: string; captureChannel: string; capturedAt: string; syncStatus: string; retryCount: number; lastError: string | null }
export interface SyncedRow { id: string; subjectRef: string; captureChannel: string; collectedAt: string; syncTimestamp: string | null }

const DEVICE_ID = "kiosk-01";

export function BranchConsentCapture({
  templates, purposes, queue, synced,
}: { templates: TemplateOpt[]; purposes: PurposeOpt[]; queue: QueueItem[]; synced: SyncedRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const [online, setOnline] = useState(true);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [subjectRef, setSubjectRef] = useState("");
  const [purposeTagId, setPurposeTagId] = useState(purposes[0]?.id ?? "");
  const [captureChannel, setCaptureChannel] = useState("assisted_bc_point");
  const [idVerification, setIdVerification] = useState("");

  const pendingCount = queue.filter((q) => q.syncStatus === "queued" || q.syncStatus === "syncing").length;
  const failedCount = queue.filter((q) => q.syncStatus === "failed").length;

  const run = (op: () => Promise<ActionResult>, after?: () => void) => start(async () => {
    const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); }
  });

  const capture = () => {
    if (online) {
      run(() => captureBranchConsentAction({ subjectRef, purposeTagId: purposeTagId || null, captureChannel, idVerification, templateId }), () => setSubjectRef(""));
    } else {
      // captured_at is LOCKED here, at the moment of local capture.
      const capturedAt = new Date().toISOString();
      const consentDraftId = `${DEVICE_ID}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      run(() => queueOfflineConsentAction({ consentDraftId, deviceId: DEVICE_ID, subjectRef, purposeTagId: purposeTagId || null, captureChannel, idVerification, capturedAt }), () => setSubjectRef(""));
    }
  };

  return (
    <div className="dprr-grid" style={{ alignItems: "start" }}>
      <div className="card">
        <div className="card-head">
          Capture consent
          <span style={{ marginLeft: "auto" }}>
            <button className={`btn xs ${online ? "" : "ghost"}`} onClick={() => setOnline(true)} title="Connected"><Wifi size={12} /> Online</button>
            <button className={`btn xs ${online ? "ghost" : ""}`} onClick={() => setOnline(false)} title="No connectivity" style={{ marginLeft: 4 }}><WifiOff size={12} /> Offline</button>
          </span>
        </div>
        <div className="card-body">
          <ActionError result={result} />
          {result?.ok && <Notice tone="ok" title={online ? "Consent captured" : "Captured offline — queued locally"}>{online ? "Written to the shared ConsentArtifact store immediately." : "Held in the on-device queue with its capture time locked. It syncs when connectivity returns."}</Notice>}

          <label className="fld"><span>Template <span className="cell-sub">(shared library)</span></span>
            <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {templates.length === 0 && <option value="">No templates</option>}
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.productOrCampaign}</option>)}
            </select>
          </label>
          <label className="fld"><span>Customer reference</span><input className="input" value={subjectRef} onChange={(e) => setSubjectRef(e.target.value)} placeholder="e.g. CUST-8842" /></label>
          <label className="fld"><span>Purpose</span>
            <select className="input" value={purposeTagId} onChange={(e) => setPurposeTagId(e.target.value)}>
              {purposes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="fld"><span>Capture channel</span>
            <select className="input" value={captureChannel} onChange={(e) => setCaptureChannel(e.target.value)}>
              <option value="assisted_branch">{CAPTURE_CHANNEL_LABEL.assisted_branch}</option>
              <option value="assisted_bc_point">{CAPTURE_CHANNEL_LABEL.assisted_bc_point}</option>
            </select>
          </label>
          <label className="fld"><span>In-person ID verification</span><input className="input" value={idVerification} onChange={(e) => setIdVerification(e.target.value)} placeholder="e.g. Aadhaar last-4 + OTP" /></label>

          <button className="btn primary" disabled={pending || !subjectRef.trim()} onClick={capture}>
            <Save size={14} /> {online ? "Capture (write now)" : "Capture (queue offline)"}
          </button>
          <p className="cell-sub" style={{ marginTop: 8 }}>Deliberately fewer fields than the digital flow. Offline capture locks the capture time locally; it becomes the artifact&rsquo;s capture timestamp on sync and is never overwritten by the sync time.</p>
        </div>
      </div>

      <div className="stack" style={{ gap: 14 }}>
        <div className="card">
          <div className="card-head">
            Local queue ({DEVICE_ID})
            <span style={{ marginLeft: "auto" }} className="row">
              {pendingCount > 0 && <Pill tone="yellow" dot={false}>{pendingCount} pending</Pill>}
              {failedCount > 0 && <Pill tone="red" dot={false}>{failedCount} failed</Pill>}
              {pendingCount === 0 && failedCount === 0 && <Pill tone="green" dot={false}>Empty</Pill>}
            </span>
          </div>
          <div className="card-body">
            {queue.length === 0 && <p className="cell-sub">No items in the device queue.</p>}
            {queue.map((q) => (
              <div key={q.id} className="pick-row">
                <div className="cell-stack" style={{ flex: 1 }}>
                  <span className="cell-primary">{q.subjectRef}</span>
                  <span className="cell-sub">{CAPTURE_CHANNEL_LABEL[q.captureChannel] ?? q.captureChannel} · captured {q.capturedAt}{q.retryCount > 0 ? ` · retries ${q.retryCount}` : ""}</span>
                  {q.lastError && <span className="cell-sub" style={{ color: "var(--red)" }}>{q.lastError}</span>}
                </div>
                <Pill tone={SYNC_STATUS_TONE[q.syncStatus] ?? "gray"} dot={false}>{SYNC_STATUS_LABEL[q.syncStatus] ?? q.syncStatus}</Pill>
                {q.syncStatus === "failed" && <button className="btn xs" disabled={pending} onClick={() => run(() => retryOfflineItemAction(q.id))}><RefreshCw size={11} /> Retry</button>}
              </div>
            ))}
            {(pendingCount > 0 || failedCount > 0) && (
              <div className="row" style={{ gap: 6, marginTop: 10 }}>
                <button className="btn sm primary" disabled={pending} onClick={() => run(() => syncOfflineQueueAction(DEVICE_ID, false))}><RefreshCw size={12} /> Connectivity restored — sync all</button>
                <button className="btn sm ghost" disabled={pending} onClick={() => run(() => syncOfflineQueueAction(DEVICE_ID, true))} title="Demo: one item fails mid-upload">Sync (simulate 1 failure)</button>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">Synced records — capture vs sync time</div>
          <div className="card-body">
            {synced.length === 0 && <p className="cell-sub">No assisted-channel consent records yet.</p>}
            {synced.map((s) => (
              <div key={s.id} className="pick-row">
                <div className="cell-stack" style={{ flex: 1 }}>
                  <span className="cell-primary">{s.subjectRef} <span className="cell-sub">· {CAPTURE_CHANNEL_LABEL[s.captureChannel] ?? s.captureChannel}</span></span>
                  <span className="cell-sub">Captured {s.collectedAt}{s.syncTimestamp ? ` · Synced ${s.syncTimestamp}` : " · captured online"}</span>
                </div>
                {s.syncTimestamp
                  ? <span title="Capture time preserved from offline; sync time recorded separately"><CheckCircle2 size={14} color="var(--green)" /></span>
                  : <Pill tone="blue" dot={false}>live</Pill>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
