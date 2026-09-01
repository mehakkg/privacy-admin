"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  correctDriftAction,
  deprovisionAccountAction,
  deprovisionUserAction,
  escalateResidualAccessAction,
  grantAccessAction,
  recordDispositionAction,
  requestBaselineChangeAction,
  retryRevocationAction,
  terminateSessionAction,
  updateRoleAction,
} from "@/app/actions/access";
import type { ActionResult } from "@/app/actions/requests";
import { ActionError } from "@/components/actions";
import { DATA_CATEGORIES, DISPOSITION_LABEL, type Disposition } from "@/lib/domain";

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

/**
 * Provisioning. The category checkboxes outside the role's baseline are shown
 * but disabled, so the shape of least privilege is visible rather than just
 * enforced — and the server refuses them regardless.
 */
export function GrantForm({
  accountId,
  roles,
}: {
  accountId: string;
  roles: { id: string; name: string; description: string; baselineCategories: string[] }[];
}) {
  const { pending, result, run } = useAction();
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [categories, setCategories] = useState<string[]>([]);
  const [expiry, setExpiry] = useState<string>("90");

  const role = roles.find((r) => r.id === roleId);
  const allowed = role?.baselineCategories ?? [];

  const toggle = (c: string) =>
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  return (
    <div>
      <div className="section-label">Role template</div>
      <select
        className="input"
        value={roleId}
        onChange={(e) => {
          setRoleId(e.target.value);
          setCategories([]);
        }}
      >
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name} — {r.description}
          </option>
        ))}
      </select>

      <div className="section-label" style={{ marginTop: 14 }}>
        Data scope
      </div>
      <p className="cell-sub" style={{ margin: "0 0 8px" }}>
        Only categories inside this role&apos;s approved baseline can be granted.
        The rest are shown so you can see what the role is not allowed to reach.
      </p>
      <div className="row">
        {DATA_CATEGORIES.map((c) => {
          const permitted = allowed.includes(c);
          return (
            <label
              key={c}
              className="row"
              style={{
                gap: 5,
                opacity: permitted ? 1 : 0.4,
                cursor: permitted ? "pointer" : "not-allowed",
              }}
              title={permitted ? undefined : "Outside this role's approved baseline"}
            >
              <input
                type="checkbox"
                disabled={!permitted}
                checked={categories.includes(c)}
                onChange={() => toggle(c)}
              />
              <code className="field-chip" style={{ margin: 0 }}>
                {c}
              </code>
            </label>
          );
        })}
      </div>

      <div className="section-label" style={{ marginTop: 14 }}>
        Expires
      </div>
      <select className="input" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
        <option value="30">In 30 days</option>
        <option value="90">In 90 days</option>
        <option value="365">In a year</option>
        <option value="never">No expiry</option>
      </select>

      <div className="row" style={{ marginTop: 12 }}>
        <Btn
          pending={pending}
          variant="primary"
          disabled={categories.length === 0}
          onClick={() =>
            run(() =>
              grantAccessAction(
                accountId,
                roleId,
                categories,
                expiry === "never" ? null : Number(expiry),
              ),
            )
          }
        >
          Grant access
        </Btn>
        {categories.length === 0 && (
          <span className="cell-sub">Select at least one data category.</span>
        )}
      </div>
      <ActionError result={result} />
    </div>
  );
}

export function DeprovisionButton({ userId, accounts }: { userId: string; accounts: number }) {
  const { pending, result, run } = useAction();
  const [confirming, setConfirming] = useState(false);

  return (
    <div>
      {confirming ? (
        <div className="row">
          <Btn
            pending={pending}
            variant="danger"
            onClick={() => run(() => deprovisionUserAction(userId))}
          >
            Revoke all {accounts} accounts
          </Btn>
          <button className="btn ghost" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="btn primary" onClick={() => setConfirming(true)}>
          Deprovision all access
        </button>
      )}
      <ActionError result={result} />
    </div>
  );
}

export function TerminateSessionButton({
  sessionId,
  label = "Terminate",
}: {
  sessionId: string;
  label?: string;
}) {
  const { pending, result, run } = useAction();
  return (
    <span>
      <Btn
        pending={pending}
        variant="danger xs"
        onClick={() => run(() => terminateSessionAction(sessionId))}
      >
        {label}
      </Btn>
      <ActionError result={result} />
    </span>
  );
}

/**
 * Residual-access resolution, shown against a system that still reports active
 * access after a revoke. A retry is the first move; when the cause is something
 * only the vendor can clear (a caching delay on their side), escalating raises
 * an Escalation Object so it is tracked to closure rather than left live.
 */
