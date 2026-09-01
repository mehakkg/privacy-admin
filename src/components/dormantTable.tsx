"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FieldChips, Pill, formatDate } from "@/components/ui";
import { ActionError } from "@/components/actions";
import {
  bulkDispositionAction,
  deprovisionAccountAction,
} from "@/app/actions/access";
import type { ActionResult } from "@/app/actions/requests";
import { DISPOSITION_LABEL, type Disposition } from "@/lib/domain";

export interface DormantRow {
  accountId: string;
  userName: string;
  username: string;
  systemName: string;
  lastActiveAt: Date | null;
  daysDormant: number | null;
  orphaned: boolean;
  liveSessions: number;
  reachableCategories: string[];
  disposition: { disposition: string; justification: string } | null;
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

export function DormantTable({
  rows,
  threshold,
  selectedAccount,
}: {
  rows: DormantRow[];
  threshold: number;
  selectedAccount: string | null;
}) {
  const { pending, result, run } = useAction();
  const [checked, setChecked] = useState<string[]>([]);
  const [disposition, setDisposition] = useState<Disposition>("revoke");
  const [justification, setJustification] = useState("");

  const toggle = (id: string) =>
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const allChecked = rows.length > 0 && checked.length === rows.length;
  const toggleAll = () => setChecked(allChecked ? [] : rows.map((r) => r.accountId));

  return (
    <div>
      {checked.length > 0 && (
        <div className="bulk-bar">
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <strong>{checked.length} selected</strong>
            <select
              className="input sm"
              value={disposition}
              onChange={(e) => setDisposition(e.target.value as Disposition)}
            >
              <option value="revoke">Revoke selected</option>
              <option value="retain">Retain selected</option>
            </select>
            <input
              className="input sm"
              style={{ minWidth: 320, flex: 1 }}
              placeholder="Batch justification (required) — applied to every selected account"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
            <button
              className="btn primary sm"
              disabled={pending || !justification.trim()}
              onClick={() =>
                run(
                  () => bulkDispositionAction(checked, disposition, justification),
                  () => {
                    setChecked([]);
                    setJustification("");
                  },
                )
              }
            >
              {pending
                ? "Recording…"
                : `${DISPOSITION_LABEL[disposition]} ${checked.length}`}
            </button>
            <button className="btn ghost sm" onClick={() => setChecked([])}>
              Clear
            </button>
          </div>
          <p className="cell-sub" style={{ margin: "6px 0 0" }}>
            The same justification is written identically onto every included
            account&apos;s audit entry. A bulk action is not an exemption from a reason —
            retaining a flagged account unexplained is as much of a gap as revoking one.
          </p>
        </div>
      )}

      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <th style={{ width: 28 }}>
                <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all" />
              </th>
              <th>Account</th>
              <th>System</th>
              <th>Last active</th>
              <th>Reaches</th>
              <th>Live sessions</th>
              <th>Disposition</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr
                key={d.accountId}
                style={
                  selectedAccount === d.accountId
                    ? { background: "var(--bg-selected)" }
                    : checked.includes(d.accountId)
                      ? { background: "var(--yellow-bg)" }
                      : undefined
                }
              >
                <td>
                  <input
                    type="checkbox"
                    checked={checked.includes(d.accountId)}
                    onChange={() => toggle(d.accountId)}
                    aria-label={`Select ${d.userName}`}
                  />
                </td>
                <td>
                  <div className="cell-stack">
                    <span className="cell-primary">{d.userName}</span>
                    <span className="cell-sub mono">{d.username}</span>
                    {d.orphaned && <Pill tone="red">Orphaned</Pill>}
                  </div>
                </td>
                <td>{d.systemName}</td>
                <td>
                  <div className="cell-stack">
                    <span>{formatDate(d.lastActiveAt)}</span>
                    <span className="cell-sub">
                      {d.daysDormant === null ? "never used" : `${d.daysDormant} days ago`}
                    </span>
                  </div>
                </td>
                <td>
                  {d.reachableCategories.length ? (
                    <FieldChips fields={d.reachableCategories} />
                  ) : (
                    <span className="muted">No live grants</span>
                  )}
                </td>
                <td
                  className="mono"
                  style={{
                    color: d.liveSessions ? "var(--red)" : undefined,
                    fontWeight: d.liveSessions ? 600 : 400,
                  }}
                >
                  {d.liveSessions}
                </td>
                <td>
                  {d.disposition ? (
                    <div className="cell-stack">
                      <Pill tone="green">
                        {DISPOSITION_LABEL[d.disposition.disposition as Disposition] ??
                          d.disposition.disposition}
                      </Pill>
                      <span className="cell-sub">{d.disposition.justification}</span>
                    </div>
                  ) : (
                    <Pill tone="yellow">Not decided</Pill>
                  )}
                </td>
                <td>
                  <div className="row" style={{ gap: 6 }}>
                    <Link
                      href={`/access/dormant?days=${threshold}&account=${d.accountId}`}
                      className="btn sm ghost"
                    >
                      Investigate
                    </Link>
                    <button
                      className="btn sm"
                      disabled={pending}
                      onClick={() => run(() => deprovisionAccountAction(d.accountId))}
                    >
                      Revoke now
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty">
                    No account has been dormant for more than {threshold} days.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ActionError result={result} />
    </div>
  );
}
