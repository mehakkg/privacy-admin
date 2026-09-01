"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * LIST + DETAIL
 *
 * Browse compact, edit focused, one at a time. Replaces stacking a full edit
 * form per item down the page, which forces Admin to scroll past forms they are
 * not using to reach the one they are.
 *
 * Selection is client state, not a route: picking a row must not cost a
 * navigation when the point is to move quickly through a queue.
 *
 * Bulk actions live on the LIST, deliberately. The "high confidence, just
 * approve it" case should never require opening a detail panel — if it did,
 * bulk approval would be slower than individual approval.
 */

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (item: T) => ReactNode;
  width?: number;
}

const ADVANCE_KEY = "privacy-admin.autoAdvance";

export function ListDetail<T extends { id: string }>({
  items,
  columns,
  renderDetail,
  bulkActions,
  emptyLabel = "Nothing to review.",
  detailEmptyLabel = "Select a row to review it.",
  /** Rows still needing attention — used to pick the next one on confirm. */
  isUnreviewed,
}: {
  items: T[];
  columns: Column<T>[];
  renderDetail: (item: T, helpers: { advance: () => void }) => ReactNode;
  bulkActions?: (selectedIds: string[], clear: () => void) => ReactNode;
  emptyLabel?: string;
  detailEmptyLabel?: ReactNode;
  isUnreviewed?: (item: T) => boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const [checked, setChecked] = useState<string[]>([]);
  const [autoAdvance, setAutoAdvance] = useState(false);

  // Preference, not policy: some reviewers want to fly through a queue, others
  // want to stop on each item and think.
  useEffect(() => {
    try {
      setAutoAdvance(window.localStorage.getItem(ADVANCE_KEY) === "1");
    } catch {
      /* storage blocked — default off */
    }
  }, []);

  // If the selected row disappears after a save, fall back to the first row
  // rather than showing an empty panel next to a populated list.
  useEffect(() => {
    if (selectedId && !items.some((i) => i.id === selectedId)) {
      setSelectedId(items[0]?.id ?? null);
    }
  }, [items, selectedId]);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  const advance = () => {
    if (!autoAdvance) return;
    const idx = items.findIndex((i) => i.id === selectedId);
    const rest = items.slice(idx + 1);
    const next = isUnreviewed ? rest.find(isUnreviewed) : rest[0];
    setSelectedId(next?.id ?? null);
  };

  const setAdvance = (on: boolean) => {
    setAutoAdvance(on);
    try {
      window.localStorage.setItem(ADVANCE_KEY, on ? "1" : "0");
    } catch {
      /* preference simply will not persist */
    }
  };

  const allChecked = items.length > 0 && checked.length === items.length;

  return (
    <div className="ld">
      <div className="ld-list">
        {bulkActions && (
          <div className="ld-bulk">
            <label className="row" style={{ gap: 5 }}>
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(e) => setChecked(e.target.checked ? items.map((i) => i.id) : [])}
              />
              <span className="cell-sub">
                {checked.length > 0 ? `${checked.length} selected` : "Select all"}
              </span>
            </label>
            {checked.length > 0 && bulkActions(checked, () => setChecked([]))}
          </div>
        )}

        <div className="table-wrap ld-table">
          <table className="dtable">
            <thead>
              <tr>
                {bulkActions && <th style={{ width: 30 }} />}
                {columns.map((c) => (
                  <th key={c.key} style={c.width ? { width: c.width } : undefined}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className={`ld-row${selectedId === item.id ? " selected" : ""}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  {bulkActions && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked.includes(item.id)}
                        onChange={(e) =>
                          setChecked((c) =>
                            e.target.checked
                              ? [...c, item.id]
                              : c.filter((x) => x !== item.id),
                          )
                        }
                      />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key}>{c.render(item)}</td>
                  ))}
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={columns.length + (bulkActions ? 1 : 0)}>
                    <div className="empty">{emptyLabel}</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <aside className="ld-detail">
        {selected ? (
          <>
            <div className="ld-detail-head">
              <label className="row" style={{ gap: 6 }} title="After confirming, jump straight to the next item that still needs attention.">
                <input
                  type="checkbox"
                  checked={autoAdvance}
                  onChange={(e) => setAdvance(e.target.checked)}
                />
                <span className="cell-sub">Advance on confirm</span>
              </label>
            </div>
            <div className="ld-detail-body">{renderDetail(selected, { advance })}</div>
          </>
        ) : (
          <div className="empty">{detailEmptyLabel}</div>
        )}
      </aside>
    </div>
  );
}
