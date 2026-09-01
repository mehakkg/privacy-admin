"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListDetail, type Column } from "@/components/ListDetail";
import { GovernanceBanner, Notice, Pill, formatDate } from "@/components/ui";
import { ActionError } from "@/components/actions";
import {
  correctDriftAction,
  requestBaselineChangeAction,
  resetRoleToBaselineAction,
  updateRoleAction,
} from "@/app/actions/access";
import type { ActionResult } from "@/app/actions/requests";
import type { PillTone } from "@/components/ui";
import type { DriftSeverity } from "@/lib/guards/baselineGate";

export interface RoleRow {
  id: string;
  name: string;
  description: string;
  current: string[];
  baseline: string[];
  excess: string[];
  sensitiveExcess: string[];
  missing: string[];
  severity: DriftSeverity;
  baselineCount: number;
  currentCount: number;
  baselineApprovedBy: string;
  baselineApprovedAt: Date;
  lastReviewedAt: Date | null;
  holders: number;
}

const SEVERITY: Record<DriftSeverity, { label: string; tone: PillTone }> = {
  none: { label: "No drift", tone: "green" },
  minor: { label: "Minor drift", tone: "yellow" },
  significant: { label: "Significant drift", tone: "red" },
};

/** Drift badge — no drift (teal) / minor (amber) / significant (red). */
export function DriftBadge({ severity }: { severity: DriftSeverity }) {
  return <Pill tone={SEVERITY[severity].tone}>{SEVERITY[severity].label}</Pill>;
}

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await op();
      setResult(r);
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, result, run };
}

export function RbacMatrix({ rows }: { rows: RoleRow[] }) {
  const columns: Column<RoleRow>[] = [
    {
      key: "role",
      header: "Role",
      render: (r) => (
        <div className="cell-stack">
          <span className="cell-primary">{r.name}</span>
          <span className="cell-sub">{r.holders} holder{r.holders === 1 ? "" : "s"}</span>
        </div>
      ),
    },
    {
      key: "baseline",
      header: "Baseline",
      width: 90,
      render: (r) => <span className="mono cell-sub">{r.baselineCount}</span>,
    },
    {
      key: "current",
      header: "Current",
      width: 90,
      render: (r) => (
        <span
          className="mono"
          style={{
            color: r.currentCount > r.baselineCount ? "var(--red)" : undefined,
            fontWeight: r.currentCount > r.baselineCount ? 600 : 400,
          }}
        >
          {r.currentCount}
        </span>
      ),
    },
    {
      key: "drift",
      header: "Drift status",
      width: 150,
      render: (r) => <DriftBadge severity={r.severity} />,
    },
    {
      key: "reviewed",
      header: "Last reviewed",
      width: 130,
      render: (r) => (
        <span className="cell-sub">
          {r.lastReviewedAt ? formatDate(r.lastReviewedAt) : "Never"}
        </span>
      ),
    },
  ];

  return (
    <ListDetail<RoleRow>
      items={rows}
      columns={columns}
      emptyLabel="No roles."
      detailEmptyLabel="Select a role to review it."
      renderDetail={(r) => <RoleEditorDrawer key={r.id} role={r} />}
    />
  );
}

/**
 * Side-by-side role editor.
 *
 * Left: the CISO-approved baseline, read-only reference. Right: the current
 * permission set as a toggle grid. Each permission that differs is highlighted —
 * added (amber) or removed (grey strike-through). Drift additions can be removed
 * but not re-added, because re-adding would widen past the baseline, which is
 * the CISO's decision. Reset-to-baseline restores the approved set exactly.
 */
