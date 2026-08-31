"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  acknowledgeExceptionAction,
  confirmManualAction,
  confirmProcessorActionAction,
  escalateFailureAction,
  executeSystemAction,
  instructProcessorAction,
  recordRulingAction,
  requestOverrideAction,
  resolveIdentityAction,
  retryExecutionAction,
  runTickAction,
  sendPreNoticeAction,
  setChecklistItemAction,
  type ActionResult,
} from "@/app/actions/requests";
import type { EscalationRuling } from "@/lib/domain";

/**
 * Every mutation the Admin UI can perform goes through one of these.
 *
 * They all share the same shape: call the server action, and if the server
 * refuses, show exactly what it said. Refusals here are not validation
 * niceties — they are the retention gate, the DPA-scope check and the
 * unilateral-override guard reporting that they stopped something. Showing the
 * server's own message (with its statutory citation) is the point.
 */

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const run = (operation: () => Promise<ActionResult>) => {
    start(async () => {
      const r = await operation();
      setResult(r);
      if (r.ok) router.refresh();
    });
  };

  return { pending, result, run, clear: () => setResult(null) };
}

export function ActionError({ result }: { result: ActionResult | null }) {
  if (!result || result.ok) return null;
  return (
    <div className="notice danger" style={{ marginTop: 10 }}>
      <div className="notice-title">Refused by the server — {result.errorKind}</div>
      <div>{result.error}</div>
    </div>
  );
}

