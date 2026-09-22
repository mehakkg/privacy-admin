"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListDetail, type Column } from "@/components/ListDetail";
import { InfoTip, KeyValue, Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { resolveDuplicateAction, resolveRotAction } from "@/app/actions/discovery";
import type { ActionResult } from "@/app/actions/requests";

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------

export interface DupRow {
  id: string;
  similarityScore: number;
  resolution: string;
  matchReason: string | null;
  a: { id: string; fieldPath: string; sourceName: string; detectedType: string; maskedSample: string; lastVerified: string | null };
  b: { id: string; fieldPath: string; sourceName: string; detectedType: string; maskedSample: string; lastVerified: string | null };
}

/**
 * The side-by-side comparison moves into the detail panel. It is the densest
 * thing on the screen and only ever concerns one pair, so laying it out as a
 * full page meant scrolling a list of pairs past a comparison of one.
 */
export function DuplicateReview({ rows }: { rows: DupRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const columns: Column<DupRow>[] = [
    {
      key: "pair",
      header: "Pair",
      render: (r) => (
        <div className="cell-stack">
          <span className="mono cell-primary">{r.a.fieldPath}</span>
          <span className="mono cell-sub">{r.b.fieldPath}</span>
        </div>
      ),
    },
    {
      key: "sim",
      header: "Similarity",
      width: 110,
      render: (r) => (
        <Pill tone={r.similarityScore >= 90 ? "red" : r.similarityScore >= 75 ? "yellow" : "gray"}>
          {r.similarityScore}%
        </Pill>
      ),
    },
    {
      key: "res",
      header: "Status",
      width: 120,
      render: (r) =>
        r.resolution === "unresolved" ? (
          <Pill tone="yellow">Open</Pill>
        ) : (
          <Pill tone="green">{r.resolution.replace("_", " ")}</Pill>
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

  return (
    <>
      <ListDetail<DupRow>
        items={rows}
        columns={columns}
        isUnreviewed={(r) => r.resolution === "unresolved"}
        emptyLabel="No duplicate candidates."
        detailEmptyLabel="Select a pair to compare it."
        renderDetail={(row, { advance }) => (
          <div className="stack" style={{ gap: 14 }}>
            <div className="row">
              <Pill tone={row.similarityScore >= 90 ? "red" : "yellow"}>
                {row.similarityScore}% similar
              </Pill>
              <InfoTip
                align="left"
                text="Similarity is computed from the values and the field names. Below about 90% the match is worth treating with suspicion."
              />
            </div>

            {/* Match reasoning — the flag is never a black box. */}
            <div className="cell-sub" style={{ marginBottom: 8 }}>
              Matched on: {(row.matchReason ?? `${row.a.detectedType === row.b.detectedType ? `${row.a.detectedType} (exact)` : `${row.a.detectedType}/${row.b.detectedType}`}; ${row.similarityScore}% similarity`).replace(/^matched on:\s*/i, "")}
            </div>
            {/* Disputed fields highlighted by default. */}
            {(() => {
              const disputed = [
                row.a.detectedType !== row.b.detectedType ? "Type" : null,
                row.a.fieldPath !== row.b.fieldPath ? "Field name" : null,
                row.a.sourceName !== row.b.sourceName ? "Source" : null,
              ].filter(Boolean) as string[];
              return disputed.length ? <div className="row" style={{ gap: 4, flexWrap: "wrap", marginBottom: 10 }}><span className="cell-sub">Disputed:</span>{disputed.map((d) => <Pill key={d} tone="yellow" dot={false}>{d}</Pill>)}</div> : null;
            })()}

            <div className="grid-2">
              {[row.a, row.b].map((side, i) => (
                <div key={side.id}>
                  <div className="section-label">{i === 0 ? "A" : "B"}</div>
                  <KeyValue
                    rows={[
                      ["Field", <span key="f" className="mono">{side.fieldPath}</span>],
                      ["Source", side.sourceName],
                      ["Type", side.detectedType],
                      ["Sample", <span key="s" className="mono">{side.maskedSample}</span>],
                      ["Verified", side.lastVerified ?? "—"],
                    ]}
                  />
                </div>
              ))}
            </div>

            {row.resolution === "unresolved" ? (
              <DuplicateActions
                pending={pending}
                onResolve={(res, keptId) =>
                  run(() => resolveDuplicateAction(row.id, res, keptId), advance)
                }
              />
            ) : (
              <div className="notice ok compact">
                <span>Resolved — {row.resolution.replace("_", " ")}.</span>
              </div>
            )}
          </div>
        )}
      />
      <ActionError result={result} />
    </>
  );
}

/**
 * "Keep both" is the primary and sits first. A false-positive match is a
 * realistic failure and merging two genuinely different records is not
 * practically reversible, so merge must not be the path of least resistance.
 */
function DuplicateActions({
  pending,
  onResolve,
}: {
  pending: boolean;
  onResolve: (
    resolution: "merge" | "keep_both" | "keep_one",
    keptFieldId: string | null,
  ) => void;
}) {
  const [confirmMerge, setConfirmMerge] = useState(false);

  return (
    <div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button
          className="btn primary"
          disabled={pending}
          onClick={() => onResolve("keep_both", null)}
        >
          Keep both
        </button>
        {confirmMerge ? (
          <>
            <button
              className="btn danger"
              disabled={pending}
              onClick={() => onResolve("merge", null)}
            >
              Confirm merge
            </button>
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
          Merging combines these across every connected system. If they are
          genuinely different records, this is not practically reversible.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ROT
// ---------------------------------------------------------------------------

export interface RotRow {
  id: string;
  fieldPath: string;
  sourceName: string;
  businessValueScore: number;
  lastAccessed: string | null;
  reason: string;
  resolution: string;
  resolutionReason: string | null;
}

export function RotReview({ rows }: { rows: RotRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const columns: Column<RotRow>[] = [
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
      key: "score",
      header: "Value",
      width: 90,
      render: (r) => (
        <Pill tone={r.businessValueScore < 20 ? "red" : r.businessValueScore < 50 ? "yellow" : "gray"}>
          {r.businessValueScore}
        </Pill>
      ),
    },
    {
      key: "res",
      header: "Status",
      width: 120,
      render: (r) =>
        r.resolution === "unresolved" ? (
          <Pill tone="yellow">Open</Pill>
        ) : (
          <Pill tone={r.resolution === "delete" ? "red" : r.resolution === "quarantine" ? "yellow" : "green"}>
            {r.resolution}
          </Pill>
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

  return (
    <>
      <ListDetail<RotRow>
        items={rows}
        columns={columns}
        isUnreviewed={(r) => r.resolution === "unresolved"}
        emptyLabel="Nothing flagged as redundant."
        detailEmptyLabel="Select a candidate to decide on it."
        renderDetail={(row, { advance }) => (
          <RotPanel
            key={row.id}
            row={row}
            pending={pending}
            onResolve={(res, reason) =>
              run(() => resolveRotAction(row.id, res, reason), advance)
            }
          />
        )}
      />
      <ActionError result={result} />
    </>
  );
}

function RotPanel({
  row,
  pending,
  onResolve,
}: {
  row: RotRow;
  pending: boolean;
  onResolve: (
    resolution: "quarantine" | "delete" | "retain",
    reason: string,
  ) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div>
        <div className="mono cell-primary" style={{ fontSize: 13 }}>
          {row.fieldPath}
        </div>
        <div className="cell-sub">{row.sourceName}</div>
      </div>

      <KeyValue
        rows={[
          [
            <span key="v" className="row" style={{ gap: 5 }}>
              Business value
              <InfoTip
                align="left"
                text="0-100, from how often the data is read, whether anything depends on it, and whether it duplicates something else."
              />
            </span>,
            <Pill key="p" tone={row.businessValueScore < 20 ? "red" : "yellow"}>
              {row.businessValueScore}
            </Pill>,
          ],
          ["Last accessed", row.lastAccessed ?? "—"],
          ["Why flagged", row.reason],
        ]}
      />

      {row.resolution === "unresolved" ? (
        <>
          <div>
            <div className="section-label">Reason</div>
            <textarea
              className="input"
              rows={2}
              placeholder="Why this decision? Recorded against the field."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn primary"
              disabled={pending || !reason.trim()}
              onClick={() => onResolve("retain", reason)}
            >
              Retain
            </button>
            <button
              className="btn"
              disabled={pending || !reason.trim()}
              onClick={() => onResolve("quarantine", reason)}
            >
              Quarantine
            </button>
            <button
              className="btn danger"
              disabled={pending || !reason.trim()}
              onClick={() => onResolve("delete", reason)}
            >
              Delete
            </button>
          </div>
        </>
      ) : (
        <div className="notice ok compact">
          <span>
            {row.resolution} — {row.resolutionReason}
          </span>
        </div>
      )}
    </div>
  );
}