function RoleEditorDrawer({ role }: { role: RoleRow }) {
  const { pending, result, run } = useAction();
  const [selected, setSelected] = useState<string[]>(role.current);
  const [showRequest, setShowRequest] = useState(false);
  const [requested, setRequested] = useState("");
  const [reason, setReason] = useState("");

  const options = [...new Set([...role.baseline, ...role.current])].sort();
  const toggle = (p: string) =>
    setSelected((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const dirty =
    selected.length !== role.current.length ||
    selected.some((p) => !role.current.includes(p));

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div>
        <div className="row" style={{ gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>{role.name}</h3>
          <DriftBadge severity={role.severity} />
        </div>
        <div className="cell-sub">{role.description}</div>
      </div>

      <GovernanceBanner owner="CISO" object="The role baseline" />

      {role.sensitiveExcess.length > 0 && (
        <Notice tone="danger" title="A sensitive permission was added outside the baseline">
          <p style={{ margin: 0 }}>
            <strong>{role.sensitiveExcess.join(", ")}</strong> can write or export
            personal data and is not in the approved baseline. A single sensitive
            addition is significant drift on its own.
          </p>
        </Notice>
      )}

      {/* Side-by-side comparison. */}
      <div className="grid-2" style={{ gap: 14 }}>
        <div>
          <div className="section-label">Approved baseline · {role.baselineCount}</div>
          <div className="stack" style={{ gap: 3 }}>
            {role.baseline.map((p) => {
              const removed = !selected.includes(p);
              return (
                <code
                  key={p}
                  className="field-chip"
                  style={{
                    margin: 0,
                    textDecoration: removed ? "line-through" : undefined,
                    opacity: removed ? 0.5 : 1,
                  }}
                  title={removed ? "In baseline but not currently granted" : undefined}
                >
                  {p}
                </code>
              );
            })}
          </div>
          <p className="cell-sub" style={{ margin: "6px 0 0" }}>
            Approved by {role.baselineApprovedBy} on {formatDate(role.baselineApprovedAt)}.
            Read-only.
          </p>
        </div>

        <div>
          <div className="section-label">Current · {selected.length}</div>
          <div className="stack" style={{ gap: 3 }}>
            {options.map((p) => {
              const isExcess = !role.baseline.includes(p);
              const checked = selected.includes(p);
              return (
                <label
                  key={p}
                  className="row"
                  style={{ gap: 8, cursor: "pointer" }}
                  title={
                    isExcess
                      ? "Outside the approved baseline — can be removed, not re-added"
                      : undefined
                  }
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isExcess && !checked}
                    onChange={() => toggle(p)}
                  />
                  <code
                    className="field-chip"
                    style={{
                      margin: 0,
                      background: isExcess && checked ? "var(--yellow-bg)" : undefined,
                    }}
                  >
                    {p}
                  </code>
                  {isExcess && checked && <Pill tone="orange">added</Pill>}
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button
          className="btn primary sm"
          disabled={pending || !dirty}
          onClick={() => run(() => updateRoleAction(role.id, selected))}
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {role.excess.length > 0 && (
          <button
            className="btn sm"
            disabled={pending}
            onClick={() => run(() => correctDriftAction(role.id))}
          >
            Remove {role.excess.length} drifted
          </button>
        )}
        <button
          className="btn sm"
          disabled={pending}
          onClick={() => run(() => resetRoleToBaselineAction(role.id), () => setSelected(role.baseline))}
        >
          Reset to baseline
        </button>
        <button className="btn ghost sm" onClick={() => setShowRequest((s) => !s)}>
          Request a wider baseline
        </button>
      </div>

      {showRequest && (
        <div className="stack" style={{ gap: 8 }}>
          <p className="cell-sub" style={{ margin: 0 }}>
            Widening {role.name} beyond its baseline is a governance change. This
            raises an escalation to the CISO and changes nothing until they rule.
          </p>
          <input
            className="input sm"
            placeholder="Permissions to add, comma separated (e.g. read:kyc_documents)"
            value={requested}
            onChange={(e) => setRequested(e.target.value)}
          />
          <textarea
            className="input sm"
            rows={2}
            placeholder="Why does the role need this?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="row">
            <button
              className="btn sm"
              disabled={pending || !reason.trim()}
              onClick={() =>
                run(
                  () =>
                    requestBaselineChangeAction(
                      role.id,
                      requested.split(",").map((s) => s.trim()).filter(Boolean),
                      reason,
                    ),
                  () => setShowRequest(false),
                )
              }
            >
              Raise with CISO
            </button>
          </div>
        </div>
      )}

      <ActionError result={result} />
    </div>
  );
}
