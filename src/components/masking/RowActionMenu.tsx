"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  MoreHorizontal, Pencil, GitPullRequest, LayoutTemplate, LockOpen, ToggleLeft, ToggleRight,
  RotateCcw, Copy, FolderInput, Trash2, PanelRightOpen, Clock, ShieldCheck, Plus,
} from "lucide-react";
import type { InventoryRowView } from "@/components/masking/FieldInventory";
import { setOverrideOffAction, deleteRuleAction, unlockSelfLockedAction } from "@/app/actions/masking";

type Item =
  | { kind: "nav"; label: string; icon: React.ReactNode; to?: string; danger?: boolean }
  | { kind: "act"; label: string; icon: React.ReactNode; run: () => Promise<{ ok: boolean; error?: string }>; danger?: boolean; confirm?: string }
  | { kind: "note"; label: string; icon: React.ReactNode };

/**
 * Per-row ⋯ action menu. Lists the actions valid for the row's state (the same
 * set the drawer offers). One-click mutations (switch off, unlock, delete) run
 * inline; form-based actions open the drawer focused on that action via `?do=`.
 * Clicking the row itself (not this menu) opens the drawer.
 */
export function RowActionMenu({ row }: { row: InventoryRowView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setConfirm(null); } };
    const reposition = () => { setOpen(false); setConfirm(null); };
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("scroll", reposition, true); window.removeEventListener("resize", reposition); };
  }, [open]);

  const toggle = () => {
    if (open) { setOpen(false); setConfirm(null); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 212) });
    setOpen(true); setConfirm(null);
  };

  const nav = (doParam?: string) => { router.push(row.href + (doParam ? `&do=${doParam}` : "")); setOpen(false); };
  const act = (run: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    const r = await run();
    if (r.ok) { setOpen(false); setConfirm(null); setErr(null); router.refresh(); }
    else setErr(r.error ?? "Failed.");
  });

  const open_ = { kind: "nav", label: "Open details", icon: <PanelRightOpen size={14} /> } as Item;

  let items: Item[];
  if (row.pending) {
    items = [{ kind: "nav", label: "View pending change", icon: <Clock size={14} /> }, open_];
  } else {
    switch (row.state) {
      case "no_rule":
        items = [{ kind: "nav", label: "Create rule", icon: <Plus size={14} />, to: "create" }, open_]; break;
      case "regulatory_floor":
        items = [{ kind: "note", label: "Platform-owned — cannot be changed", icon: <ShieldCheck size={14} /> }, open_]; break;
      case "template_governed":
        items = [
          { kind: "nav", label: "Override", icon: <GitPullRequest size={14} />, to: "override" },
          { kind: "nav", label: "View template", icon: <LayoutTemplate size={14} />, to: "template" },
          open_,
        ]; break;
      case "self_locked":
        items = [
          { kind: "act", label: "Unlock", icon: <LockOpen size={14} />, run: () => unlockSelfLockedAction(row.code) },
          open_,
        ]; break;
      case "override_off":
        items = [
          { kind: "nav", label: "Turn override on", icon: <ToggleRight size={14} />, to: "on" },
          { kind: "act", label: "Delete stored rule", icon: <Trash2 size={14} />, run: () => deleteRuleAction(row.code), danger: true, confirm: "Delete the stored rule for good?" },
          open_,
        ]; break;
      case "ambiguous":
        items = [open_]; break;
      default: // tenant_governed
        items = [
          { kind: "nav", label: "Edit", icon: <Pencil size={14} />, to: "edit" },
          { kind: "act", label: "Switch override off", icon: <ToggleLeft size={14} />, run: () => setOverrideOffAction(row.code) },
          { kind: "nav", label: "Restore earlier version", icon: <RotateCcw size={14} />, to: "restore" },
          { kind: "nav", label: "Duplicate", icon: <Copy size={14} />, to: "duplicate" },
          ...(row.canMove ? [{ kind: "nav", label: "Move to template", icon: <FolderInput size={14} />, to: "move" } as Item] : []),
          { kind: "act", label: "Delete", icon: <Trash2 size={14} />, run: () => deleteRuleAction(row.code), danger: true, confirm: "Delete this rule entirely? This removes it and its channel/role views." },
          open_,
        ];
    }
  }

  return (
    <div className="row-menu" ref={ref} style={{ position: "relative" }}>
      <button ref={btnRef} className="icon-btn" aria-label={`Actions for ${row.code}`} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        <MoreHorizontal size={16} />
      </button>
      {open && pos && (
        <div className="row-menu-pop" role="menu" style={{ position: "fixed", top: pos.top, left: pos.left, right: "auto" }}>
          {items.map((it, i) => {
            if (it.kind === "note") return <div key={i} className="row-menu-note">{it.icon} {it.label}</div>;
            if (it.kind === "nav") return <button key={i} role="menuitem" className={`row-menu-item${it.danger ? " danger" : ""}`} onClick={() => nav(it.to)}>{it.icon} {it.label}</button>;
            // act
            if (confirm === it.label) {
              return (
                <div key={i} className="row-menu-confirm">
                  <span>{it.confirm}</span>
                  <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    <button className="btn danger sm" disabled={pending} onClick={() => act(it.run)}>Delete</button>
                    <button className="btn ghost sm" onClick={() => setConfirm(null)}>Cancel</button>
                  </div>
                </div>
              );
            }
            return <button key={i} role="menuitem" className={`row-menu-item${it.danger ? " danger" : ""}`} disabled={pending} onClick={() => (it.confirm ? setConfirm(it.label) : act(it.run))}>{it.icon} {it.label}</button>;
          })}
          {err && <div className="row-menu-err">{err}</div>}
        </div>
      )}
    </div>
  );
}
