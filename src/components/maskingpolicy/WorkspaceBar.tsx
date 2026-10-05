"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { DiscardDraftButton } from "@/components/maskingpolicy/PolicyActions";
import type { PolicyCheck } from "@/lib/maskingpolicy";
import type { ImpactSummary } from "@/lib/engines/maskingpolicy";

const BASE = "/data-flow/masking-policy";

export function WorkspaceBar({ draftNumber, basedOn, savedAt, decisionsOpen, checks, impact }: {
  draftNumber: number; basedOn: number | null; savedAt: string; decisionsOpen: number; checks: PolicyCheck[]; impact: ImpactSummary;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<null | "checks" | "changes">(null);
  const blocking = checks.filter((c) => c.level === "blocking" && !c.ok);
  const hasChanges = impact.counts.changes > 0;

  return (
    <div className="mp-topbar">
      <div className="stack" style={{ gap: 2 }}>
        <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
          <strong>Draft version {draftNumber}</strong>
          {basedOn != null && <span className="cell-sub">Based on version {basedOn}</span>}
        </div>
        <span className="cell-sub">Saved {savedAt}</span>
      </div>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {decisionsOpen > 0 && <button className="mp-chip warn" onClick={() => document.getElementById("mp-decisions")?.scrollIntoView({ behavior: "smooth" })}>{decisionsOpen} decision{decisionsOpen === 1 ? "" : "s"} open</button>}
        <button className={`mp-chip${blocking.length ? " danger" : ""}`} onClick={() => setPanel("checks")}>{blocking.length ? `${blocking.length} check${blocking.length === 1 ? "" : "s"} failing` : "Checks"}</button>
        <button className="mp-chip" onClick={() => setPanel("changes")}>{impact.counts.changes} change{impact.counts.changes === 1 ? "" : "s"}</button>
        {hasChanges
          ? <button className="btn primary" onClick={() => router.push(`${BASE}?view=review`)}>Review and activate</button>
          : <span className="cell-sub" style={{ maxWidth: 280 }}>Nothing to activate. Display names and sample values save automatically and don&rsquo;t create a version.</span>}
        <DiscardDraftButton />
      </div>

      {panel && createPortal(
        <div className="modal-scrim" onClick={() => setPanel(null)}>
          <div className="modal std-modal md" onClick={(e) => e.stopPropagation()}>
            <div className="std-modal-head"><h3 style={{ margin: 0 }}>{panel === "checks" ? "Checks" : "Changes in this draft"}</h3><button className="icon-btn" onClick={() => setPanel(null)}><X size={16} /></button></div>
            <div className="std-modal-body">
              {panel === "checks" ? (
                <div className="stack" style={{ gap: 8 }}>
                  {checks.map((c, i) => (
                    <div key={i} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                      {c.level === "blocking" && !c.ok ? <AlertTriangle size={15} style={{ color: "var(--red)", flexShrink: 0 }} /> : c.level === "warning" ? <AlertTriangle size={15} style={{ color: "var(--yellow)", flexShrink: 0 }} /> : <CheckCircle2 size={15} style={{ color: "var(--green)", flexShrink: 0 }} />}
                      <span>{c.message}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="stack" style={{ gap: 6 }}>
                  {impact.items.length === 0 ? <p className="cell-sub">No behavioural changes yet.</p> : impact.items.map((it, i) => (
                    <div key={i} className="row" style={{ gap: 8, justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid var(--border-soft)" }}>
                      <span>{it.audienceLabel}{it.channelLabel ? `, on ${it.channelLabel}` : ""} · {it.fieldName}</span>
                      <span className="row" style={{ gap: 8 }}><span className="mono cell-sub">{it.before} → {it.after}</span><span className={`mp-dir ${it.direction.toLowerCase()}`}>{it.direction}</span></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
