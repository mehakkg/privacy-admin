"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListDetail, type Column } from "@/components/ListDetail";
import { Notice, Pill, formatDate } from "@/components/ui";
import { ActionError } from "@/components/actions";
import {
  executeProvisioningAction,
  retryProvisioningSystemAction,
} from "@/app/actions/access";
import type { ActionResult } from "@/app/actions/requests";
import type { PillTone } from "@/components/ui";

export interface ProvSystemRow {
  system: string;
  level: string;
  status: "pending" | "granted" | "failed";
  reason?: string | null;
}

export interface ProvRequestRow {
  id: string;
  requesterName: string;
  requesterDept: string;
  source: "hr_sync" | "manual";
  roleRequested: string;
  status: "pending" | "granted" | "failed";
  requestedAt: Date;
  systems: ProvSystemRow[];
  broadenedJustification: string | null;
}

const STATUS: Record<ProvRequestRow["status"], { label: string; tone: PillTone }> = {
  pending: { label: "Pending", tone: "yellow" },
  granted: { label: "Granted", tone: "green" },
  failed: { label: "Failed", tone: "red" },
};

const SOURCE_LABEL: Record<ProvRequestRow["source"], string> = {
  hr_sync: "HR sync",
  manual: "Manual request",
};

/** The template's default access level. Anything above it is broadening. */
const TEMPLATE_DEFAULT_LEVEL = "read";
const isAboveTemplate = (level: string) => level.toLowerCase() !== TEMPLATE_DEFAULT_LEVEL;

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await op();
      setResult(r);
      if (r.ok) router.refresh();
    });
  return { pending, result, run };
}

