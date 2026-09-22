"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Search, Download, Sparkles } from "lucide-react";
import { Pill, Notice } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { decideEntryAction, markDeliveredAction, markSearchingAction } from "@/app/actions/scenario3";
import { EXPORT_FORMATS, EVIDENCE_STATUS_LABEL } from "@/lib/scenario3";
import type { ActionResult } from "@/app/actions/requests";

export interface EntryRow {
  id: string;
  sourceModule: string;
  eventType: string;
  eventDescription: string;
  occurredAt: string;
  suggested: boolean;
}
export interface EvidenceView {
  requestId: string;
  customerId: string;
  claimedEvent: string;
  requestedBy: string;
  dateRange: string;
  status: string;
  hint: string | null;
  entries: EntryRow[];
  decisions: Record<string, boolean>; // logEntryId -> confirmed(true)/rejected(false)
}

export function EvidenceWorkspace({ view }: { view: EvidenceView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [decisions, setDecisions] = useState<Record<string, boolean>>(view.decisions);
  const [step, setStep] = useState<"verify" | "export">("verify");
  const [format, setFormat] = useState<string>("pdf");
  const delivered = view.status === "delivered";

  // Opening the search advances a fresh request received → searching.
  useEffect(() => {
    if (view.status === "received") markSearchingAction(view.requestId).then(() => router.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decide = (id: string, confirmed: boolean, suggested: boolean) =>
    start(async () => {
      setDecisions((d) => ({ ...d, [id]: confirmed }));
      const r = await decideEntryAction(view.requestId, id, confirmed, suggested);
      setResult(r);
      if (!r.ok) { setDecisions(view.decisions); } else { router.refresh(); }
    });

  const total = view.entries.length;
  const decidedCount = view.entries.filter((e) => e.id in decisions).length;
  const confirmedCount = view.entries.filter((e) => decisions[e.id] === true).length;
  const allDecided = total > 0 && decidedCount === total;
  const confirmed = view.entries.filter((e) => decisions[e.id] === true);

  const grouped = useMemo(() => {
    const g = new Map<string, EntryRow[]>();
    for (const e of view.entries) { const a = g.get(e.sourceModule) ?? []; a.push(e); g.set(e.sourceModule, a); }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [view.entries]);

  const runExport = () => {
    if (format === "csv" || format === "json") {
      const rows = confirmed.map((e) => ({ source_module: e.sourceModule, event_type: e.eventType, description: e.eventDescription, occurred_at: e.occurredAt, log_entry_id: e.id }));
      let blob: Blob;
      if (format === "csv") {
        const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
        const lines = ["source_module,event_type,description,occurred_at,log_entry_id", ...rows.map((r) => [r.source_module, r.event_type, r.description, r.occurred_at, r.log_entry_id].map(esc).join(","))];
        blob = new Blob([lines.join("\n")], { type: "text/csv" });
      } else {
        blob = new Blob([JSON.stringify({ request: { customer: view.customerId, claimedEvent: view.claimedEvent, requestedBy: view.requestedBy }, entries: rows }, null, 2)], { type: "application/json" });
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `evidence-${view.customerId}.${format}`; a.click(); URL.revokeObjectURL(url);
    } else {
      const w = window.open("", "_blank"); if (!w) return;
      const body = confirmed.map((e) => `<tr><td>${e.sourceModule}</td><td>${e.eventType}</td><td>${e.eventDescription}</td><td>${e.occurredAt}</td></tr>`).join("");
      w.document.write(`<!doctype html><html><head><title>Evidence — ${view.customerId}</title><style>body{font:13px -apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;margin:32px;max-width:760px}h1{font-size:19px;margin:0 0 4px}.k{color:#64748b}table{border-collapse:collapse;width:100%;font-size:12px;margin-top:8px}td,th{border:1px solid #e2e8f0;padding:5px 7px;text-align:left}</style></head><body><h1>Audit evidence package</h1><div class="k">Customer ${view.customerId} · requested by ${view.requestedBy}</div><div class="k">Claimed event: ${view.claimedEvent}</div><table><thead><tr><th>Module</th><th>Event</th><th>Description</th><th>When</th></tr></thead><tbody>${body}</tbody></table><p class="k" style="margin-top:20px">${confirmed.length} confirmed entries · generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC</p><script>window.print()</script></body></html>`);
      w.document.close();
    }
  };

  const deliver = () =>
    start(async () => { const r = await markDeliveredAction(view.requestId, format); setResult(r); if (r.ok) router.refresh(); });

  return (
    <div>
      {/* Claimed-event statement — pinned throughout. */}
      <div className="claim-pin">
        <span className="claim-label">Claimed event</span>
        <span className="claim-text">“{view.claimedEvent}”</span>
        <span className="cell-sub">Customer <span className="mono">{view.customerId}</span> · {view.dateRange} · requested by {view.requestedBy} · <Pill tone={delivered ? "green" : "blue"} dot={false}>{EVIDENCE_STATUS_LABEL[view.status] ?? view.status}</Pill></span>
      </div>

      <ActionError result={result} />

      <nav className="stepper" style={{ margin: "14px 0" }}>
        <button className={`step${step === "verify" ? " active" : ""}`} onClick={() => setStep("verify")} style={{ background: "none", border: 0, cursor: "pointer", font: "inherit" }}>
          <span className="step-label"><Search size={13} style={{ verticalAlign: "-2px" }} /> Search &amp; verify</span>
          <span className="step-sub">{decidedCount}/{total} decided</span>
        </button>
        <button className={`step${step === "export" ? " active" : ""}${!allDecided ? " locked" : ""}`} onClick={() => allDecided && setStep("export")} disabled={!allDecided} style={{ background: "none", border: 0, cursor: allDecided ? "pointer" : "not-allowed", font: "inherit" }}>
          <span className="step-label"><Download size={13} style={{ verticalAlign: "-2px" }} /> Export &amp; deliver</span>
          <span className="step-sub">{allDecided ? `${confirmedCount} confirmed` : "decide every entry first"}</span>
        </button>
      </nav>

      {step === "verify" && (
        <div>
          <p className="cell-sub" style={{ margin: "0 0 10px" }}>
            Unified search across every module&apos;s audit log for this customer{view.hint ? <> · entries matching the hint <Pill tone="purple" dot={false}>{view.hint}</Pill> are highlighted but never hidden</> : null}. Every entry — suggested or not — needs an explicit confirm or reject before export.
          </p>

          {total === 0 && (
            <Notice tone="info" title="Search ran — no matching audit entries">
              The unified search completed and found no audit-log entries for <span className="mono">{view.customerId}</span> in this date range. This is a definitive empty result, not a pending search.
            </Notice>
          )}

          {grouped.map(([mod, entries]) => (
            <div key={mod} className="ev-group">
              <div className="ev-group-head">{mod} <span className="cell-sub">{entries.length}</span></div>
              {entries.map((e) => {
                const d = decisions[e.id];
                return (
                  <div key={e.id} className={`ev-entry${d === true ? " confirmed" : d === false ? " rejected" : ""}`}>
                    <div className="ev-entry-main">
                      <span className="ev-entry-type">
                        {e.eventType}
                        {e.suggested && <span className="ev-suggested" title="Auto-highlighted by the event-type hint — still needs your decision"><Sparkles size={11} /> suggested</span>}
                      </span>
                      <span className="cell-sub">{e.eventDescription}</span>
                      <span className="cell-sub mono">{e.occurredAt}</span>
                    </div>
                    <div className="ev-entry-actions">
                      {d === true && <Pill tone="green" dot={false}>Confirmed</Pill>}
                      {d === false && <Pill tone="gray" dot={false}>Rejected</Pill>}
                      <button className={`btn xs${d === true ? " primary" : ""}`} disabled={pending || delivered} onClick={() => decide(e.id, true, e.suggested)}><Check size={12} /> Confirm</button>
                      <button className="btn xs" disabled={pending || delivered} onClick={() => decide(e.id, false, e.suggested)}><X size={12} /> Reject</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {total > 0 && (
            <div className="ev-gate">
              <strong>{confirmedCount} of {total} confirmed</strong> · {decidedCount} of {total} decided.
              {allDecided ? <> Every entry has a decision — <button className="btn sm primary" onClick={() => setStep("export")}>Continue to export →</button></> : <span className="cell-sub"> Export unlocks once every entry is decided.</span>}
            </div>
          )}
        </div>
      )}

      {step === "export" && (
        <div>
          <p className="cell-sub" style={{ margin: "0 0 10px" }}>The package contains only the {confirmedCount} confirmed entr{confirmedCount === 1 ? "y" : "ies"} — rejected and undecided entries are never included.</p>
          <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <span className="cell-sub">Format:</span>
            {EXPORT_FORMATS.map((fmt) => (
              <button key={fmt} className={`btn sm${format === fmt ? " primary" : ""}`} onClick={() => setFormat(fmt)}>{fmt.toUpperCase()}</button>
            ))}
            <button className="btn sm" onClick={runExport}><Download size={13} /> Export {format.toUpperCase()}</button>
            {!delivered && <button className="btn sm primary" disabled={pending} onClick={deliver} style={{ marginLeft: "auto" }}>Mark delivered</button>}
            {delivered && <Pill tone="green" dot={false}>Delivered</Pill>}
          </div>
          <div className="table-wrap">
            <table className="dtable">
              <thead><tr><th>Module</th><th>Event</th><th>Description</th><th>When</th></tr></thead>
              <tbody>
                {confirmed.map((e) => (
                  <tr key={e.id}><td>{e.sourceModule}</td><td className="mono">{e.eventType}</td><td>{e.eventDescription}</td><td className="cell-sub mono">{e.occurredAt}</td></tr>
                ))}
                {confirmed.length === 0 && <tr><td colSpan={4}><div className="empty">No confirmed entries to export.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
