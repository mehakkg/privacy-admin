"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  approveFieldsAction,
  assignPurposeAction,
  overrideFieldAction,
  resolveDuplicateAction,
  resolveRotAction,
  resolveTriageAction,
  runScanAction,
  saveScanConfigAction,
} from "@/app/actions/discovery";
import type { ActionResult } from "@/app/actions/requests";
import { ActionError } from "@/components/actions";
import { InfoTip, Pill } from "@/components/ui";
import type { BulkOutcome } from "@/lib/engines/discovery";

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
  return { pending, result, run };
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
    <button className={`btn ${variant}`} onClick={onClick} disabled={pending || disabled}>
      {pending ? "Working…" : children}
    </button>
  );
}

// ---------------------------------------------------------------------------

export function RunScanButton({
  sourceId,
  approved,
  sourceName,
}: {
  sourceId: string;
  approved: boolean;
  sourceName: string;
}) {
  const { pending, result, run } = useAction();

  // Never a disabled button with no explanation.
  if (!approved) {
    return (
      <span className="row" style={{ gap: 6 }}>
        <Pill tone="purple">Awaiting governance approval</Pill>
        <InfoTip
          align="left"
          text={`Discovery scope for ${sourceName} has not been approved by the DPO. Scanning a source decides what personal data the organisation looks at, which is a governance decision rather than a technical one. Ask the DPO to approve the scope.`}
        />
      </span>
    );
  }

  return (
    <div>
      <Btn pending={pending} variant="primary sm" onClick={() => run(() => runScanAction(sourceId))}>
        Run scan
      </Btn>
      <ActionError result={result} />
    </div>
  );
}

export function ScanConfigForm({
  sourceId,
  approved,
  schedule,
  depth,
  offPeakWindow,
  isLarge,
}: {
  sourceId: string;
  approved: boolean;
  schedule: string;
  depth: string;
  offPeakWindow: string | null;
  isLarge: boolean;
}) {
  const { pending, result, run } = useAction();
  const [s, setS] = useState(schedule);
  const [d, setD] = useState(depth);
  const [w, setW] = useState(offPeakWindow ?? "");

  const locked = !approved;

  return (
    <div>
      <div className="grid-2">
        <div>
          <div className="section-label">Schedule</div>
          <select className="input" value={s} disabled={locked} onChange={(e) => setS(e.target.value)}>
            <option value="on_demand">On demand</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div>
          <div className="section-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            Scan depth
            <InfoTip
              align="left"
              text="Shallow samples column names and a few values. Standard samples every column. Deep reads full contents — accurate, and much slower on large sources."
            />
          </div>
          <select className="input" value={d} disabled={locked} onChange={(e) => setD(e.target.value)}>
            <option value="shallow">Shallow</option>
            <option value="standard">Standard</option>
            <option value="deep">Deep</option>
          </select>
        </div>
      </div>

      {/* Prominent, not buried in an "advanced" section — the sources that most
          need it are exactly the ones where a daytime deep scan hurts. */}
      <div style={{ marginTop: 14 }}>
        <div className="section-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          Off-peak window
          {isLarge && <Pill tone="yellow">Recommended</Pill>}
          <InfoTip
            align="left"
            text="Restricts scanning to these hours. A deep scan on a large source can take hours and load the system while it runs."
          />
        </div>
        <input
          className="input"
          placeholder="e.g. 22:00-05:00"
          value={w}
          disabled={locked}
          onChange={(e) => setW(e.target.value)}
        />
      </div>

      {!locked && (
        <div className="row" style={{ marginTop: 14 }}>
          <Btn
            pending={pending}
            variant="primary"
            onClick={() => run(() => saveScanConfigAction(sourceId, s, d, w.trim() || null))}
          >
            Save configuration
          </Btn>
        </div>
      )}
      <ActionError result={result} />
    </div>
  );
}

// ---------------------------------------------------------------------------

export function BulkApproveButton({ fieldIds }: { fieldIds: string[] }) {
  const { pending, result, run } = useAction();
  return (
    <div>
      <Btn
        pending={pending}
        variant="primary sm"
        disabled={fieldIds.length === 0}
        onClick={() => run(() => approveFieldsAction(fieldIds))}
      >
        Approve all {fieldIds.length}
      </Btn>
      <ActionError result={result} />
    </div>
  );
}

