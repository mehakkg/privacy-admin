"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Clock, MoreHorizontal, Copy, Archive, RotateCcw, Trash2 } from "lucide-react";
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

/** ⋯ menu per row: Duplicate / Retire|Restore / Delete (type-to-confirm). */
function RowMenu({ row }: { row: NoticeRow }) {
  const { pending, result, run } = useRun();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState("");
  const retired = row.status === "retired";

  return (
    <span className="rowmenu">
      <button className="icon-btn" title="More actions" onClick={() => setOpen((o) => !o)} aria-label="More actions">
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <>
          <div className="rowmenu-scrim" onClick={() => { setOpen(false); setConfirmDelete(false); }} />
          <div className="rowmenu-pop" onClick={(e) => e.stopPropagation()}>
            {!confirmDelete ? (
              <div className="stack" style={{ gap: 2 }}>
                <button className="menu-item" disabled={pending} onClick={() => run(() => duplicateNoticeAction(row.id), () => setOpen(false))}>
                  <Copy size={14} /> Duplicate
                </button>
                {retired ? (
                  <button className="menu-item" disabled={pending} onClick={() => run(() => restoreRetiredNoticeAction(row.id), () => setOpen(false))}>
                    <RotateCcw size={14} /> Restore to draft
                  </button>
                ) : (
                  <button
                    className="menu-item"
                    disabled={pending || row.status !== "published"}
                    title={row.status !== "published" ? "Only a published notice can be retired" : undefined}
                    onClick={() => run(() => retireNoticeAction(row.id, null), () => setOpen(false))}
                  >
                    <Archive size={14} /> Retire
                  </button>
                )}
                <button className="menu-item danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={14} /> Delete…
                </button>
              </div>
            ) : (
              <div className="stack" style={{ gap: 8, minWidth: 240 }}>
                <div className="cell-sub">
                  Type <strong>{row.name}</strong> to delete. This cannot be undone.
                </div>
                <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={row.name} autoFocus />
                <div className="row" style={{ gap: 6 }}>
                  <button
                    className="btn danger sm"
                    disabled={pending || typed !== row.name}
                    onClick={() => run(() => deleteNoticeAction(row.id, typed), () => setOpen(false))}
                  >
                    {pending ? "Deleting…" : "Delete notice"}
                  </button>
                  <button className="btn ghost sm" onClick={() => { setConfirmDelete(false); setTyped(""); }}>Cancel</button>
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

/** Clock icon → lightweight version-history popover, without leaving the list. */
function HistoryPopover({ row }: { row: NoticeRow }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="rowmenu">
      <button className="icon-btn" title="Version history" onClick={() => setOpen((o) => !o)} aria-label="Version history">
        <Clock size={16} />
      </button>
      {open && (
        <>
          <div className="rowmenu-scrim" onClick={() => setOpen(false)} />
          <div className="rowmenu-pop" onClick={(e) => e.stopPropagation()} style={{ minWidth: 280 }}>
            <div className="section-label" style={{ marginTop: 0 }}>Version history</div>
            {row.history.length === 0 ? (
              <div className="cell-sub">No saved versions yet.</div>
            ) : (
              <div className="stack" style={{ gap: 8, maxHeight: 260, overflowY: "auto" }}>
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
            <div style={{ marginTop: 8 }}>
              <Link href={`/consent/notices/${row.id}?tab=content`} className="btn ghost xs">Open full history →</Link>
            </div>
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
                  <span className="row" style={{ gap: 2 }}>
                    <Link href={`/consent/notices/${n.id}?tab=content`} className="icon-btn" title="Edit content" aria-label="Edit">
                      <Pencil size={16} />
                    </Link>
                    <HistoryPopover row={n} />
                    <RowMenu row={n} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
