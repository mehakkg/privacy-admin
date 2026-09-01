"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListDetail, type Column } from "@/components/ListDetail";
import { Notice, Pill, formatDateTime } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { escalateHealthAction, retryHealthCheckAction } from "@/app/actions/integrations";
import type { ActionResult } from "@/app/actions/requests";
import type { PillTone } from "@/components/ui";

export interface HealthCheckEntry {
  ok: boolean;
  detail: string | null;
  at: string;
}
export interface HealthRow {
  id: string;
  kind: "system" | "processor";
  name: string;
  statusKey: "healthy" | "degraded" | "unreachable";
  lastSuccessfulCheck: string | null;
  issue: string | null;
  history: HealthCheckEntry[];
  unreachableHours: number | null;
  canEscalate: boolean;
}

const STATUS: Record<HealthRow["statusKey"], { label: string; tone: PillTone }> = {
  healthy: { label: "Healthy", tone: "green" },
  degraded: { label: "Degraded", tone: "yellow" },
  unreachable: { label: "Unreachable", tone: "red" },
};

export function HealthStatusBadge({ statusKey }: { statusKey: HealthRow["statusKey"] }) {
  return <Pill tone={STATUS[statusKey].tone}>{STATUS[statusKey].label}</Pill>;
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

export function HealthTable({ rows }: { rows: HealthRow[] }) {
  const columns: Column<HealthRow>[] = [
    { key: "name", header: "Name", render: (r) => <span className="cell-primary">{r.name}</span> },
    {
      key: "type",
      header: "Type",
      width: 100,
      render: (r) => <span className="cell-sub">{r.kind === "system" ? "System" : "Processor"}</span>,
    },
    { key: "status", header: "Status", width: 120, render: (r) => <HealthStatusBadge statusKey={r.statusKey} /> },
    {
      key: "last",
      header: "Last successful check",
      width: 170,
      render: (r) => <span className="cell-sub">{r.lastSuccessfulCheck ? formatDateTime(new Date(r.lastSuccessfulCheck)) : "—"}</span>,
    },
    {
      key: "issue",
      header: "Issue",
      render: (r) =>
        r.issue ? (
          <span className="cell-sub" style={{ color: "var(--red)" }}>{r.issue}</span>
        ) : (
          <span className="muted">—</span>
        ),
    },
  ];

  return (
    <ListDetail<HealthRow>
      items={rows}
      columns={columns}
      emptyLabel="Nothing to monitor in this view."
      detailEmptyLabel="Select a system or processor."
      renderDetail={(r) => <HealthDrawer key={r.id} row={r} />}
    />
  );
}

function HealthDrawer({ row }: { row: HealthRow }) {
  const { pending, result, run } = useAction();
  const [escalating, setEscalating] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div>
        <div className="row" style={{ gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>{row.name}</h3>
          <HealthStatusBadge statusKey={row.statusKey} />
        </div>
        <div className="cell-sub">
          {row.kind === "system" ? "Connected system" : "Data processor"}
          {row.unreachableHours !== null && ` · unreachable for ${row.unreachableHours}h`}
        </div>
      </div>

      {row.issue && (
        <Notice tone="warn" title="Issue detail">
          {row.issue}
        </Notice>
      )}

      <div>
        <div className="section-label">Check history</div>
        <div className="stack" style={{ gap: 4 }}>
          {row.history.map((h, i) => (
            <div key={i} className="row" style={{ gap: 8, justifyContent: "space-between" }}>
              <span className="row" style={{ gap: 8 }}>
                <span style={{ color: h.ok ? "var(--green)" : "var(--red)" }}>{h.ok ? "✓" : "✗"}</span>
                <span className="cell-sub">{formatDateTime(new Date(h.at))}</span>
              </span>
              {h.detail && <span className="cell-sub" style={{ textAlign: "right", maxWidth: 260 }}>{h.detail}</span>}
            </div>
          ))}
        </div>
        <p className="cell-sub" style={{ margin: "6px 0 0" }}>
          One failed check and a run of consecutive failures are very different
          situations — the pattern is what tells them apart.
        </p>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <button
          className="btn primary sm"
          disabled={pending}
          onClick={() => run(() => retryHealthCheckAction(row.kind, row.id))}
        >
          {pending ? "Checking…" : "Retry check now"}
        </button>
        {row.canEscalate ? (
          !escalating ? (
            <button className="btn sm" onClick={() => setEscalating(true)}>Escalate</button>
          ) : null
        ) : (
          <span className="cell-sub">
            Escalate becomes available after the retry threshold (48h) — not on the
            first failed check.
          </span>
        )}
      </div>

      {escalating && (
        <div className="stack" style={{ gap: 6 }}>
          <p className="cell-sub" style={{ margin: 0 }}>
            Routed to {row.kind === "processor" ? "Legal" : "the CISO"}, who owns this
            relationship.
          </p>
          <input
            className="input sm"
            placeholder="What has been tried, and why it needs owner attention"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="row" style={{ gap: 6 }}>
            <button
              className="btn primary sm"
              disabled={pending}
              onClick={() => run(() => escalateHealthAction(row.kind, row.id, reason), () => { setEscalating(false); setReason(""); })}
            >
              Raise escalation
            </button>
            <button className="btn ghost sm" onClick={() => setEscalating(false)}>Cancel</button>
          </div>
        </div>
      )}

      <ActionError result={result} />
    </div>
  );
}
