"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Notice } from "@/components/ui";
import { DataSection } from "@/components/activities/DataSection";
import { ProcessorSection } from "@/components/activities/ProcessorSection";
import { submitPurposeAction, withdrawPurposeAction, removePurposeFromActivityAction } from "@/app/actions/purposes";
import type { PurposePaneData } from "@/lib/engines/activities";

/** SCREEN 6 — Purpose pane header + state actions. Data and Processors sections
 *  are built in M5/M6. */
export function PurposePane({ data, activityId, onEdit, onReplace }: { data: PurposePaneData; activityId: string; onEdit: () => void; onReplace: () => void }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const refresh = () => router.refresh();
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); refresh(); });

  const consentText = data.consent === "linked" ? "Linked" : data.consent === "not_linked" ? "Not yet linked to an approved purpose" : "Not required (legitimate use)";

  return (
    <div className="stack" style={{ gap: 20, maxWidth: 680 }}>
      <div className="stack" style={{ gap: 6 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <h2 style={{ margin: 0 }}>{data.name}</h2>
          <div className="row" style={{ gap: 8 }}>
            {data.actions.includes("edit") && <button className="btn ghost sm" onClick={onEdit}>Edit purpose</button>}
            {data.actions.includes("submit") && <button className="btn ghost sm" onClick={() => run(() => submitPurposeAction(data.purposeId, activityId))}>Submit for DPO approval</button>}
            {data.actions.includes("resubmit") && <button className="btn ghost sm" onClick={() => run(() => submitPurposeAction(data.purposeId, activityId))}>Resubmit</button>}
            {data.actions.includes("withdraw") && <button className="btn ghost sm" onClick={() => run(() => withdrawPurposeAction(data.purposeId, activityId))}>Withdraw submission</button>}
            {data.actions.includes("replace") && <button className="btn ghost sm" onClick={onReplace}>Replace this purpose</button>}
            {data.actions.includes("remove") && <button className="btn ghost sm" onClick={() => setConfirmRemove(true)}>Remove from this activity</button>}
          </div>
        </div>
        <div className="row cell-sub" style={{ gap: 6, alignItems: "center" }}>{data.displayState === "approved" || data.displayState === "approved_newer_waiting" ? <Lock size={13} /> : null}{data.stateLine}</div>
        {data.displayState === "approved_newer_waiting" && data.waitingVersion && <div className="cell-sub">Version {data.waitingVersion} is waiting for approval. Version {data.version} stays in force until then.</div>}
      </div>

      {data.decisionComment && (data.displayState === "changes_requested" || data.displayState === "rejected") && (
        <Notice tone="warn" title={data.displayState === "rejected" ? "Rejected" : "Changes requested"}>{data.decisionComment}</Notice>
      )}

      {/* Read-only definition (in-force version) */}
      <div className="stack" style={{ gap: 8 }}>
        <div className="inv-sec-h">Definition</div>
        <KV k="Description" v={data.description || "—"} />
        <KV k="Legal basis" v={`${data.basisLabel}${data.legitimateUseType ? ` · ${data.legitimateUseType}` : ""}`} />
        <KV k="Retention" v={data.retentionText} />
        <KV k="Consent" v={<span className={data.consent === "not_linked" ? "sev-warning" : ""}>{consentText}</span>} />
      </div>

      {data.notApproved && <Notice tone="info" title="You can keep building">This purpose must be approved before the activity can go live. Data and processor links take effect when it is approved.</Notice>}

      <DataSection activityId={activityId} purposeId={data.purposeId} purposeName={data.name} />
      <ProcessorSection activityId={activityId} purposeId={data.purposeId} purposeName={data.name} />

      {confirmRemove && (
        <Notice tone="warn" title="Remove this purpose from the activity?">
          Its data and processor links in this activity are removed too.
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn danger sm" onClick={() => run(() => removePurposeFromActivityAction(activityId, data.purposeId))}>Remove</button>
            <button className="btn ghost sm" onClick={() => setConfirmRemove(false)}>Cancel</button>
          </div>
        </Notice>
      )}
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) { return <div className="inv-kv"><span className="cell-sub">{k}</span><span>{v}</span></div>; }
