"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ListDetail, type Column } from "@/components/ListDetail";
import { InfoTip, Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import {
  approveFieldsAction,
  overrideFieldAction,
  resolveTriageAction,
} from "@/app/actions/discovery";
import type { ActionResult } from "@/app/actions/requests";
import type { BulkOutcome } from "@/lib/engines/discovery";
import type { PillTone } from "@/components/ui";

export interface TriageRow {
  id: string;
  type: string;
  label: string;
  sourceName: string | null;
  priority: string;
  raised: string;
  note: string | null;
  crossRefType: string | null;
  driftFlag: boolean;
  /** Present for the types that are reviewed inline. */
  field: {
    id: string;
    detectedType: string;
    maskedSample: string;
    previousType: string | null;
  } | null;
  /** Where to go for types resolved on their own screen. */
  resolveHref: string | null;
}

const PRIORITY_TONE: Record<string, PillTone> = {
  high: "red",
  medium: "yellow",
  low: "gray",
};

const CROSSREF_LABEL: Record<string, string> = {
  low_confidence: "Low-confidence",
  new_pii: "New PII",
  rot: "ROT",
  duplicate: "Duplicates",
  quarantine: "Quarantined",
};

// Duplicates and ROT are no longer triage tabs — they have their own dedicated
// screens under Review & Classify. A cross-reference to one links to that
// screen; the remaining categories still resolve to a triage tab.
function crossRefHref(type: string): string {
  if (type === "duplicate") return "/discovery/duplicates";
  if (type === "rot") return "/discovery/rot";
  // Low-confidence is owned by Classification Review, no longer a triage tab.
  if (type === "low_confidence") return "/discovery/review";
  return `/discovery/triage?tab=${type}`;
}

const TYPES = [
  "PAN", "Aadhaar", "Email", "Phone", "Date of birth", "Currency",
  "Customer ID", "Free text", "Not personal data",
];

/**
 * Triage as list + detail.
 *
 * Reviewing an item happens in the panel beside the queue rather than on a
 * separate screen: the whole point of a queue is to keep working through it,
 * and a round-trip to another page and back loses your place every time.
 *
 * Types that need their own comparison UI (duplicates) or a separate decision
 * record (ROT) still link out — the drawer would have to become those screens
 * to hold them, which is not a drawer any more.
 */
export function TriageReview({ rows }: { rows: TriageRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null);

  const columns: Column<TriageRow>[] = [
    {
      key: "item",
      header: "Item",
      render: (r) => (
        <div className="cell-stack">
          <span className="mono cell-primary">{r.label}</span>
          {r.sourceName && <span className="cell-sub">{r.sourceName}</span>}
          {r.driftFlag && <Pill tone="orange">Drift</Pill>}
        </div>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      width: 100,
      render: (r) => <Pill tone={PRIORITY_TONE[r.priority] ?? "gray"}>{r.priority}</Pill>,
    },
    {
      key: "raised",
      header: "Raised",
      width: 110,
      render: (r) => <span className="cell-sub">{r.raised}</span>,
    },
    {
      key: "xref",
      header: "Also in",
      width: 120,
      render: (r) =>
        r.crossRefType ? (
          <span className="row" style={{ gap: 5 }}>
            <Link
              href={crossRefHref(r.crossRefType)}
              className="btn xs ghost"
              onClick={(e) => e.stopPropagation()}
            >
              {CROSSREF_LABEL[r.crossRefType]}
            </Link>
            <InfoTip
              align="left"
              text="This record also qualifies for another category. It is listed once, here, so the counts stay honest."
            />
          </span>
        ) : (
          <span className="cell-sub">—</span>
        ),
    },
  ];

  const run = (op: () => Promise<ActionResult>, after?: () => void) => {
    start(async () => {
      const r = await op();
      setResult(r);
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  };

  const bulk = (ids: string[], resolution: "resolved" | "dismissed" | "escalated", clear: () => void) => {
    start(async () => {
      const r = await resolveTriageAction(ids, resolution);
      setOutcome(r.outcome ?? null);
      clear();
      router.refresh();
    });
  };

  return (
    <>
      <ListDetail<TriageRow>
        items={rows}
        columns={columns}
        emptyLabel="Nothing open in this category."
        detailEmptyLabel="Select an item to review it."
        bulkActions={(ids, clear) => (
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm" disabled={pending} onClick={() => bulk(ids, "resolved", clear)}>
              Approve {ids.length}
            </button>
            <button className="btn sm" disabled={pending} onClick={() => bulk(ids, "dismissed", clear)}>
              Dismiss
            </button>
            <button className="btn sm" disabled={pending} onClick={() => bulk(ids, "escalated", clear)}>
              Escalate
            </button>
          </div>
        )}
        renderDetail={(row, { advance }) => (
          <TriagePanel
            key={row.id}
            row={row}
            pending={pending}
            onApprove={() => run(() => approveFieldsAction([row.field!.id]), advance)}
            onOverride={(type, reason) =>
              run(() => overrideFieldAction(row.field!.id, type, reason), advance)
            }
            onDismiss={() =>
              start(async () => {
                await resolveTriageAction([row.id], "dismissed");
                advance();
                router.refresh();
              })
            }
          />
        )}
      />

      {outcome && (
        <div
          className={`notice ${outcome.failed.length === 0 ? "ok" : "warn"}`}
          style={{ marginTop: 12 }}
        >
          <div className="notice-title">
            {outcome.succeeded.length} of {outcome.attempted} applied
            {outcome.failed.length > 0 && ` · ${outcome.failed.length} failed`}
          </div>
          {outcome.failed.length > 0 && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {outcome.failed.map((f) => (
                <li key={f.id}>{f.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ActionError result={result} />
    </>
  );
}

function TriagePanel({
  row,
  pending,
  onApprove,
  onOverride,
  onDismiss,
}: {
  row: TriageRow;
  pending: boolean;
  onApprove: () => void;
  onOverride: (type: string, reason: string) => void;
  onDismiss: () => void;
}) {
  const [type, setType] = useState(row.field?.detectedType ?? "");
  const [reason, setReason] = useState("");
  const changed = Boolean(row.field) && type !== row.field!.detectedType;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div>
        <div className="mono cell-primary" style={{ fontSize: 13 }}>
          {row.label}
        </div>
        {row.sourceName && <div className="cell-sub">{row.sourceName}</div>}
      </div>

      {row.note && (
        <div className="notice info compact">
          <span>{row.note}</span>
        </div>
      )}

      {row.field ? (
        <>
          {row.driftFlag && row.field.previousType && (
            <div className="notice warn compact">
              <span>
                Was <strong>{row.field.previousType}</strong>, now{" "}
                <strong>{row.field.detectedType}</strong>.
              </span>
            </div>
          )}

          <div>
            <div className="section-label">Sample</div>
            <code className="field-chip">{row.field.maskedSample}</code>
          </div>

          <div>
            <div className="section-label">Classification</div>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {changed && (
            <div>
              <div className="section-label">Reason</div>
              <textarea
                className="input"
                rows={2}
                placeholder="Why is this classification wrong?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}

          <div className="row" style={{ gap: 8 }}>
            {changed ? (
              <button
                className="btn primary"
                disabled={pending || !reason.trim()}
                onClick={() => onOverride(type, reason)}
              >
                Confirm override
              </button>
            ) : (
              <button className="btn primary" disabled={pending} onClick={onApprove}>
                Confirm
              </button>
            )}
            <button className="btn ghost" disabled={pending} onClick={onDismiss}>
              Dismiss
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="cell-sub" style={{ margin: 0 }}>
            {row.type === "duplicate"
              ? "Resolving a duplicate needs the side-by-side comparison."
              : "This decision is recorded on its own screen."}
          </p>
          {row.resolveHref && (
            <Link href={row.resolveHref} className="btn primary">
              Open
            </Link>
          )}
        </>
      )}
    </div>
  );
}