function Btn({
  onClick,
  pending,
  disabled,
  variant = "",
  children,
}: {
  onClick: () => void;
  pending: boolean;
  disabled?: boolean;
  variant?: string;
  children: ReactNode;
}) {
  return (
    <button
      className={`btn ${variant}`}
      onClick={onClick}
      disabled={pending || disabled}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

// ---------------------------------------------------------------------------

export function PreNoticeButton({ requestId }: { requestId: string }) {
  const { pending, result, run } = useAction();
  return (
    <div>
      <Btn pending={pending} onClick={() => run(() => sendPreNoticeAction(requestId))}>
        Send 48-hour notice
      </Btn>
      <ActionError result={result} />
    </div>
  );
}

export function ExecuteButton({
  requestId,
  systemId,
  label = "Execute",
  disabled,
}: {
  requestId: string;
  systemId: string;
  label?: string;
  disabled?: boolean;
}) {
  const { pending, result, run } = useAction();
  return (
    <div>
      <Btn
        pending={pending}
        disabled={disabled}
        variant="primary"
        onClick={() => run(() => executeSystemAction(requestId, systemId))}
      >
        {label}
      </Btn>
      <ActionError result={result} />
    </div>
  );
}

export function RetentionActions({
  requestId,
  exceptionId,
  reviewStatus,
}: {
  requestId: string;
  exceptionId: string;
  reviewStatus: string;
}) {
  const { pending, result, run } = useAction();
  const [reason, setReason] = useState("");
  const [showForm, setShowForm] = useState(false);

  if (reviewStatus === "override_requested") {
    return (
      <span className="cell-sub">
        Awaiting the DPO&apos;s ruling. Admin cannot resolve this.
      </span>
    );
  }
  if (reviewStatus === "overridden" || reviewStatus === "upheld") {
    return <span className="cell-sub">Ruled on by the DPO.</span>;
  }

  const acknowledged = reviewStatus === "acknowledged";

  return (
    <div>
      <div className="row">
        {acknowledged ? (
          <span className="cell-sub">
            Acknowledged — these fields are withheld from deletion and execution
            is no longer blocked by this obligation.
          </span>
        ) : (
          <Btn
            pending={pending}
            onClick={() => run(() => acknowledgeExceptionAction(requestId, exceptionId))}
          >
            Acknowledge — withhold these fields
          </Btn>
        )}
        <button className="btn ghost" onClick={() => setShowForm((s) => !s)}>
          Request override from DPO
        </button>
      </div>

      {showForm && (
        <div style={{ marginTop: 10 }}>
          <p className="cell-sub" style={{ margin: "0 0 6px" }}>
            Admin cannot override a statutory retention obligation. This raises an
            escalation to the DPO with the exception, its citation and this
            justification attached, and waits for a documented ruling.
          </p>
          <textarea
            className="input"
            rows={3}
            placeholder="Why should the DPO consider releasing these fields?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="row" style={{ marginTop: 8 }}>
            <Btn
              pending={pending}
              onClick={() => run(() => requestOverrideAction(requestId, exceptionId, reason))}
            >
              Raise escalation
            </Btn>
          </div>
        </div>
      )}

      <ActionError result={result} />
    </div>
  );
}

export function RulingForm({
  requestId,
  escalationId,
}: {
  requestId: string;
  escalationId: string;
}) {
  const { pending, result, run } = useAction();
  const [ruling, setRuling] = useState<EscalationRuling>("uphold_retention");
  const [rationale, setRationale] = useState("");

  return (
    <div>
      <p className="cell-sub" style={{ marginTop: 0 }}>
        Only the Data Protection Officer can record a ruling. Attempting this as
        Admin is refused by the server — switch the acting role to see either
        outcome.
      </p>
      <select
        className="input"
        value={ruling}
        onChange={(e) => setRuling(e.target.value as EscalationRuling)}
      >
        <option value="uphold_retention">Uphold retention — fields must be kept</option>
        <option value="approve_override">Approve override — deletion may proceed</option>
        <option value="partial_override">Partial override — see rationale</option>
      </select>
      <textarea
        className="input"
        style={{ marginTop: 8 }}
        rows={3}
        placeholder="Rationale — recorded in the audit log and attached to the request."
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
      />
      <div className="row" style={{ marginTop: 8 }}>
        <Btn
          pending={pending}
          variant="primary"
          onClick={() => run(() => recordRulingAction(requestId, escalationId, ruling, rationale))}
        >
          Record ruling
        </Btn>
      </div>
      <ActionError result={result} />
    </div>
  );
}

export function RetryButton({
  requestId,
  executionRecordId,
}: {
  requestId: string;
  executionRecordId: string;
}) {
  const { pending, result, run } = useAction();
  return (
    <div>
      <Btn
        pending={pending}
        onClick={() => run(() => retryExecutionAction(requestId, executionRecordId))}
      >
        Retry execution
      </Btn>
      <ActionError result={result} />
    </div>
  );
}

export function EscalateFailureForm({
  requestId,
  executionRecordId,
}: {
  requestId: string;
  executionRecordId: string;
}) {
  const { pending, result, run } = useAction();
  const [reason, setReason] = useState("");
  return (
    <div>
      <textarea
        className="input"
        rows={2}
        placeholder="What do you need the DPO to rule on? The failure diagnostics are attached automatically."
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="row" style={{ marginTop: 8 }}>
        <Btn
          pending={pending}
          onClick={() => run(() => escalateFailureAction(requestId, executionRecordId, reason))}
        >
          Escalate to DPO with evidence
        </Btn>
      </div>
      <ActionError result={result} />
    </div>
  );
}

export function InstructProcessorButton({
  requestId,
  processorId,
}: {
  requestId: string;
  processorId: string;
}) {
  const { pending, result, run } = useAction();
  return (
    <div>
      <Btn
        pending={pending}
        variant="primary"
        onClick={() => run(() => instructProcessorAction(requestId, processorId))}
      >
        Dispatch instruction
      </Btn>
      <ActionError result={result} />
    </div>
  );
}

export function ConfirmProcessorButton({
  requestId,
  executionRecordId,
}: {
  requestId: string;
  executionRecordId: string;
}) {
  const { pending, result, run } = useAction();
  return (
    <div>
      <Btn
        pending={pending}
        onClick={() => run(() => confirmProcessorActionAction(requestId, executionRecordId))}
      >
        Record processor confirmation
      </Btn>
      <ActionError result={result} />
    </div>
  );
}

export function ChecklistToggle({
  requestId,
  itemId,
  checked,
  label,
}: {
  requestId: string;
  itemId: string;
  checked: boolean;
  label: string;
}) {
  const { pending, run } = useAction();
  return (
    <label className="row" style={{ gap: 9, cursor: "pointer", padding: "6px 0" }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={(e) => run(() => setChecklistItemAction(requestId, itemId, e.target.checked))}
      />
      <span style={{ color: checked ? "var(--text-3)" : "var(--text)" }}>{label}</span>
    </label>
  );
}

export function ConfirmManualButton({
  requestId,
  executionRecordId,
  remaining,
}: {
  requestId: string;
  executionRecordId: string;
  remaining: number;
}) {
  const { pending, result, run } = useAction();
  return (
    <div>
      <Btn
        pending={pending}
        variant="primary"
        onClick={() => run(() => confirmManualAction(requestId, executionRecordId))}
      >
        Attest completion
      </Btn>
      {remaining > 0 && (
        <p className="cell-sub" style={{ marginBottom: 0 }}>
          {remaining} step{remaining === 1 ? "" : "s"} still unchecked — the server
          will refuse until every step has actually been carried out.
        </p>
      )}
      <ActionError result={result} />
    </div>
  );
}

export function IdentityResolveForm({
  requestId,
  candidates,
}: {
  requestId: string;
  candidates: { id: string; label: string; detail: string }[];
}) {
  const { pending, result, run } = useAction();
  const [selected, setSelected] = useState(candidates[0]?.id ?? "");
  const [note, setNote] = useState("");

  return (
    <div>
      <div className="stack" style={{ gap: 8 }}>
        {candidates.map((c) => (
          <label
            key={c.id}
            className="card"
            style={{
              padding: 12,
              display: "flex",
              gap: 10,
              cursor: "pointer",
              borderColor: selected === c.id ? "var(--orange)" : undefined,
              background: selected === c.id ? "var(--bg-selected)" : undefined,
            }}
          >
            <input
              type="radio"
              name="principal"
              checked={selected === c.id}
              onChange={() => setSelected(c.id)}
            />
            <span className="cell-stack">
              <span className="cell-primary">{c.label}</span>
              <span className="cell-sub">{c.detail}</span>
            </span>
          </label>
        ))}
      </div>
      <textarea
        className="input"
        style={{ marginTop: 10 }}
        rows={2}
        placeholder="How was this identity established? Recorded in the audit log."
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="row" style={{ marginTop: 8 }}>
        <Btn
          pending={pending}
          variant="primary"
          onClick={() => run(() => resolveIdentityAction(requestId, selected, note))}
        >
          Confirm this is the right person
        </Btn>
      </div>
      <ActionError result={result} />
    </div>
  );
}

export function TickButton() {
  const { pending, result, run } = useAction();
  return (
    <div>
      <Btn pending={pending} onClick={() => run(() => runTickAction())}>
        Run scheduler tick
      </Btn>
      <ActionError result={result} />
    </div>
  );
}
