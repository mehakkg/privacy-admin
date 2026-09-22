"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, CheckCircle2, AlertTriangle, Rocket, Lock } from "lucide-react";
import { Pill, Notice } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { overrideVariantAction, setVariantInheritAction, reviewVariantAction, runVariantQAAction, setDeviceCheckAction, publishVariantAction, publishAllVariantsAction } from "@/app/actions/scenario6";
import { DEVICE_STATUS_TONE, DEVICE_STATUS_LABEL, VARIANT_PUBLISH_TONE, VARIANT_PUBLISH_LABEL } from "@/lib/scenario6";
import type { ActionResult } from "@/app/actions/requests";

export interface DeviceCell { id: string | null; device: string; browser: string; method: string; status: string; detail: string | null }
export interface VariantView { id: string; language: string; region: string | null; inherit: boolean; content: string; publishStatus: string; stale: boolean; checks: DeviceCell[] }
export interface ReleaseView { noticeId: string; noticeName: string; base: string; variants: VariantView[] }

export function NoticeReleaseWorkspace({ v }: { v: ReleaseView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const run = (op: () => Promise<ActionResult>, after?: () => void) => start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });

  const blocking = v.variants.filter((x) => x.publishStatus !== "qa_passed" && x.publishStatus !== "published");
  const canPublishAll = v.variants.length > 0 && blocking.length === 0;

  return (
    <div>
      <ActionError result={result} />

      {/* Approved notice content — locked, read-only here (Approved-Policy treatment). */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><Lock size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />Approved notice content — locked</div>
        <div className="card-body">
          <p className="cell-sub" style={{ margin: "0 0 8px" }}>This is the DPO-approved base content. It is read-only during release; variants inherit or override it, but the base cannot be edited here.</p>
          <div className="locked-content">{v.base || <em className="cell-sub">No base content.</em>}</div>
        </div>
      </div>

      {v.variants.map((vr) => {
        const allPass = vr.checks.length > 0 && vr.checks.every((c) => c.status === "pass");
        return (
          <div key={vr.id} className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              {vr.language}{vr.region ? ` · ${vr.region}` : ""}
              <span className="row" style={{ gap: 6, marginLeft: 8, alignItems: "center" }}>
                <Pill tone={vr.inherit ? "gray" : "blue"} dot={false}>{vr.inherit ? "Inheriting base" : "Overridden"}</Pill>
                <Pill tone={VARIANT_PUBLISH_TONE[vr.publishStatus] ?? "gray"} dot={false}>{VARIANT_PUBLISH_LABEL[vr.publishStatus] ?? vr.publishStatus}</Pill>
                {vr.stale && <Pill tone="yellow" dot={false}><AlertTriangle size={11} style={{ verticalAlign: "-1px" }} /> Base changed since review</Pill>}
              </span>
            </div>
            <div className="card-body">
              {/* Screen 5 — inherit vs override. */}
              {editing === vr.id ? (
                <div>
                  <textarea className="input" rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} />
                  <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    <button className="btn xs" onClick={() => setEditing(null)}>Cancel</button>
                    <button className="btn xs primary" disabled={pending} onClick={() => run(() => overrideVariantAction(vr.id, draft, v.noticeId), () => setEditing(null))}>Save override</button>
                  </div>
                </div>
              ) : (
                <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  {vr.inherit
                    ? <>
                        <span className="cell-sub">Inherits the base notice content.</span>
                        <button className="btn xs" disabled={pending} onClick={() => { setEditing(vr.id); setDraft(v.base); }}>Override…</button>
                        {vr.stale && <button className="btn xs primary" disabled={pending} onClick={() => run(() => reviewVariantAction(vr.id, v.noticeId))}>Re-review against base</button>}
                      </>
                    : <>
                        <span className="cell-sub">Overridden content in force.</span>
                        <button className="btn xs" disabled={pending} onClick={() => { setEditing(vr.id); setDraft(vr.content); }}>Edit override</button>
                        <button className="btn xs" disabled={pending} onClick={() => run(() => setVariantInheritAction(vr.id, v.noticeId))}>Revert to inherit</button>
                      </>}
                </div>
              )}

              {/* Screen 6 — device rendering QA matrix. */}
              <div className="section-label">Device rendering QA</div>
              <div className="table-wrap" style={{ margin: "4px 0 8px" }}>
                <table className="dtable">
                  <thead><tr><th>Device</th><th>Browser</th><th>Method</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {vr.checks.map((c, i) => (
                      <tr key={c.id ?? i}>
                        <td>{c.device}</td><td className="cell-sub">{c.browser}</td><td className="cell-sub">{c.method}</td>
                        <td><Pill tone={DEVICE_STATUS_TONE[c.status] ?? "gray"} dot={false}>{DEVICE_STATUS_LABEL[c.status] ?? c.status}</Pill>{c.detail && c.status === "fail" && <div className="cell-sub">{c.detail}</div>}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          {c.id && c.status !== "pass" && <button className="btn ghost xs" disabled={pending} onClick={() => run(() => setDeviceCheckAction(c.id!, "pass", "Manually verified / fixed & re-verified.", v.noticeId))}>Mark fixed &amp; re-verify</button>}
                          {c.id && c.status !== "fail" && c.method === "manual" && c.status !== "pass" && <button className="btn ghost xs" disabled={pending} onClick={() => run(() => setDeviceCheckAction(c.id!, "fail", "Rendering issue on this device.", v.noticeId))}>Flag fail</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn sm" disabled={pending} onClick={() => run(() => runVariantQAAction(vr.id, v.noticeId))}><Play size={13} /> Run QA</button>
                {vr.publishStatus === "qa_passed" && <button className="btn sm primary" disabled={pending} onClick={() => run(() => publishVariantAction(vr.id, v.noticeId))}><Rocket size={13} /> Publish this variant</button>}
                {allPass && vr.publishStatus !== "published" && <span className="cell-sub" style={{ color: "var(--green)" }}><CheckCircle2 size={13} style={{ verticalAlign: "-2px" }} /> all devices pass</span>}
              </div>
            </div>
          </div>
        );
      })}

      {/* Screen 4 — combined publish gate with explained disablement. */}
      <div className="card">
        <div className="card-head">Publish notice</div>
        <div className="card-body">
          {canPublishAll ? (
            <>
              <p className="cell-sub" style={{ margin: "0 0 10px" }}>Every variant has passed device QA. Publishing takes all variants live.</p>
              <button className="btn primary" disabled={pending} onClick={() => run(() => publishAllVariantsAction(v.noticeId))}><Rocket size={14} /> Publish all variants</button>
            </>
          ) : (
            <Notice tone="warn" title="Publish is blocked">
              <Lock size={12} style={{ verticalAlign: "-1px" }} /> Publish is disabled until every variant passes device rendering QA. Still blocking:
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {blocking.map((b) => <li key={b.id}>{b.language} — {VARIANT_PUBLISH_LABEL[b.publishStatus] ?? b.publishStatus}</li>)}
              </ul>
            </Notice>
          )}
        </div>
      </div>
    </div>
  );
}