export function OverrideForm({
  fieldId,
  currentType,
  types,
  purposes,
  purposeTagId,
}: {
  fieldId: string;
  currentType: string;
  types: string[];
  purposes: { id: string; name: string }[];
  purposeTagId: string | null;
}) {
  const { pending, result, run } = useAction();
  // Kept in component state so a failed save does not discard a completed
  // review — the operator should never have to redo the thinking.
  const [type, setType] = useState(currentType);
  const [reason, setReason] = useState("");
  const [purpose, setPurpose] = useState(purposeTagId ?? "");

  return (
    <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
      <select className="input sm" value={type} onChange={(e) => setType(e.target.value)}>
        {types.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <input
        className="input sm"
        style={{ minWidth: 200 }}
        placeholder="Reason for the change (required)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <Btn
        pending={pending}
        variant="sm"
        disabled={type === currentType && !reason}
        onClick={() => run(() => overrideFieldAction(fieldId, type, reason))}
      >
        Override
      </Btn>

      <select
        className="input sm"
        value={purpose}
        onChange={(e) => {
          setPurpose(e.target.value);
          if (e.target.value) run(() => assignPurposeAction(fieldId, e.target.value));
        }}
      >
        <option value="">Assign purpose…</option>
        {purposes.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <ActionError result={result} />
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Bulk triage with per-item reporting. A partial failure lists exactly which
 * items failed and why — reporting a blanket failure over nineteen successes
 * invites a re-run that acts on those nineteen twice.
 */
export function TriageBulkBar({
  items,
}: {
  items: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const labelOf = (id: string) => items.find((i) => i.id === id)?.label ?? id;

  const apply = (resolution: "resolved" | "dismissed" | "escalated") => {
    start(async () => {
      const r = await resolveTriageAction(selected, resolution);
      setError(r.error ?? null);
      setOutcome(r.outcome ?? null);
      setSelected([]);
      router.refresh();
    });
  };

  return (
    <div>
      <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <label className="row" style={{ gap: 5 }}>
          <input
            type="checkbox"
            checked={selected.length === items.length && items.length > 0}
            onChange={(e) => setSelected(e.target.checked ? items.map((i) => i.id) : [])}
          />
          <span className="cell-sub">Select all ({items.length})</span>
        </label>
        <span className="cell-sub">{selected.length} selected</span>
        <button className="btn sm" disabled={!selected.length || pending} onClick={() => apply("resolved")}>
          Approve
        </button>
        <button className="btn sm" disabled={!selected.length || pending} onClick={() => apply("dismissed")}>
          Dismiss
        </button>
        <button className="btn sm" disabled={!selected.length || pending} onClick={() => apply("escalated")}>
          Escalate
        </button>
      </div>

      <div className="stack" style={{ gap: 3 }}>
        {items.map((item) => (
          <label key={item.id} className="row" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={(e) =>
                setSelected((s) =>
                  e.target.checked ? [...s, item.id] : s.filter((x) => x !== item.id),
                )
              }
            />
            <span className="cell-sub">{item.label}</span>
          </label>
        ))}
      </div>

      {error && (
        <div className="notice danger" style={{ marginTop: 10 }}>
          <div className="notice-title">The action could not run</div>
          <div>{error}</div>
        </div>
      )}

      {outcome && (
        <div
          className={`notice ${outcome.failed.length === 0 ? "ok" : "warn"}`}
          style={{ marginTop: 10 }}
        >
          <div className="notice-title">
            {outcome.succeeded.length} of {outcome.attempted} applied
            {outcome.failed.length > 0 && ` · ${outcome.failed.length} failed`}
          </div>
          {outcome.failed.length > 0 && (
            <>
              <div>These were not changed. Everything else was:</div>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {outcome.failed.map((f) => (
                  <li key={f.id} style={{ marginBottom: 2 }}>
                    <strong>{labelOf(f.id)}</strong> — {f.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Duplicate resolution.
 *
 * "Keep both" sits first and is styled as a peer of merge, not as an escape
 * hatch. A false-positive match is a realistic failure, and merging two
 * legitimately different records is not meaningfully reversible — so merge must
 * not be the path of least resistance.
 */
export function DuplicateActions({
  pairId,
  fieldA,
  fieldB,
}: {
  pairId: string;
  fieldA: { id: string; label: string };
  fieldB: { id: string; label: string };
}) {
  const { pending, result, run } = useAction();
  const [confirmMerge, setConfirmMerge] = useState(false);

  return (
    <div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <Btn
          pending={pending}
          variant="primary"
          onClick={() => run(() => resolveDuplicateAction(pairId, "keep_both", null))}
        >
          Keep both
        </Btn>
        <Btn
          pending={pending}
          onClick={() => run(() => resolveDuplicateAction(pairId, "keep_one", fieldA.id))}
        >
          Keep {fieldA.label}
        </Btn>
        <Btn
          pending={pending}
          onClick={() => run(() => resolveDuplicateAction(pairId, "keep_one", fieldB.id))}
        >
          Keep {fieldB.label}
        </Btn>

        {confirmMerge ? (
          <>
            <Btn
              pending={pending}
              variant="danger"
              onClick={() => run(() => resolveDuplicateAction(pairId, "merge", null))}
            >
              Confirm merge
            </Btn>
            <button className="btn ghost" onClick={() => setConfirmMerge(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button className="btn ghost" onClick={() => setConfirmMerge(true)}>
            Merge…
          </button>
        )}
      </div>
      {confirmMerge && (
        <p className="cell-sub" style={{ margin: "8px 0 0", color: "var(--red)" }}>
          Merging combines these into one record across every connected system.
          If they are genuinely different records, this is not practically
          reversible.
        </p>
      )}
      <ActionError result={result} />
    </div>
  );
}

export function RotActions({ candidateId }: { candidateId: string }) {
  const { pending, result, run } = useAction();
  const [reason, setReason] = useState("");

  return (
    <div>
      <input
        className="input sm"
        placeholder="Reason (required)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ marginBottom: 8, minWidth: 240 }}
      />
      <div className="row" style={{ gap: 8 }}>
        <Btn pending={pending} variant="sm" onClick={() => run(() => resolveRotAction(candidateId, "retain", reason))}>
          Retain
        </Btn>
        <Btn pending={pending} variant="sm" onClick={() => run(() => resolveRotAction(candidateId, "quarantine", reason))}>
          Quarantine
        </Btn>
        <Btn pending={pending} variant="danger sm" onClick={() => run(() => resolveRotAction(candidateId, "delete", reason))}>
          Delete
        </Btn>
      </div>
      <ActionError result={result} />
    </div>
  );
}
