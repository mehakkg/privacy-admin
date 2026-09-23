"use client";

import { useEffect, useState, useTransition } from "react";
import { ShieldCheck, ShieldAlert, X, Clock, Download, Search } from "lucide-react";
import { Stat, Pill } from "@/components/ui";
import { runSpotCheckAction, type SpotCheckResult } from "@/app/actions/consentIntegrity";
import { apiRetrievabilityCheckAction } from "@/app/actions/consentInfra";
import type { ApiCheckResult } from "@/lib/engines/consentInfra";

export interface ChangeAttempt { at: string; by: string; summary: string }
export interface ArtifactRow {
  id: string; subject: string; purpose: string; channel: string; createdAt: string;
  lastResult: string | null; changeAttempts: ChangeAttempt[];
}

export function ConsentIntegrity({ rows, total, failures, changeAttempts, lastRun }: { rows: ArtifactRow[]; total: number; failures: number; changeAttempts: number; lastRun: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<ArtifactRow | null>(null);
  const filtered = rows.filter((r) => !q || r.subject.toLowerCase().includes(q.toLowerCase()) || r.id.toLowerCase().includes(q.toLowerCase()) || r.purpose.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div className="stat-row">
        <Stat label="Total artifacts" value={total} />
        <Stat label="Integrity failures" value={failures} tone={failures === 0 ? "green" : "red"} />
        <Stat label="Change attempts logged" value={changeAttempts} />
        <Stat label="Last verification run" value={lastRun} />
      </div>

      <p className="integrity-explainer">
        Each consent record is hashed and timestamped at creation. Any attempt to alter it is rejected and logged here — this doesn&rsquo;t change what&rsquo;s stored, it shows you it <em>can&rsquo;t</em> be changed.
      </p>

      <div className="row" style={{ marginBottom: 10 }}>
        <span className="input sm" style={{ display: "inline-flex", alignItems: "center", gap: 6, width: 280 }}>
          <Search size={13} className="muted" />
          <input style={{ border: 0, outline: 0, background: "none", flex: 1, font: "inherit" }} placeholder="Search subject, purpose, record ID…" value={q} onChange={(e) => setQ(e.target.value)} />
        </span>
      </div>

      <div className="table-wrap">
        <table className="dtable">
          <thead><tr><th>Record ID</th><th>Subject</th><th>Purpose</th><th>Channel</th><th>Created</th><th>Status</th><th /></tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="mono cell-sub">{r.id.slice(0, 10)}…</td>
                <td className="cell-primary">{r.subject}</td>
                <td className="cell-sub">{r.purpose}</td>
                <td className="cell-sub">{r.channel}</td>
                <td className="cell-sub">{r.createdAt}</td>
                <td>
                  {r.lastResult === "mismatch" ? <Pill tone="red">Mismatch</Pill> : r.lastResult === "match" ? <Pill tone="green" dot={false}>Verified</Pill> : <span className="cell-sub">Not checked</span>}
                </td>
                <td><button className="btn sm" onClick={() => setOpen(r)}>Run spot-check</button></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7}><div className="empty"><p style={{ margin: 0 }}>No records match.</p></div></td></tr>}
          </tbody>
        </table>
      </div>

      {open && <VerificationDrawer row={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function VerificationDrawer({ row, onClose }: { row: ArtifactRow; onClose: () => void }) {
  const [, start] = useTransition();
  const [res, setRes] = useState<SpotCheckResult | null>(null);
  const [running, setRunning] = useState(true);
  const [tab, setTab] = useState<"hash" | "api">("hash");
  const [apiRes, setApiRes] = useState<ApiCheckResult | null>(null);
  const [apiRunning, setApiRunning] = useState(false);

  useEffect(() => {
    setRunning(true);
    start(async () => { const r = await runSpotCheckAction(row.id); setRes(r); setRunning(false); });
  }, [row.id]);

  // Lazily run the API retrievability check the first time that tab is opened.
  useEffect(() => {
    if (tab === "api" && !apiRes && !apiRunning) {
      setApiRunning(true);
      start(async () => { const r = await apiRetrievabilityCheckAction(row.id); setApiRes(r); setApiRunning(false); });
    }
  }, [tab, apiRes, apiRunning, row.id]);

  const matched = res?.matched;

  const exportCertificate = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Verification Certificate — ${row.id}</title>
      <style>body{font:14px system-ui;margin:40px;color:#111827}h1{font-size:18px}dt{color:#6b7280;font-size:12px;margin-top:10px}dd{margin:0;font-weight:600}.hash{font-family:monospace;font-size:11px;word-break:break-all}.verdict{padding:12px;border-radius:8px;font-weight:700;margin:16px 0}.ok{background:#d1fae5;color:#065f46}.bad{background:#fee2e2;color:#991b1b}</style></head>
      <body><h1>Consent Artifact Verification Certificate</h1>
      <div class="verdict ${matched ? "ok" : "bad"}">${matched ? "✓ VERIFIED — hashes match" : "⚠ MISMATCH DETECTED"}</div>
      <dl><dt>Record ID</dt><dd>${row.id}</dd><dt>Subject</dt><dd>${row.subject}</dd><dt>Purpose</dt><dd>${row.purpose}</dd><dt>Channel</dt><dd>${row.channel}</dd><dt>Created</dt><dd>${row.createdAt}</dd>
      <dt>Stored hash (at creation)</dt><dd class="hash">${res?.storedHash ?? "—"}</dd>
      <dt>Recomputed hash (this check)</dt><dd class="hash">${res?.recomputedHash ?? "—"}</dd>
      <dt>Result</dt><dd>${matched ? "MATCH" : "MISMATCH"}</dd>
      <dt>Checked at</dt><dd>${res?.checkedAt ? new Date(res.checkedAt).toLocaleString() : "—"}</dd></dl>
      <p style="margin-top:24px;color:#6b7280;font-size:12px">Generated by Privacy Console · suitable for submission to an auditor or the Board.</p>
      <script>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer-panel" style={{ background: "var(--bg)", width: "min(560px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head drawer-sticky"><strong>Verification — {row.subject}</strong><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <div className="drawer-body">
          <nav className="stepper" style={{ marginBottom: 14 }}>
            <button className={`step${tab === "hash" ? " active" : ""}`} onClick={() => setTab("hash")}><span className="step-label">Hash Check</span></button>
            <button className={`step${tab === "api" ? " active" : ""}`} onClick={() => setTab("api")}><span className="step-label">API Retrievability</span></button>
          </nav>

          {tab === "api" ? (
            <ApiCheckPanel res={apiRes} running={apiRunning} />
          ) : running || !res ? (
            <div className="empty" style={{ padding: 28 }}><p style={{ margin: 0 }}>Recomputing hash and comparing…</p></div>
          ) : (
            <>
              <div className={`integrity-verdict ${matched ? "ok" : "mismatch"}`}>
                {matched ? <ShieldCheck size={22} /> : <ShieldAlert size={22} />}
                {matched ? "Verified — hashes match" : "Mismatch detected — this artifact does not match its stored hash"}
              </div>

              <div className="hash-compare">
                <div className="hash-box"><div className="section-label">Stored hash (at creation)</div><div className="mono">{res.storedHash ?? "— none stored —"}</div></div>
                <div className={`hash-box${matched ? "" : " mismatch"}`}><div className="section-label">Recomputed hash (now)</div><div className="mono">{res.recomputedHash}</div></div>
              </div>

              <h3 className="drawer-section">Change-attempt history</h3>
              {row.changeAttempts.length === 0 ? (
                <p className="cell-sub">No modification attempts on this record.</p>
              ) : (
                <ol className="timeline">
                  {row.changeAttempts.map((c, i) => (
                    <li key={i} className="timeline-item"><span className="timeline-dot" style={{ background: "var(--red)" }} />
                      <div className="stack" style={{ gap: 1 }}>
                        <span className="cell-primary">Change attempt — <span style={{ color: "var(--red)" }}>rejected</span></span>
                        <span className="cell-sub"><Clock size={11} style={{ verticalAlign: "-1px" }} /> {c.at} · {c.by}</span>
                        <span className="cell-sub">{c.summary}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              <button className="btn primary" style={{ marginTop: 16 }} onClick={exportCertificate}><Download size={14} /> Export verification certificate</button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

/** API Retrievability tab — shows the ACTUAL Consent API payload for this
 *  artifact and flags any missing granular field with the same severity as a
 *  hash mismatch. */
function ApiCheckPanel({ res, running }: { res: ApiCheckResult | null; running: boolean }) {
  if (running || !res) return <div className="empty" style={{ padding: 28 }}><p style={{ margin: 0 }}>Calling the Consent API for this artifact…</p></div>;
  if (!res.ok) return <div className={`integrity-verdict mismatch`}><ShieldAlert size={22} /> {res.error}</div>;
  const passed = res.passed;
  return (
    <>
      <div className={`integrity-verdict ${passed ? "ok" : "mismatch"}`}>
        {passed ? <ShieldCheck size={22} /> : <ShieldAlert size={22} />}
        {passed ? "API returns correct granular, timestamped, purpose-specific data" : "API response is incomplete — flagged, same severity as a hash mismatch"}
      </div>
      {!passed && res.gaps && res.gaps.length > 0 && (
        <div className="hash-box mismatch" style={{ marginBottom: 12 }}>
          <div className="section-label">Missing / incorrect fields</div>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{res.gaps.map((g, i) => <li key={i} className="cell-sub">{g}</li>)}</ul>
        </div>
      )}
      <div className="section-label">Actual API response</div>
      <pre className="hash-box mono" style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 4 }}>{JSON.stringify(res.payload, null, 2)}</pre>
    </>
  );
}