export function ProvisioningQueue({ rows }: { rows: ProvRequestRow[] }) {
  const columns: Column<ProvRequestRow>[] = [
    {
      key: "requester",
      header: "Requester",
      render: (r) => (
        <div className="cell-stack">
          <span className="cell-primary">{r.requesterName}</span>
          <span className="cell-sub">{r.requesterDept}</span>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role requested",
      render: (r) => (
        <span className="row" style={{ gap: 6 }}>
          {r.roleRequested}
          {r.broadenedJustification && <Pill tone="orange">Broadened</Pill>}
        </span>
      ),
    },
    {
      key: "source",
      header: "Source",
      width: 130,
      render: (r) => <span className="cell-sub">{SOURCE_LABEL[r.source]}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: 110,
      render: (r) => <Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>,
    },
    {
      key: "requested",
      header: "Requested on",
      width: 130,
      render: (r) => <span className="cell-sub">{formatDate(r.requestedAt)}</span>,
    },
  ];

  return (
    <ListDetail<ProvRequestRow>
      items={rows}
      columns={columns}
      emptyLabel="No access requests in this view."
      detailEmptyLabel="Select a request to grant it."
      renderDetail={(r) => <GrantDrawer key={r.id} request={r} />}
    />
  );
}

function GrantDrawer({ request }: { request: ProvRequestRow }) {
  const { pending, result, run } = useAction();

  // Local per-system access levels, so the exception path — broadening beyond
  // the template — can be exercised in the drawer before granting.
  const [levels, setLevels] = useState<Record<string, string>>(
    Object.fromEntries(request.systems.map((s) => [s.system, s.level])),
  );
  const [showBroaden, setShowBroaden] = useState(false);
  const [justification, setJustification] = useState(request.broadenedJustification ?? "");

  const executed = request.status !== "pending";
  const broadenedSystems = request.systems.filter((s) => isAboveTemplate(levels[s.system] ?? s.level));
  const isBroadened = broadenedSystems.length > 0;
  // Hard gate: a broadened grant cannot be executed without a reason.
  const grantBlocked = isBroadened && !justification.trim();

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 15 }}>{request.requesterName}</h3>
        <div className="cell-sub">
          {request.requesterDept} · {SOURCE_LABEL[request.source]} · requested{" "}
          {formatDate(request.requestedAt)}
        </div>
      </div>

      {/* Template selection + scope preview — the exact scope, before granting. */}
      <div>
        <div className="section-label">Role template</div>
        <div className="row" style={{ gap: 8 }}>
          <span className="cell-primary">{request.roleRequested}</span>
          <span className="cell-sub">least-privilege template</span>
        </div>
        <div className="section-label" style={{ marginTop: 12 }}>
          This grants
        </div>
        <div className="stack" style={{ gap: 6 }}>
          {request.systems.map((s) => {
            const level = levels[s.system] ?? s.level;
            const above = isAboveTemplate(level);
            return (
              <div
                key={s.system}
                className="row"
                style={{ justifyContent: "space-between", gap: 8 }}
              >
                <span>{s.system}</span>
                <span className="row" style={{ gap: 6 }}>
                  <code className="field-chip" style={{ margin: 0 }}>
                    {level}
                  </code>
                  {above && <Pill tone="orange">above template</Pill>}
                </span>
              </div>
            );
          })}
        </div>
        <p className="cell-sub" style={{ margin: "8px 0 0" }}>
          The template grants read on these systems and no access to the Legacy
          Loan Archive. The exact scope is shown before granting, not after.
        </p>
      </div>

      {/* The exception path — visibly lighter weight than the template above. */}
      {!executed && (
        <div>
          {!showBroaden ? (
            <button className="btn ghost sm" onClick={() => setShowBroaden(true)}>
              Adjust scope beyond template
            </button>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              <div className="section-label">Access level per system</div>
              {request.systems.map((s) => (
                <label key={s.system} className="row" style={{ gap: 8, justifyContent: "space-between" }}>
                  <span>{s.system}</span>
                  <select
                    className="input sm"
                    style={{ width: 140 }}
                    value={levels[s.system] ?? s.level}
                    onChange={(e) => setLevels((prev) => ({ ...prev, [s.system]: e.target.value }))}
                  >
                    <option value="read">read</option>
                    <option value="read/write">read/write</option>
                    <option value="admin">admin</option>
                  </select>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Amber gate: broadening requires a reason before Grant activates. */}
      {isBroadened && !executed && (
        <Notice tone="warn" title="This grants more access than the standard template">
          <p style={{ margin: "0 0 8px" }}>
            {broadenedSystems.map((s) => s.system).join(", ")} exceeds the template
            default. A reason is required before this can be granted.
          </p>
          <textarea
            className="input sm"
            rows={2}
            placeholder="Why is broader access needed? Recorded on the grant and in the audit log."
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
          />
        </Notice>
      )}

      {/* Execution grid — three-state per system, retry per failed row. */}
      {executed ? (
        <div>
          <div className="section-label">Grant execution</div>
          <div className="stack" style={{ gap: 6 }}>
            {request.systems.map((s) => (
              <div
                key={s.system}
                className="row"
                style={{ justifyContent: "space-between", gap: 8 }}
              >
                <span className="row" style={{ gap: 8 }}>
                  <SystemStatusMark status={s.status} />
                  <span>
                    {s.system} — {s.level}
                  </span>
                </span>
                {s.status === "failed" ? (
                  <button
                    className="btn xs"
                    disabled={pending}
                    onClick={() => run(() => retryProvisioningSystemAction(request.id, s.system))}
                  >
                    {pending ? "Retrying…" : "Retry"}
                  </button>
                ) : (
                  <Pill tone={s.status === "granted" ? "green" : "gray"}>
                    {s.status === "granted" ? "granted" : "pending"}
                  </Pill>
                )}
              </div>
            ))}
          </div>
          {request.systems.some((s) => s.status === "failed") && (
            <div style={{ marginTop: 8 }}>
              {request.systems
                .filter((s) => s.status === "failed")
                .map((s) => (
                  <p key={s.system} className="cell-sub" style={{ margin: "2px 0", color: "var(--red)" }}>
                    ✗ {s.system} — grant failed: {s.reason}
                  </p>
                ))}
            </div>
          )}
          {request.status === "granted" && (
            <p className="cell-sub" style={{ margin: "10px 0 0", color: "var(--green)" }}>
              ✓ Access granted — logged to audit trail.
            </p>
          )}
          {request.broadenedJustification && (
            <p className="cell-sub" style={{ margin: "8px 0 0" }}>
              Broadened beyond template · {request.broadenedJustification}
            </p>
          )}
        </div>
      ) : (
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn primary"
            disabled={pending || grantBlocked}
            onClick={() =>
              run(() => executeProvisioningAction(request.id, isBroadened ? justification : null))
            }
          >
            {pending ? "Granting…" : "Grant access"}
          </button>
          {grantBlocked && (
            <span className="cell-sub">A justification is required to broaden the grant.</span>
          )}
        </div>
      )}

      <ActionError result={result} />
    </div>
  );
}

function SystemStatusMark({ status }: { status: ProvSystemRow["status"] }) {
  if (status === "granted") return <span style={{ color: "var(--green)" }}>✓</span>;
  if (status === "failed") return <span style={{ color: "var(--red)" }}>✗</span>;
  return <span className="cell-sub">…</span>;
}
