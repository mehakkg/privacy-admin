"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Check, X } from "lucide-react";
import { Notice, Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { runVariantQAAction, setDeviceCheckAction } from "@/app/actions/scenario6";
import { DEVICE_STATUS_TONE, DEVICE_STATUS_LABEL } from "@/lib/scenario6";
import type { ActionResult } from "@/app/actions/requests";

export interface NoticeOpt { id: string; name: string }
export interface CheckCell { id: string; device: string; browser: string; method: string; status: string; detail: string | null }
export interface VariantView { id: string; language: string; publishStatus: string; checks: CheckCell[] }

export function LanguageQAMatrix({ notices, noticeId, noticeName, variants }: { notices: NoticeOpt[]; noticeId: string; noticeName: string; variants: VariantView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [lang, setLang] = useState<string>("all");

  const run = (op: () => Promise<ActionResult>) => start(async () => { const r = await op(); setResult(r); if (r.ok) router.refresh(); });
  const shown = lang === "all" ? variants : variants.filter((v) => v.language === lang);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <ActionError result={result} />
      <Notice tone="info" title="One QA engine, one more axis">The same device × browser rendering check as Device Rendering QA, extended with language. Verify each language variant renders correctly — text doesn&rsquo;t overflow, scripts display — not just that a translation exists.</Notice>

      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="fld" style={{ margin: 0 }}><span>Notice</span>
          <select className="input" value={noticeId} onChange={(e) => router.push(`/consent/language-qa?notice=${e.target.value}`)}>
            {notices.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </label>
        <label className="fld" style={{ margin: 0 }}><span>Language</span>
          <select className="input" value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="all">All languages</option>
            {variants.map((v) => <option key={v.id} value={v.language}>{v.language}</option>)}
          </select>
        </label>
      </div>

      {shown.length === 0 && <div className="empty">No language variants for {noticeName}. Generate them in Language variant management.</div>}

      {shown.map((v) => (
        <div key={v.id} className="card">
          <div className="card-head">
            <span className="row" style={{ gap: 8 }}>{v.language} <Pill tone={v.publishStatus === "published" ? "green" : v.publishStatus === "qa_passed" ? "blue" : "gray"} dot={false}>{v.publishStatus}</Pill></span>
            <button className="btn xs primary" style={{ marginLeft: "auto" }} disabled={pending} onClick={() => run(() => runVariantQAAction(v.id, noticeId))}><Play size={11} /> Run rendering QA</button>
          </div>
          <div className="card-body">
            {v.checks.length === 0 ? (
              <p className="cell-sub">No checks yet — run rendering QA to populate the device matrix for this language.</p>
            ) : (
              <div className="table-wrap">
                <table className="dtable">
                  <thead><tr><th>Device</th><th>Browser</th><th>Method</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {v.checks.map((c) => (
                      <tr key={c.id}>
                        <td className="cell-primary">{c.device}</td>
                        <td className="cell-sub">{c.browser}</td>
                        <td className="cell-sub">{c.method}</td>
                        <td><Pill tone={DEVICE_STATUS_TONE[c.status] ?? "gray"} dot={false}>{DEVICE_STATUS_LABEL[c.status] ?? c.status}</Pill>{c.detail && <span className="cell-sub"> · {c.detail}</span>}</td>
                        <td>
                          {c.method === "manual" && c.status !== "pass" && (
                            <span className="row" style={{ gap: 4 }}>
                              <button className="btn xs" disabled={pending} onClick={() => run(() => setDeviceCheckAction(c.id, "pass", "Manually verified", noticeId))}><Check size={11} /> Pass</button>
                              <button className="btn xs ghost" disabled={pending} onClick={() => run(() => setDeviceCheckAction(c.id, "fail", "Script rendering issue on this device", noticeId))}><X size={11} /> Fail</button>
                            </span>
                          )}
                          {c.status === "fail" && c.method === "automated" && (
                            <button className="btn xs" disabled={pending} onClick={() => run(() => setDeviceCheckAction(c.id, "pass", "Fixed and re-verified", noticeId))}>Re-verify</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
