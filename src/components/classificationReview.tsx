"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListDetail, type Column } from "@/components/ListDetail";
import { InfoTip, Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import {
  approveFieldsAction,
  assignPurposeAction,
  overrideFieldAction,
} from "@/app/actions/discovery";
import type { ActionResult } from "@/app/actions/requests";

export interface ReviewRow {
  id: string;
  fieldPath: string;
  sourceName: string;
  detectedType: string;
  maskedSample: string;
  previousType: string | null;
  purposeTagId: string | null;
  confidence: string;
  reviewState: string;
  driftFlag: boolean;
}

const TYPES = [
  "PAN", "Aadhaar", "Email", "Phone", "Date of birth", "Currency",
  "Customer ID", "Free text", "Not personal data",
];

/**
 * Classification review as list + detail.
 *
 * The list carries only enough to identify and triage a row. The full edit UI —
 * override, required reason, purpose — lives in the panel for the one selected
 * row, so a reviewer is never scrolling past forms they are not using.
 *
 * Bulk approve stays on the list: the high-confidence case is the majority of
 * rows and must not require opening anything.
 */
export function ClassificationReview({
  rows,
  purposes,
}: {
  rows: ReviewRow[];
  purposes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const statusOf = (r: ReviewRow) =>
    r.driftFlag
      ? { label: "Drift", tone: "yellow" as const }
      : r.confidence === "needs_review"
        ? { label: "Needs review", tone: "yellow" as const }
        : { label: "High confidence", tone: "green" as const };

  const columns: Column<ReviewRow>[] = [
    {
      key: "field",
      header: "Field",
      render: (r) => (
        <div className="cell-stack">
          <span className="mono cell-primary">{r.fieldPath}</span>
          <span className="cell-sub">{r.sourceName}</span>
        </div>
      ),
    },
    {
      key: "suggested",
      header: "Suggested",
      render: (r) => <span className="cell-sub">{r.detectedType}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: 130,
      render: (r) => {
        const s = statusOf(r);
        return <Pill tone={s.tone}>{s.label}</Pill>;
      },
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

  return (
    <>
      <ListDetail<ReviewRow>
        items={rows}
        columns={columns}
        isUnreviewed={(r) => r.reviewState === "pending"}
        emptyLabel="Nothing awaiting classification review."
        detailEmptyLabel="Select a field to review its classification."
        bulkActions={(ids, clear) => (
          <button
            className="btn primary sm"
            disabled={pending}
            onClick={() =>
              run(() => approveFieldsAction(ids), clear)
            }
          >
            Approve {ids.length}
          </button>
        )}
        renderDetail={(row, { advance }) => (
          <ReviewPanel
            key={row.id}
            row={row}
            purposes={purposes}
            pending={pending}
            onOverride={(type, reason) =>
              run(() => overrideFieldAction(row.id, type, reason), advance)
            }
            onApprove={() => run(() => approveFieldsAction([row.id]), advance)}
            onPurpose={(purposeId) =>
              run(() => assignPurposeAction(row.id, purposeId))
            }
          />
        )}
      />
      <ActionError result={result} />
    </>
  );
}

function ReviewPanel({
  row,
  purposes,
  pending,
  onOverride,
  onApprove,
  onPurpose,
}: {
  row: ReviewRow;
  purposes: { id: string; name: string }[];
  pending: boolean;
  onOverride: (type: string, reason: string) => void;
  onApprove: () => void;
  onPurpose: (purposeId: string) => void;
}) {
  // Keyed by row id from the parent, so switching rows resets the form rather
  // than carrying a half-typed reason onto a different field.
  const [type, setType] = useState(row.detectedType);
  const [reason, setReason] = useState("");
  const [purpose, setPurpose] = useState(row.purposeTagId ?? "");

  const changed = type !== row.detectedType;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div>
        <div className="mono cell-primary" style={{ fontSize: 13 }}>
          {row.fieldPath}
        </div>
        <div className="cell-sub">{row.sourceName}</div>
      </div>

      {row.driftFlag && row.previousType && (
        <div className="notice warn compact">
          <span>
            Was <strong>{row.previousType}</strong>, now read as{" "}
            <strong>{row.detectedType}</strong>.
          </span>
          <InfoTip
            align="left"
            text="This field was already classified and approved. Because it was previously trusted, a change matters more than a first-time classification — confirm whether the data changed or the detector is wrong."
          />
        </div>
      )}

      <div>
        <div className="section-label">Sample</div>
        <code className="field-chip">{row.maskedSample}</code>
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
          <div className="section-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            Reason
            <InfoTip
              align="left"
              text="Required when changing a classification. Without it the next reviewer cannot tell a considered correction from a mistake."
            />
          </div>
          <textarea
            className="input"
            rows={2}
            placeholder="Why is this classification wrong?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      )}

      <div>
        <div className="section-label">Purpose</div>
        <select
          className="input"
          value={purpose}
          onChange={(e) => {
            setPurpose(e.target.value);
            if (e.target.value) onPurpose(e.target.value);
          }}
        >
          <option value="">Not assigned</option>
          {purposes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <p className="cell-sub" style={{ margin: "4px 0 0" }}>
          Only DPO-approved purposes appear here.
        </p>
      </div>

      <div className="row" style={{ gap: 8 }}>
        {changed ? (
          <button
            className="btn primary"
            disabled={pending || !reason.trim()}
            onClick={() => onOverride(type, reason)}
          >
            {pending ? "Saving…" : "Confirm override"}
          </button>
        ) : (
          <button className="btn primary" disabled={pending} onClick={onApprove}>
            {pending ? "Saving…" : "Confirm"}
          </button>
        )}
      </div>
    </div>
  );
}
