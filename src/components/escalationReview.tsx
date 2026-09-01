"use client";

import Link from "next/link";
import { ListDetail, type Column } from "@/components/ListDetail";
import { KeyValue, Notice, Pill } from "@/components/ui";
import {
  ESCALATION_RULING_LABEL,
  ROLE_LABEL,
  type ActorRole,
  type EscalationRuling,
} from "@/lib/domain";

export interface EscalationRow {
  id: string;
  reference: string;
  requestId: string | null;
  requestRef: string | null;
  conflictType: string;
  sourceRole: string;
  targetRole: string;
  raised: string;
  ageDays: number;
  status: string; // open | ruled | withdrawn
  reason: string;
  contextPairs: [string, string][];
  ruling: string | null;
  rulingRationale: string | null;
  ruledBy: string | null;
  ruledAt: string | null;
  withdrawnBecause: string | null;
}

/**
 * Escalations as list + detail.
 *
 * Deliberately NOT the six-tab treatment a Request gets. A Request is a rich
 * anchor entity with genuinely distinct facets; an Escalation is a
 * single-decision object — context plus one ruling — that fits a drawer. A
 * multi-tab page here would be scaffolding for facets that do not exist.
 */
export function EscalationReview({ rows }: { rows: EscalationRow[] }) {
  const columns: Column<EscalationRow>[] = [
    {
      key: "about",
      header: "About",
      render: (e) => (
        <div className="cell-stack">
          <span className="mono cell-primary">{e.requestRef ?? e.reference}</span>
          <span className="cell-sub">{e.conflictType}</span>
        </div>
      ),
    },
    {
      key: "with",
      header: "With",
      width: 130,
      render: (e) => (
        <Pill tone={e.targetRole === "ciso" ? "purple" : "blue"}>
          {ROLE_LABEL[e.targetRole as ActorRole] ?? e.targetRole}
        </Pill>
      ),
    },
    {
      key: "state",
      header: "State",
      width: 120,
      render: (e) =>
        e.status === "open" ? (
          <Pill tone="yellow">Open · {e.ageDays}d</Pill>
        ) : e.status === "ruled" ? (
          <Pill tone="green">Ruled</Pill>
        ) : (
          <Pill tone="gray">Closed</Pill>
        ),
    },
  ];

  return (
    <ListDetail<EscalationRow>
      items={rows}
      columns={columns}
      emptyLabel="No escalations in this view."
      detailEmptyLabel="Select an escalation to see its context and ruling."
      renderDetail={(e) => <EscalationPanel e={e} />}
    />
  );
}

function EscalationPanel({ e }: { e: EscalationRow }) {
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div>
        <div className="cell-primary" style={{ fontSize: 14, fontWeight: 600 }}>
          {e.conflictType}
        </div>
        <div className="cell-sub">
          Raised by {ROLE_LABEL[e.sourceRole as ActorRole] ?? e.sourceRole} · {e.raised}
          {e.requestRef && (
            <>
              {" · "}
              <Link href={`/requests/${e.requestId}`} className="row-link">
                {e.requestRef}
              </Link>
            </>
          )}
        </div>
      </div>

      <div>
        <div className="section-label">Why it was raised</div>
        <p style={{ margin: 0 }}>{e.reason}</p>
      </div>

      {e.contextPairs.length > 0 && (
        <div>
          <div className="section-label">Auto-compiled context</div>
          <KeyValue rows={e.contextPairs.map(([k, v]) => [k, v])} />
        </div>
      )}

      {e.status === "open" && (
        <Notice tone="warn" title="Awaiting DPO ruling">
          Nothing changes until {ROLE_LABEL[e.targetRole as ActorRole] ?? e.targetRole}{" "}
          rules. Admin cannot rule on their own escalation — the server refuses
          it — so an override always carries a documented decision from the
          person accountable for it.
        </Notice>
      )}

      {e.status === "ruled" && (
        <>
          <div>
            <div className="section-label">Ruling</div>
            <KeyValue
              rows={[
                [
                  "Decision",
                  <Pill key="d" tone={e.ruling === "approve_override" ? "green" : "blue"}>
                    {e.ruling
                      ? ESCALATION_RULING_LABEL[e.ruling as EscalationRuling]
                      : "—"}
                  </Pill>,
                ],
                ["Rationale", e.rulingRationale ?? "—"],
                ["Ruled by", e.ruledBy ?? "—"],
                ["Ruled at", e.ruledAt ?? "—"],
              ]}
            />
          </div>
          {e.requestId && (
            <div className="row">
              <Link href={`/requests/${e.requestId}/execution`} className="btn primary">
                Execute per ruling
              </Link>
              <span className="cell-sub">
                Carries the decision back to the request&apos;s execution step.
              </span>
            </div>
          )}
        </>
      )}

      {e.status === "withdrawn" && (
        <Notice tone="info" title="Closed">
          {e.withdrawnBecause ?? "Withdrawn by Admin."} The record that it was
          raised stays in the log.
        </Notice>
      )}
    </div>
  );
}