export function ResidualAccessActions({
  accountId,
  recordId,
}: {
  accountId: string;
  recordId: string | null;
}) {
  const { pending, result, run } = useAction();
  const [escalating, setEscalating] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 6 }}>
        <Btn
          pending={pending}
          variant="sm"
          onClick={() =>
            run(() =>
              recordId
                ? retryRevocationAction(recordId)
                : deprovisionAccountAction(accountId),
            )
          }
        >
          Re-attempt revocation
        </Btn>
        <button className="btn ghost sm" onClick={() => setEscalating((v) => !v)}>
          Escalate
        </button>
      </div>
      {escalating && (
        <div className="stack" style={{ gap: 6 }}>
          <input
            className="input sm"
            placeholder="Why can't a retry resolve this? (e.g. vendor caching delay)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="row" style={{ gap: 6 }}>
            <Btn
              pending={pending}
              variant="primary sm"
              onClick={() =>
                run(() => escalateResidualAccessAction(accountId, reason))
              }
            >
              Raise escalation
            </Btn>
            <button className="btn ghost sm" onClick={() => setEscalating(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <ActionError result={result} />
    </div>
  );
}

export function RetryRevocationButton({ recordId }: { recordId: string }) {
  const { pending, result, run } = useAction();
  return (
    <div>
      <Btn pending={pending} onClick={() => run(() => retryRevocationAction(recordId))}>
        Retry revocation
      </Btn>
      <ActionError result={result} />
    </div>
  );
}

export function RevokeAccountButton({ accountId }: { accountId: string }) {
  const { pending, result, run } = useAction();
  return (
    <div>
      <Btn
        pending={pending}
        variant="sm"
        onClick={() => run(() => deprovisionAccountAction(accountId))}
      >
        Revoke now
      </Btn>
      <ActionError result={result} />
    </div>
  );
}

/**
 * Disposition. The justification field is required by the server, not just by
 * this form — recordDisposition throws MissingJustificationError.
 */
export function DispositionForm({ accountId }: { accountId: string }) {
  const { pending, result, run } = useAction();
  const [disposition, setDisposition] = useState<Disposition>("revoke");
  const [justification, setJustification] = useState("");

  return (
    <div>
      <select
        className="input"
        value={disposition}
        onChange={(e) => setDisposition(e.target.value as Disposition)}
      >
        {(Object.keys(DISPOSITION_LABEL) as Disposition[]).map((d) => (
          <option key={d} value={d}>
            {DISPOSITION_LABEL[d]}
          </option>
        ))}
      </select>
      <textarea
        className="input"
        style={{ marginTop: 8 }}
        rows={2}
        placeholder="Why? Recorded against the account and in the audit log."
        value={justification}
        onChange={(e) => setJustification(e.target.value)}
      />
      <div className="row" style={{ marginTop: 8 }}>
        <Btn
          pending={pending}
          variant="primary"
          onClick={() => run(() => recordDispositionAction(accountId, disposition, justification))}
        >
          Record disposition
        </Btn>
      </div>
      <ActionError result={result} />
    </div>
  );
}

/**
 * Role editor.
 *
 * Permissions inside the baseline can be toggled freely. Permissions the role
 * currently holds but the baseline does not contain are DRIFT: they can be
 * removed here but never re-added, because adding them would widen the role
 * past what the CISO approved. Adding anything new goes through a baseline
 * change request instead.
 */
export function RoleEditor({
  roleId,
  roleName,
  current,
  baseline,
  excess,
}: {
  roleId: string;
  roleName: string;
  current: string[];
  baseline: string[];
  excess: string[];
}) {
  const { pending, result, run } = useAction();
  const [selected, setSelected] = useState<string[]>(current);
  const [showRequest, setShowRequest] = useState(false);
  const [requested, setRequested] = useState("");
  const [reason, setReason] = useState("");

  const toggle = (p: string) =>
    setSelected((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const options = [...new Set([...baseline, ...current])].sort();

  return (
    <div>
      <div className="section-label">Permissions</div>
      <div className="stack" style={{ gap: 4 }}>
        {options.map((p) => {
          const isExcess = excess.includes(p);
          const checked = selected.includes(p);
          return (
            <label
              key={p}
              className="row"
              style={{ gap: 8, cursor: "pointer", padding: "3px 0" }}
              title={
                isExcess
                  ? "Outside the approved baseline — can be removed, not re-added"
                  : undefined
              }
            >
              <input
                type="checkbox"
                checked={checked}
                // Drift can be turned off but not back on.
                disabled={isExcess && !checked}
                onChange={() => toggle(p)}
              />
              <code className="field-chip" style={{ margin: 0 }}>
                {p}
              </code>
              {isExcess && (
                <span className="pill red">
                  <span className="dot" />
                  Not in baseline
                </span>
              )}
            </label>
          );
        })}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <Btn
          pending={pending}
          variant="primary"
          onClick={() => run(() => updateRoleAction(roleId, selected))}
        >
          Save role
        </Btn>
        {excess.length > 0 && (
          <Btn pending={pending} onClick={() => run(() => correctDriftAction(roleId))}>
            Remove all {excess.length} drifted permission{excess.length === 1 ? "" : "s"}
          </Btn>
        )}
        <button className="btn ghost" onClick={() => setShowRequest((s) => !s)}>
          Request a wider baseline
        </button>
      </div>

      {showRequest && (
        <div style={{ marginTop: 12 }}>
          <p className="cell-sub" style={{ margin: "0 0 6px" }}>
            Widening {roleName} beyond its baseline is a governance change. This
            raises an escalation to the CISO and changes nothing until they rule.
          </p>
          <input
            className="input"
            placeholder="Permissions to add, comma separated (e.g. read:kyc_documents)"
            value={requested}
            onChange={(e) => setRequested(e.target.value)}
          />
          <textarea
            className="input"
            style={{ marginTop: 8 }}
            rows={2}
            placeholder="Why does the role need this?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="row" style={{ marginTop: 8 }}>
            <Btn
              pending={pending}
              onClick={() =>
                run(() =>
                  requestBaselineChangeAction(
                    roleId,
                    requested
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                    reason,
                  ),
                )
              }
            >
              Raise with CISO
            </Btn>
          </div>
        </div>
      )}

      <ActionError result={result} />
    </div>
  );
}
