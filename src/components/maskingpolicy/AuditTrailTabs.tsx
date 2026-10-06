"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ShieldCheck, ShieldAlert } from "lucide-react";

export interface PolicyEvent { seq: number; label: string; at: string; fingerprint: string; prevFingerprint: string }
export interface PolicyGroup { version: number; activatedAt: string; by: string; reason: string | null; changeCount: number; events: PolicyEvent[] }
export interface FailsafeBurst { time: string; what: string; application: string; channel: string; fields: { name: string; code: string }[] }
export interface Integrity { ok: boolean; entriesChecked: number; checkedAt: string; brokenAtSeq: number | null; reason: string | null }

export function AuditTrailTabs({ groups, failsafe, failsafeSummary, integrity, initialTab }: { groups: PolicyGroup[]; failsafe: FailsafeBurst[]; failsafeSummary: string; integrity: Integrity; initialTab?: string }) {
  const [tab, setTab] = useState(initialTab === "failsafe" ? "failsafe" : "policy");
  const [list, setList] = useState(false);
  const [how, setHow] = useState(false);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="mp-audit-tabsrow">
        <div className="mp-tabs">
          <button className={`mp-tab${tab === "policy" ? " on" : ""}`} onClick={() => setTab("policy")}>Policy changes</button>
          <button className={`mp-tab${tab === "failsafe" ? " on" : ""}`} onClick={() => setTab("failsafe")}>Fail-safe events</button>
        </div>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          {integrity.ok ? (
            <span className="row" style={{ gap: 6, color: "var(--green)" }}><ShieldCheck size={14} /> Verified · {integrity.entriesChecked} entries checked {integrity.checkedAt}</span>
          ) : (
            <span className="row" style={{ gap: 6, color: "var(--red)" }}><ShieldAlert size={14} /> Integrity check failed at entry {integrity.brokenAtSeq}. Found {integrity.checkedAt}.</span>
          )}
          <button className="link-btn" onClick={() => setHow((h) => !h)}>How this works</button>
          <button className="btn ghost sm">Export CSV</button>
        </div>
      </div>
      {how && <p className="cell-sub" style={{ margin: 0 }}>Each entry is cryptographically linked to the one before it, so any change, deletion or reordering is detected.</p>}
      {!integrity.ok && <div className="notice danger" style={{ margin: 0 }}><div className="notice-title">What this means</div><div>An entry was changed, removed or reordered after it was recorded. Export the log and contact your security team.</div></div>}

      {tab === "policy" ? (
        <div className="stack" style={{ gap: 10 }}>
          <div className="row" style={{ justifyContent: "flex-end" }}><button className="link-btn" onClick={() => setList((l) => !l)}>{list ? "Grouped" : "List"}</button></div>
          {groups.length === 0 ? <p className="cell-sub">No policy changes recorded yet. Activations you make appear here.</p> : groups.map((g) => (
            <section key={g.version} className="mp-audit-group">
              <div className="mp-audit-grouphead"><strong>Version {g.version} · activated {g.activatedAt} · {g.by}</strong>{g.reason && <span className="cell-sub"> &ldquo;{g.reason}&rdquo;</span>} <span className="cell-sub">· {g.changeCount} change{g.changeCount === 1 ? "" : "s"}</span> <Link href={`/data-flow/masking-policy?version=${g.version}`} className="row-link">View version</Link></div>
              <div className="stack" style={{ gap: 2, marginTop: 6 }}>{g.events.map((e) => <EventRow key={e.seq} e={e} list={list} />)}</div>
            </section>
          ))}
        </div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          <p className="cell-sub" style={{ margin: 0 }}>Times an application had to fully hide a field because it couldn&rsquo;t apply your policy. It never contains personal data or user identities.</p>
          <p style={{ margin: 0 }}>{failsafeSummary}</p>
          {failsafe.length > 0 && (
            <div className="table-wrap"><table className="dtable compact">
              <thead><tr><th>Time</th><th>What happened</th><th>Application</th><th>Channel</th><th>Fields</th></tr></thead>
              <tbody>{failsafe.map((b, i) => <FailsafeRow key={i} b={b} />)}</tbody>
            </table></div>
          )}
        </div>
      )}
    </div>
  );
}

function EventRow({ e, list }: { e: PolicyEvent; list: boolean }) {
  const [open, setOpen] = useState(list);
  return (
    <div className="mp-audit-event">
      <button className="mp-catgroup-head" onClick={() => setOpen((o) => !o)}>{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<span>{e.label}</span><span className="cell-sub">{e.at}</span></button>
      {open && <div className="stack" style={{ gap: 2, paddingLeft: 20, marginTop: 2 }}>
        <span className="cell-sub">Entry #{e.seq}</span>
        <span className="cell-sub mono">fingerprint {e.fingerprint}</span>
        <span className="cell-sub mono">previous {e.prevFingerprint}</span>
      </div>}
    </div>
  );
}

function FailsafeRow({ b }: { b: FailsafeBurst }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr onClick={() => setOpen((o) => !o)} style={{ cursor: "pointer" }}>
        <td className="cell-sub">{b.time}</td>
        <td>{b.fields.length} field{b.fields.length === 1 ? "" : "s"} hidden · {b.what}</td>
        <td className="cell-sub">{b.application}</td>
        <td className="cell-sub">{b.channel}</td>
        <td className="cell-sub">{open ? "Hide" : `${b.fields.length} fields`}</td>
      </tr>
      {open && <tr><td colSpan={5}><div className="stack" style={{ gap: 2, paddingLeft: 10 }}>{b.fields.map((f) => <span key={f.code} className="cell-sub">{f.name} <span className="mono">{f.code}</span></span>)}</div></td></tr>}
    </>
  );
}
