"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCw, ArrowUpRight } from "lucide-react";
import { Pill, Notice, type PillTone } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { ActionError } from "@/components/actions";
import type { ActionResult } from "@/app/actions/requests";

/**
 * SHARED COMPONENT — MultiSystemCompletionChecklist.
 *
 * The one canonical per-system completion checklist for the whole product. It
 * renders three statuses — confirmed / manual_verification_required / failed
 * (plus pending) — and gates a parent action until EVERY row is confirmed. No
 * consumer gets a partial-completion path, and manual verification always needs
 * an explicit action + a required note (never inferred from time or silence).
 *
 * Consumers today: Rights Fulfillment (Scenario 1). Retrofit candidates flagged
 * for follow-up: Identity & Access offboarding (RevocationVerification), Breach
 * processor confirmation (ProcessorBreachThread), Grant Confirmation.
 */

export interface ChecklistSystem {
  id: string;
  name: string;
  /** automated | manual | processor */
  systemType: string;
  /** pending | confirmed | manual_verification_required | failed */
  status: string;
  confirmationReference: string | null;
  verifiedBy: string | null;
  verificationNote: string | null;
  errorDetail: string | null;
  attemptCount: number;
  addedManually?: boolean;
}

export interface ChecklistHandlers {
  onManualVerify: (systemId: string, note: string) => Promise<ActionResult>;
  onRetry: (systemId: string) => Promise<ActionResult>;
  onEscalate: (systemId: string) => Promise<ActionResult>;
}

const STATUS_LABEL: Record<string, string> = { pending: "Pending", confirmed: "Confirmed", manual_verification_required: "Manual required", failed: "Failed" };
const STATUS_TONE: Record<string, PillTone> = { pending: "gray", confirmed: "green", manual_verification_required: "yellow", failed: "red" };
const TYPE_LABEL: Record<string, string> = { automated: "Automated", manual: "Manual", processor: "Processor" };

export function MultiSystemCompletionChecklist({
  title = "Cross-system completion",
  systems,
  handlers,
  parentActionLabel,
  onParentAction,
  parentGateNote,
  gateOpenContent,
  parentDone,
  parentDoneNode,
}: {
  title?: string;
  systems: ChecklistSystem[];
  handlers: ChecklistHandlers;
  parentActionLabel: string;
  onParentAction: () => Promise<ActionResult>;
  /** Optional extra sentence shown when the parent action is still gated. */
  parentGateNote?: string;
  /** Content revealed ONLY once every row is confirmed — e.g. an evidence
   *  preview — so downstream steps are gated by this component, not a copy of
   *  its check. */
  gateOpenContent?: ReactNode;
  parentDone?: boolean;
  parentDoneNode?: ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [manualFor, setManualFor] = useState<ChecklistSystem | null>(null);
  const [note, setNote] = useState("");
  const [investigate, setInvestigate] = useState<ChecklistSystem | null>(null);

  const run = (op: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });

  const confirmed = systems.filter((s) => s.status === "confirmed").length;
  const allConfirmed = systems.length > 0 && confirmed === systems.length;
  const openCount = systems.length - confirmed;

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">{title} <span className="cell-sub">{confirmed}/{systems.length} confirmed</span></div>
        <div className="card-body" style={{ padding: 0 }}>
          <ActionError result={result} />
          {systems.map((s) => (
            <div key={s.id} className="chk-row">
              <div className="chk-main">
                <span className="cell-primary">{s.name} {s.addedManually && <span className="cell-sub">(added manually)</span>}</span>
                <span className="cell-sub">{TYPE_LABEL[s.systemType] ?? s.systemType}{s.confirmationReference ? ` · ${s.confirmationReference}` : ""}{s.verifiedBy ? ` · verified by ${s.verifiedBy}` : ""}</span>
              </div>
              <div className="chk-actions">
                <Pill tone={STATUS_TONE[s.status] ?? "gray"} dot={false}>{STATUS_LABEL[s.status] ?? s.status}</Pill>
                {s.status === "manual_verification_required" && <button className="btn xs primary" disabled={pending} onClick={() => { setManualFor(s); setNote(""); }}><Check size={12} /> Verify</button>}
                {s.status === "pending" && s.systemType === "processor" && <button className="btn xs" disabled={pending} onClick={() => { setManualFor(s); setNote(""); }}>Confirm processor</button>}
                {s.status === "failed" && <button className="btn xs" disabled={pending} onClick={() => setInvestigate(s)}><ArrowUpRight size={12} /> Investigate</button>}
              </div>
            </div>
          ))}
          {systems.length === 0 && <div className="chk-row"><span className="cell-sub">No systems in scope yet.</span></div>}
        </div>
      </div>

      {/* Gated parent action — no partial-completion path for any consumer. */}
      {parentDone ? (
        parentDoneNode ?? null
      ) : allConfirmed ? (
        <div>
          {gateOpenContent}
          <button className="btn primary" disabled={pending} onClick={() => run(onParentAction)}>{parentActionLabel}</button>
        </div>
      ) : (
        <Notice tone="warn" title={`Locked — ${openCount} system(s) not yet confirmed`}>
          {parentActionLabel} is disabled until every system is confirmed or manually verified. {parentGateNote ?? "Resolve the pending and failed rows above."}
        </Notice>
      )}

      {/* Manual verification — explicit action + required note, never inferred. */}
      {manualFor && (
        <Modal title={`Verify deletion on ${manualFor.name}`} subtitle="Manual verification is explicit and requires a note — never inferred." onClose={() => setManualFor(null)}
          footer={<><button className="btn" onClick={() => setManualFor(null)}>Cancel</button><button className="btn primary" disabled={pending || !note.trim()} onClick={() => run(() => handlers.onManualVerify(manualFor.id, note), () => setManualFor(null))}>Confirm verified</button></>}>
          <label className="fld"><span>How was this verified? (required)</span><textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Confirmed with the vendor's data team via ticket #4821; deletion evidence attached." /></label>
        </Modal>
      )}

      {/* Failed-system investigation — full error, distinct Retry / Escalate. */}
      {investigate && (
        <Modal title={`Investigate — ${investigate.name}`} subtitle="The actual system-reported error, now visible to Admin." onClose={() => setInvestigate(null)}
          footer={
            investigate.attemptCount >= 1
              ? <><button className="btn" disabled={pending} onClick={() => run(() => handlers.onRetry(investigate.id), () => setInvestigate(null))}><RotateCw size={13} /> Retry</button><button className="btn primary" disabled={pending} onClick={() => run(() => handlers.onEscalate(investigate.id), () => setInvestigate(null))}><ArrowUpRight size={13} /> Escalate to investigation</button></>
              : <><button className="btn" disabled={pending} onClick={() => run(() => handlers.onEscalate(investigate.id), () => setInvestigate(null))}><ArrowUpRight size={13} /> Escalate</button><button className="btn primary" disabled={pending} onClick={() => run(() => handlers.onRetry(investigate.id), () => setInvestigate(null))}><RotateCw size={13} /> Retry deletion</button></>
          }>
          <div className="err-panel">{investigate.errorDetail ?? "The system reported a failure."}</div>
          <p className="cell-sub" style={{ marginTop: 10 }}>Attempts so far: {investigate.attemptCount}. {investigate.attemptCount >= 1 ? "This has already failed once — escalation may be the better path than another retry." : "Retry re-triggers deletion on this one system; escalate routes it to IT/vendor investigation."}</p>
        </Modal>
      )}
    </div>
  );
}
