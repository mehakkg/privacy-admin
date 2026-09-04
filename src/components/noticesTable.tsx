"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Clock, Copy, Archive, RotateCcw, Trash2 } from "lucide-react";
import { Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import {
  duplicateNoticeAction,
  retireNoticeAction,
  restoreRetiredNoticeAction,
  deleteNoticeAction,
  addRegionToNoticesAction,
  bulkSubmitPublishAction,
} from "@/app/actions/consent";
import { REGIONS } from "@/lib/domain";
import type { ActionResult } from "@/app/actions/requests";
import { formatDateTime } from "@/components/ui";

export interface NoticeRow {
  id: string;
  name: string;
  fiduciaryName: string | null;
  dataCategoryLabel: string | null;
  purposeName: string | null;
  version: string;
  status: string;
  approvalState: string;
  regionCount: number;
  languageCount: number;
  updated: string;
  supersededByName: string | null;
  history: { version: string; note: string | null; savedBy: string; savedAt: string }[];
}

const STATUS_TONE: Record<string, "green" | "yellow" | "gray"> = {
  published: "green",
  draft: "yellow",
  retired: "gray",
};

function useRun() {
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
  return { pending, result, run, setResult };
}

/**
 * ⋯ menu per row — the single trigger for ALL five row actions (Edit, View
 * history, Duplicate, Retire/Restore, Delete). Five is well above the two-icon
 * threshold, so nothing sits as a loose icon beside it.
 */
function RowMenu({ row }: { row: NoticeRow }) {
  const { pending, result, run } = useRun();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "history" | "delete">("menu");
  const [typed, setTyped] = useState("");
  const retired = row.status === "retired";

  const closeAll = () => { setOpen(false); setView("menu"); setTyped(""); };

  return (
    <span className="rowmenu">
      <button className="icon-btn" title="Actions" onClick={() => setOpen((o) => !o)} aria-label="Actions">
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <>
          <div className="rowmenu-scrim" onClick={closeAll} />
          <div className="rowmenu-pop" onClick={(e) => e.stopPropagation()} style={{ minWidth: view === "menu" ? 190 : 280 }}>
            {view === "menu" && (
              <div className="stack" style={{ gap: 2 }}>
                <Link href={`/consent/notices/${row.id}?tab=content`} className="menu-item">
                  <Pencil size={14} /> Edit
                </Link>
                <button className="menu-item" onClick={() => setView("history")}>
                  <Clock size={14} /> View history
                </button>
                <button className="menu-item" disabled={pending} onClick={() => run(() => duplicateNoticeAction(row.id), closeAll)}>
                  <Copy size={14} /> Duplicate
                </button>
                {retired ? (
                  <button className="menu-item" disabled={pending} onClick={() => run(() => restoreRetiredNoticeAction(row.id), closeAll)}>
                    <RotateCcw size={14} /> Restore to draft
                  </button>
                ) : (
                  <button
                    className="menu-item"
                    disabled={pending || row.status !== "published"}
                    title={row.status !== "published" ? "Only a published notice can be retired" : undefined}
                    onClick={() => run(() => retireNoticeAction(row.id, null), closeAll)}
                  >
                    <Archive size={14} /> Retire
                  </button>
                )}
                <button className="menu-item danger" onClick={() => setView("delete")}>
                  <Trash2 size={14} /> Delete…
                </button>
              </div>
            )}

            {view === "history" && (
              <div>
                <div className="section-label" style={{ marginTop: 0 }}>Version history</div>
                {row.history.length === 0 ? (
                  <div className="cell-sub">No saved versions yet.</div>
                ) : (
                  <div className="stack" style={{ gap: 8, maxHeight: 240, overflowY: "auto" }}>
                    {row.history.map((h, i) => (
                      <div key={i} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                        <span className="mono cell-primary">{h.version}</span>
                        <div className="cell-stack">
                          <span className="cell-sub">{h.note ?? "—"}</span>
                          <span className="cell-sub">{h.savedBy} · {formatDateTime(new Date(h.savedAt))}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="row" style={{ gap: 6, marginTop: 8 }}>
                  <button className="btn ghost xs" onClick={() => setView("menu")}>← Back</button>
                  <Link href={`/consent/notices/${row.id}?tab=content`} className="btn ghost xs">Open full history →</Link>
                </div>
              </div>
            )}

            {view === "delete" && (
              <div className="stack" style={{ gap: 8 }}>
                <div className="cell-sub">Type <strong>{row.name}</strong> to delete. This cannot be undone.</div>
                <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={row.name} autoFocus />
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn danger sm" disabled={pending || typed !== row.name} onClick={() => run(() => deleteNoticeAction(row.id, typed), closeAll)}>
                    {pending ? "Deleting…" : "Delete notice"}
                  </button>
                  <button className="btn ghost sm" onClick={() => setView("menu")}>Cancel</button>
                </div>
                <ActionError result={result} />
              </div>
            )}
          </div>
        </>
      )}
    </span>
  );
}

export function NoticesTable({ rows }: { rows: NoticeRow[] }) {
  const { pending, result, run } = useRun();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRegion, setBulkRegion] = useState<string>("");

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const ids = [...selected];

  return (
    <div>
      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="cell-primary">{selected.size} selected</span>
          <span style={{ flex: 1 }} />
          <select className="input sm" style={{ width: 180 }} value={bulkRegion} onChange={(e) => setBulkRegion(e.target.value)}>
            <option value="">Add region…</option>
            {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </select>
          <button
            className="btn sm"
            disabled={pending || !bulkRegion}
            onClick={() => run(() => addRegionToNoticesAction(ids, bulkRegion), () => setBulkRegion(""))}
          >
            Add to selected
          </button>
          <button
            className="btn primary sm"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const r = await bulkSubmitPublishAction(ids);
                return r.ok
                  ? { ok: true }
                  : { ok: false, error: `Submitted ${r.submitted.length}; skipped ${r.skipped.length} (${r.skipped.map((s) => s.reason).join(", ")})`, errorKind: "PartialError" };
              }, () => setSelected(new Set()))
            }
          >
            Submit selected for approval
          </button>
          <button className="btn ghost sm" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}
      {result && !result.ok && <ActionError result={result} />}

      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <th style={{ width: 28 }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
              </th>
              <th>Notice</th>
              <th>Fiduciary</th>
              <th>Category</th>
              <th>Purpose</th>
              <th>Version</th>
              <th>Status</th>
              <th>Regions</th>
              <th>Languages</th>
              <th>Updated</th>
              <th style={{ width: 96 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => (
              <tr key={n.id}>
                <td>
                  <input type="checkbox" checked={selected.has(n.id)} onChange={() => toggle(n.id)} aria-label={`Select ${n.name}`} />
                </td>
                <td>
                  <Link href={`/consent/notices/${n.id}`} className="row-link">{n.name}</Link>
                  {n.supersededByName && <div className="cell-sub">↳ superseded by {n.supersededByName}</div>}
                </td>
                <td className="cell-sub">{n.fiduciaryName ?? <span className="muted">—</span>}</td>
                <td className="cell-sub">{n.dataCategoryLabel ?? <span className="muted">—</span>}</td>
                <td className="cell-sub">{n.purposeName ?? <span className="muted">—</span>}</td>
                <td className="mono cell-sub">{n.version}</td>
                <td>
                  <span className="row" style={{ gap: 6 }}>
                    <Pill tone={STATUS_TONE[n.status] ?? "gray"}>{n.status}</Pill>
                    {n.approvalState !== "none" && <Pill tone="blue">awaiting DPO</Pill>}
                  </span>
                </td>
                <td className="cell-sub">{n.regionCount ? `${n.regionCount} region${n.regionCount === 1 ? "" : "s"}` : "—"}</td>
                <td className="cell-sub">{n.languageCount}</td>
                <td className="cell-sub">{n.updated}</td>
                <td>
                  <RowMenu row={n} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
