"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, RefreshCw } from "lucide-react";
import { Notice, Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { publishCookiePolicyVersionAction } from "@/app/actions/cookieCompliance";
import type { ActionResult } from "@/app/actions/requests";

export interface VersionRow { id: string; version: string; summary: string | null; publishedAt: string; publishedBy: string | null; affectedCount: number }
export interface BatchLogRow { id: string; purposeName: string | null; detail: string | null; processedAt: string }

export function PolicyReconsent({ versions, log }: { versions: VersionRow[]; log: BatchLogRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<(ActionResult & { affected?: number }) | null>(null);
  const [version, setVersion] = useState("");
  const [summary, setSummary] = useState("");
  const publish = () => start(async () => { const r = await publishCookiePolicyVersionAction(version, summary); setResult(r); if (r.ok) { setVersion(""); setSummary(""); router.refresh(); } });

  return (
    <div className="stack" style={{ gap: 16 }}>
      <ActionError result={result} />
      {result?.ok && <Notice tone="ok" title={`Re-consent triggered for ${result.affected} returning visitor(s)`}>They are re-prompted under the new policy version. No consent record was deleted — each is preserved as history.</Notice>}

      <Notice tone="info" title="A second re-consent trigger, one engine">Publishing a new cookie-policy version reuses the existing re-consent engine (alongside retention-based expiry). Returning visitors are re-prompted rather than silently continuing under old consent.</Notice>

      <div className="card">
        <div className="card-head"><span className="row" style={{ gap: 6 }}><FileUp size={14} /> Publish a new cookie-policy version</span></div>
        <div className="card-body">
          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label className="fld" style={{ margin: 0 }}><span>Version label</span><input className="input" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. v2.0" /></label>
            <label className="fld" style={{ margin: 0, flex: 1, minWidth: 240 }}><span>What changed</span><input className="input" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="e.g. Added analytics vendor, revised retention" /></label>
            <button className="btn primary sm" disabled={pending || !version.trim()} onClick={publish}><RefreshCw size={13} /> Publish & trigger re-consent</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">Published versions</div>
        <div className="card-body">
          {versions.length === 0 && <p className="cell-sub">No cookie-policy versions published yet.</p>}
          {versions.map((v) => (
            <div key={v.id} className="pick-row">
              <div className="cell-stack" style={{ flex: 1 }}>
                <span className="cell-primary">{v.version} <span className="cell-sub">· {v.summary ?? "no summary"}</span></span>
                <span className="cell-sub">Published {v.publishedAt}{v.publishedBy ? ` by ${v.publishedBy}` : ""}</span>
              </div>
              <Pill tone="purple" dot={false}>{v.affectedCount} re-prompted</Pill>
            </div>
          ))}
        </div>
      </div>

      {log.length > 0 && (
        <div className="card">
          <div className="card-head">Re-consent batch log <span className="cell-sub">latest policy change</span></div>
          <div className="card-body">
            {log.slice(0, 10).map((l) => (
              <div key={l.id} className="pick-row">
                <span className="cell-primary" style={{ flex: 1 }}>{l.purposeName ?? "—"}</span>
                <span className="cell-sub">{l.detail}</span>
                <span className="cell-sub">{l.processedAt}</span>
              </div>
            ))}
            {log.length > 10 && <p className="cell-sub" style={{ marginTop: 6 }}>+ {log.length - 10} more re-prompted.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
