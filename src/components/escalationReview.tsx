"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListDetail, type Column } from "@/components/ListDetail";
import { KeyValue, Notice, Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { ruleEscalationAction } from "@/app/actions/escalations";
import { ROLE_LABEL, type ActorRole } from "@/lib/domain";
import type { ActionResult } from "@/app/actions/requests";
import type { PillTone } from "@/components/ui";

export interface EscalationRow {
  id: string;
  reference: string;
  type: string;
  requestId: string | null;
  requestRef: string | null;
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

const TYPE_META: Record<string, { label: string; tone: PillTone }> = {
  retention_conflict: { label: "Retention conflict", tone: "yellow" },
  policy_ambiguity: { label: "Policy ambiguity", tone: "gray" },
  rule_request: { label: "Rule request", tone: "blue" },
  rule_exception: { label: "Rule exception", tone: "orange" },
  purpose_request: { label: "Purpose request", tone: "blue" },
  dpa_update: { label: "DPA update", tone: "purple" },
  other: { label: "Other", tone: "gray" },
};

/** Type-specific decision sets — never a generic free-text box. */
interface DecisionOption {
  value: string;
  label: string;
  needsScope?: boolean; // free "specify scope" detail
  needsMerge?: boolean; // dropdown of existing categories
}
const DECISIONS: Record<string, DecisionOption[]> = {
  retention_conflict: [
    { value: "Proceed with deletion, excluding retained fields", label: "Proceed — exclude retained fields" },
    { value: "Deny deletion, retention applies", label: "Deny — retention applies" },
    { value: "Partial", label: "Partial — specify scope", needsScope: true },
  ],
  rule_exception: [
    { value: "Approve exception", label: "Approve exception" },
    { value: "Deny exception", label: "Deny exception" },
  ],
  rule_request: [
    { value: "Approve — create rule", label: "Approve — create rule" },
    { value: "Deny", label: "Deny" },
  ],
  purpose_request: [
    { value: "Approve as new category", label: "Approve as new category" },
    { value: "Merge into existing category", label: "Merge into existing category", needsMerge: true },
    { value: "Deny", label: "Deny" },
  ],
  dpa_update: [
    { value: "Approve update", label: "Approve update" },
    { value: "Deny", label: "Deny" },
  ],
  policy_ambiguity: [
    { value: "Approve", label: "Approve" },
    { value: "Deny", label: "Deny" },
  ],
  other: [
    { value: "Approve", label: "Approve" },
    { value: "Deny", label: "Deny" },
    { value: "Acknowledge", label: "Acknowledge" },
  ],
};

function typeMeta(type: string) {
  return TYPE_META[type] ?? TYPE_META.other;
}

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

export function EscalationReview({
  rows,
  currentRole,
  vacantRoles,
  existingCategories,
}: {
  rows: EscalationRow[];
  currentRole: ActorRole;
  vacantRoles: string[];
  existingCategories: string[];
}) {
  const columns: Column<EscalationRow>[] = [
    {
      key: "ref",
      header: "Reference",
      width: 150,
      render: (e) => (
        <div className="cell-stack">
          <span className="mono cell-primary">{e.reference}</span>
          <Pill tone={typeMeta(e.type).tone}>{typeMeta(e.type).label}</Pill>
        </div>
      ),
    },
    {
      key: "source",
      header: "Source",
      render: (e) => (
        <span className="cell-sub">{e.requestRef ?? e.reason.slice(0, 40)}</span>
      ),
    },
    {
      key: "routed",
      header: "Routed to",
      width: 150,
      render: (e) => {
        const vacant = vacantRoles.includes(e.targetRole);
        return vacant ? (
          <Pill tone="yellow">
            {ROLE_LABEL[e.targetRole as ActorRole] ?? e.targetRole} (vacant)
          </Pill>
        ) : (
          <span className="cell-sub">{ROLE_LABEL[e.targetRole as ActorRole] ?? e.targetRole}</span>
        );
      },
    },
    {
      key: "raisedBy",
      header: "Raised by",
      width: 90,
      render: (e) => <span className="cell-sub">{ROLE_LABEL[e.sourceRole as ActorRole] ?? e.sourceRole}</span>,
    },
    {
      key: "state",
      header: "Status",
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
      renderDetail={(e) => (
        <EscalationPanel
          key={e.id}
          e={e}
          currentRole={currentRole}
          vacant={vacantRoles.includes(e.targetRole)}
          existingCategories={existingCategories}
        />
      )}
    />
  );
}

function executeHref(e: EscalationRow): string {
  switch (e.type) {
    case "retention_conflict":
      return e.requestId ? `/requests/${e.requestId}/retention` : "/requests";
    case "rule_request":
    case "rule_exception":
      return "/data-flow/protection-rules";
    case "purpose_request":
      return "/discovery";
    case "dpa_update":
      return "/integrations/data-processors";
    default:
      return e.requestId ? `/requests/${e.requestId}` : "/escalations";
  }
}

function EscalationPanel({
  e,
  currentRole,
  vacant,
  existingCategories,
}: {
  e: EscalationRow;
  currentRole: ActorRole;
  vacant: boolean;
  existingCategories: string[];
}) {
  const meta = typeMeta(e.type);
  const routedLabel = ROLE_LABEL[e.targetRole as ActorRole] ?? e.targetRole;
  const isRoutedTo = currentRole === e.targetRole;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div>
        <div className="row" style={{ gap: 8 }}>
          <span className="mono cell-primary" style={{ fontSize: 14 }}>{e.reference}</span>
          <Pill tone={meta.tone}>{meta.label}</Pill>
          {e.status === "open" ? (
            <Pill tone="yellow">Open</Pill>
          ) : e.status === "ruled" ? (
            <Pill tone="green">Ruled</Pill>
          ) : (
            <Pill tone="gray">Closed</Pill>
          )}
        </div>
        <div className="cell-sub" style={{ marginTop: 4 }}>
          Raised by {ROLE_LABEL[e.sourceRole as ActorRole] ?? e.sourceRole} · {e.raised} · routed to{" "}
          {vacant ? <span style={{ color: "var(--yellow)" }}>{routedLabel} (vacant)</span> : routedLabel}
          {e.requestRef && (
            <>
              {" · "}
              <Link href={`/requests/${e.requestId}`} className="row-link">{e.requestRef}</Link>
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
          <KeyValue rows={e.contextPairs.map(([k, v]) => [prettyKey(k), v])} />
        </div>
      )}

      {/* Vacant role: queued, no ruling form for anyone. */}
      {e.status === "open" && vacant && (
        <Notice tone="warn" title={`Queued — no ${routedLabel} assigned`}>
          This escalation is queued because no {routedLabel} is currently assigned.
          It stays open until one is. No one can rule on it until the role is filled —
          assign it from your organisation&apos;s role configuration.
        </Notice>
      )}

      {/* Raising role (or any non-routed role): read-only awaiting. */}
      {e.status === "open" && !vacant && !isRoutedTo && (
        <Notice tone="warn" title={`Awaiting ruling from ${routedLabel}`}>
          Nothing changes until {routedLabel} rules. You are not the routed-to role,
          so no decision controls are shown — a ruling always carries a documented
          decision from the role accountable for it. Switch to &ldquo;Acting as:{" "}
          {routedLabel}&rdquo; to rule, if that is you.
        </Notice>
      )}

      {/* Routed-to role: the ruling form. */}
      {e.status === "open" && !vacant && isRoutedTo && (
        <RulingForm e={e} existingCategories={existingCategories} />
      )}

      {/* Ruled: summary + execute handoff. */}
      {e.status === "ruled" && (
        <>
          <div>
            <div className="section-label">Ruling</div>
            <KeyValue
              rows={[
                ["Decision", <Pill key="d" tone="green">{e.ruling ?? "—"}</Pill>],
                ["Reasoning", e.rulingRationale ?? "—"],
                ["Ruled by", e.ruledBy ?? "—"],
                ["Ruled at", e.ruledAt ?? "—"],
              ]}
            />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Link href={executeHref(e)} className="btn primary">
              Execute per ruling →
            </Link>
            <span className="cell-sub">
              Carries the decision back to the object it affects, with the outcome
              already applied.
            </span>
          </div>
        </>
      )}

      {/* Closed / withdrawn. */}
      {e.status === "withdrawn" && (
        <Notice tone="info" title="Closed">
          {e.withdrawnBecause ?? "Withdrawn — no conflict remained to rule on."} The
          record that it was raised stays in the log.
        </Notice>
      )}
    </div>
  );
}

function RulingForm({ e, existingCategories }: { e: EscalationRow; existingCategories: string[] }) {
  const { pending, result, run } = useAction();
  const options = DECISIONS[e.type] ?? DECISIONS.other;
  const [choice, setChoice] = useState(options[0].value);
  const [scope, setScope] = useState("");
  const [mergeInto, setMergeInto] = useState(existingCategories[0] ?? "");
  const [rationale, setRationale] = useState("");

  const selected = options.find((o) => o.value === choice);

  const compose = () => {
    if (selected?.needsScope && scope.trim()) return `${choice} — ${scope.trim()}`;
    if (selected?.needsMerge && mergeInto) return `Merge into existing category: ${mergeInto}`;
    return choice;
  };

  const blocked =
    (selected?.needsScope && !scope.trim()) ||
    (selected?.needsMerge && !mergeInto) ||
    !rationale.trim();

  return (
    <div className="stack" style={{ gap: 10 }}>
      <Notice tone="info" title="You are the routed-to role — you can rule">
        Recording a ruling here is the accountable decision for this escalation.
      </Notice>

      <div>
        <div className="section-label">Decision</div>
        <select className="input" value={choice} onChange={(ev) => setChoice(ev.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {selected?.needsScope && (
        <div>
          <div className="section-label">Scope to retain / exclude</div>
          <input
            className="input sm"
            placeholder="e.g. retain kyc.pan and kyc.id_document; delete the rest"
            value={scope}
            onChange={(ev) => setScope(ev.target.value)}
          />
        </div>
      )}

      {selected?.needsMerge && (
        <div>
          <div className="section-label">Merge into</div>
          <select className="input sm" value={mergeInto} onChange={(ev) => setMergeInto(ev.target.value)}>
            {existingCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <div className="section-label">Reasoning (required)</div>
        <textarea
          className="input"
          rows={3}
          placeholder="Why this decision? Recorded on the ruling and in the audit log."
          value={rationale}
          onChange={(ev) => setRationale(ev.target.value)}
        />
      </div>

      <div className="row">
        <button
          className="btn primary"
          disabled={pending || blocked}
          onClick={() => run(() => ruleEscalationAction(e.id, compose(), rationale))}
        >
          {pending ? "Recording…" : "Issue ruling"}
        </button>
      </div>
      <ActionError result={result} />
    </div>
  );
}

function prettyKey(k: string): string {
  return k
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/_/g, " ");
}
