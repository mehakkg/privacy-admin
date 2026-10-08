"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X, ExternalLink } from "lucide-react";
import { Notice } from "@/components/ui";
import { getPurposeProcessorsAction, getVendorOptionsAction, setProcessorModeAction, addProcessorAction, removeProcessorAction, acceptSuggestedProcessorAction } from "@/app/actions/activityProcessors";
import type { PurposeProcessorsView, VendorOption } from "@/lib/engines/activityProcessors";

const CONTRACT: Record<string, { label: string; warn: boolean }> = { on_file: { label: "Contract on file", warn: false }, none: { label: "No contract on file", warn: true }, expired: { label: "Contract expired", warn: true } };
const RISK_DOT: Record<string, string> = { low: "var(--green)", medium: "var(--yellow-700, #b45309)", high: "var(--red)", unrated: "var(--text-4, #94a3b8)" };

/** SCREEN 6 — Processors section of a purpose pane. */
export function ProcessorSection({ activityId, purposeId, purposeName }: { activityId: string; purposeId: string; purposeName: string }) {
  const router = useRouter();
  const [data, setData] = useState<PurposeProcessorsView | null>(null);
  const [picker, setPicker] = useState(false);
  const [confirmNone, setConfirmNone] = useState(false);
  const [, start] = useTransition();
  const load = () => getPurposeProcessorsAction(activityId, purposeId).then(setData);
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activityId, purposeId]);
  const act = (fn: () => Promise<unknown>) => start(async () => { await fn(); await load(); router.refresh(); });

  if (!data) return <div className="stack" style={{ gap: 8 }}><div className="inv-sec-h">Processors</div><span className="cell-sub">Loading…</span></div>;
  const mode = data.mode;

  const chooseNone = () => { if (data.rows.length > 0) setConfirmNone(true); else act(() => setProcessorModeAction(activityId, purposeId, "none")); };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="inv-sec-h" style={{ margin: 0 }}>Processors</div>
      <div className="mp-segment mp-segment-wrap">
        <button className={mode === "uses_processors" ? "on" : ""} onClick={() => act(() => setProcessorModeAction(activityId, purposeId, "uses_processors"))}>This purpose uses processors</button>
        <button className={mode === "none" ? "on" : ""} onClick={chooseNone}>No processor for this purpose</button>
      </div>
      <span className="cell-sub">Say which, so ROPA is never ambiguous.</span>

      {mode === "unanswered" && <div className="cell-sub sev-warning">Choose one to complete this purpose.</div>}

      {confirmNone && (
        <Notice tone="warn" title={`Switching removes ${data.rows.length} processor${data.rows.length === 1 ? "" : "s"} from this purpose.`}>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn sm" onClick={() => { setConfirmNone(false); act(() => setProcessorModeAction(activityId, purposeId, "none")); }}>Confirm</button>
            <button className="btn ghost sm" onClick={() => setConfirmNone(false)}>Cancel</button>
          </div>
        </Notice>
      )}

      {mode === "uses_processors" && <>
        {data.rows.map((r) => (
          <div key={r.linkId} className="pa-data-row">
            <span style={{ minWidth: 150, fontWeight: 500 }}>{r.name}</span>
            <span className="cell-sub">{r.country}</span>
            <span className={CONTRACT[r.contract].warn ? "sev-warning" : "cell-sub"}>{CONTRACT[r.contract].label}</span>
            <span className="row" style={{ gap: 5, alignItems: "center" }}><span className="dot" style={{ width: 8, height: 8, borderRadius: "50%", background: RISK_DOT[r.risk] }} />{r.risk[0].toUpperCase() + r.risk.slice(1)}</span>
            {r.transfer && <span className="sev-warning">Transfer outside India ({r.country})</span>}
            <button className="link-btn" style={{ marginLeft: "auto" }} onClick={() => act(() => removeProcessorAction(activityId, purposeId, r.linkId))}>Remove</button>
          </div>
        ))}
        {data.rows.length === 0 && <span className="cell-sub">No processors chosen. Add one, or record that there are none.</span>}
        <div><button className="btn ghost sm" onClick={() => setPicker(true)}>Add processor</button></div>
        {data.suggested.length > 0 && (
          <div className="stack" style={{ gap: 2, marginTop: 6 }}>
            <div className="cell-sub" style={{ fontWeight: 600 }}>Suggested from your data</div>
            {data.suggested.map((s) => (
              <div key={s.vendorId} className="pa-data-row"><span style={{ minWidth: 150 }}>{s.name}</span><span className="cell-sub">processes {s.count} of these fields</span><button className="link-btn" style={{ marginLeft: "auto" }} onClick={() => act(() => acceptSuggestedProcessorAction(activityId, purposeId, s.vendorId))}>Accept</button></div>
            ))}
          </div>
        )}
      </>}

      {mode === "none" && data.noProcessorBy && <span className="cell-sub">Recorded by {data.noProcessorBy}{data.noProcessorAt ? ` on ${new Date(data.noProcessorAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}.</span>}

      {picker && <ProcessorPicker activityId={activityId} purposeId={purposeId} purposeName={purposeName} existing={new Set(data.rows.map((r) => r.vendorId))} onClose={() => setPicker(false)} onAdded={() => { setPicker(false); act(() => Promise.resolve()); }} />}
    </div>
  );
}

function ProcessorPicker({ activityId, purposeId, purposeName, existing, onClose, onAdded }: { activityId: string; purposeId: string; purposeName: string; existing: Set<string>; onClose: () => void; onAdded: () => void }) {
  const [vendors, setVendors] = useState<VendorOption[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  useEffect(() => { getVendorOptionsAction().then(setVendors); }, []);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const add = () => start(async () => { await addProcessorAction(activityId, purposeId, [...sel]); onAdded(); });
  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal std-modal sm" role="dialog" aria-modal="true" aria-label={`Add processor to ${purposeName}`} style={{ width: 560, maxHeight: "80vh" }}>
        <div className="std-modal-head"><h3 style={{ margin: 0 }}>Add processor to {purposeName}</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="std-modal-body stack" style={{ gap: 4 }}>
          {!vendors ? <span className="cell-sub">Loading…</span> : vendors.map((v) => (
            <label key={v.id} className="pa-data-row" style={{ cursor: existing.has(v.id) ? "default" : "pointer", opacity: existing.has(v.id) ? 0.55 : 1 }}>
              <input type="checkbox" disabled={existing.has(v.id)} checked={sel.has(v.id)} onChange={() => toggle(v.id)} />
              <span style={{ minWidth: 150, fontWeight: 500 }}>{v.name}</span><span className="cell-sub">{v.country}</span>
              <span className={CONTRACT[v.contract].warn ? "sev-warning" : "cell-sub"}>{CONTRACT[v.contract].label}</span>
              <span className="cell-sub">{v.risk}</span>
              {existing.has(v.id) && <span className="cell-sub" style={{ marginLeft: "auto" }}>Added</span>}
            </label>
          ))}
          <a href="/vendor-risk/register" target="_blank" rel="noreferrer" className="row-link" style={{ marginTop: 6 }}>Can&rsquo;t find the vendor? Add it in Vendor risk <ExternalLink size={12} /></a>
        </div>
        <div className="std-modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={pending || sel.size === 0} onClick={add}>Add {sel.size} processor{sel.size === 1 ? "" : "s"}</button></div>
      </div>
    </div>, document.body);
}
