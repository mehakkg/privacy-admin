"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  MoreHorizontal, Pencil, GitPullRequest, LayoutTemplate, LockOpen, ToggleLeft, ToggleRight,
  RotateCcw, Copy, FolderInput, Trash2, PanelRightOpen, Clock, ShieldCheck, Plus, X,
} from "lucide-react";
import type { InventoryRowView } from "@/components/masking/FieldInventory";
import { CreateRuleModal, type CatalogField } from "@/components/masking/CreateRuleModal";
import {
  setOverrideOffAction, deleteRuleAction, unlockSelfLockedAction, proposeOverrideOnAction,
  moveRuleToTemplateAction, ruleVersionsAction, ruleContextAction, getCustomTemplatesAction, templateFieldsAction,
} from "@/app/actions/masking";
import type { RuleVersion } from "@/lib/masking";
import type { TemplateFieldRow } from "@/lib/engines/masking";

type Item =
  | { kind: "modal"; label: string; icon: React.ReactNode; open: () => void; danger?: boolean }
  | { kind: "nav"; label: string; icon: React.ReactNode; danger?: boolean }
  | { kind: "act"; label: string; icon: React.ReactNode; run: () => Promise<{ ok: boolean; error?: string }> }
  | { kind: "note"; label: string; icon: React.ReactNode };

type Rule = { family: string; params: Record<string, unknown> };
type Modal =
  | { t: "stepper"; mode: "create" | "edit" | "override" | "duplicate"; rule: Rule | null; field: CatalogField; catalog: CatalogField[] }
  | { t: "restore"; versions: RuleVersion[] }
  | { t: "move"; templates: { key: string; name: string }[] }
  | { t: "delete" }
  | { t: "turnon" }
  | { t: "template"; rows: TemplateFieldRow[] };

/**
 * Per-row ⋯ actions. Every mutating action runs through its OWN modal (portaled
 * to body) — never the right-side drawer. "Open details" is the only item that
 * opens the drawer. Clicking the row itself also opens the drawer.
 */
export function RowActionMenu({ row }: { row: InventoryRowView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const away = () => setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", away);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("scroll", away, true); window.removeEventListener("resize", away); };
  }, [open]);

  const toggleMenu = () => {
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 220) });
    setOpen(true); setErr(null);
  };

  // Lazily fetch a field's rule + catalog, then open the stepper modal.
  const openStepper = (mode: "create" | "edit" | "override" | "duplicate") => {
    setOpen(false); setBusy(true);
    ruleContextAction(row.code).then((ctx) => {
      setBusy(false);
      const field = ctx.field ?? { code: row.code, name: row.name, sensitivity: row.sensitivity, source: row.governedBadge ?? "No rule", systemRegulated: row.systemRegulated, sampleValue: "" };
      setModal({ t: "stepper", mode, rule: mode === "create" ? null : ctx.rule, field, catalog: ctx.catalog });
    });
  };
  const openRestore = () => { setOpen(false); setBusy(true); ruleVersionsAction(row.code).then(({ versions }) => { setBusy(false); setModal({ t: "restore", versions }); }); };
  const openMove = () => { setOpen(false); setBusy(true); getCustomTemplatesAction().then(({ templates }) => { setBusy(false); setModal({ t: "move", templates: templates.map((t) => ({ key: t.key, name: t.name })) }); }); };
  const openTemplate = () => { setOpen(false); setBusy(true); templateFieldsAction(row.governedLayer === "baseline" ? "BASELINE" : (row.governedBadge?.replace(" template", "") ?? "")).then(({ fields }) => { setBusy(false); setModal({ t: "template", rows: fields }); }); };

  const act = (run: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    const r = await run();
    if (r.ok) { setOpen(false); setModal(null); setErr(null); router.refresh(); }
    else setErr(r.error ?? "Failed.");
  });

  const openDetails = { kind: "nav", label: "Open details", icon: <PanelRightOpen size={14} /> } as Item;

  let items: Item[];
  if (row.pending) {
    items = [{ kind: "nav", label: "View pending change", icon: <Clock size={14} /> }, openDetails];
  } else {
    switch (row.state) {
      case "no_rule":
        items = [{ kind: "modal", label: "Create rule", icon: <Plus size={14} />, open: () => openStepper("create") }, openDetails]; break;
      case "regulatory_floor":
        items = [{ kind: "note", label: "Platform-owned — cannot be changed", icon: <ShieldCheck size={14} /> }, openDetails]; break;
      case "template_governed":
        items = [
          { kind: "modal", label: "Override", icon: <GitPullRequest size={14} />, open: () => openStepper("override") },
          { kind: "modal", label: "View template", icon: <LayoutTemplate size={14} />, open: openTemplate },
          openDetails,
        ]; break;
      case "self_locked":
        items = [{ kind: "act", label: "Unlock", icon: <LockOpen size={14} />, run: () => unlockSelfLockedAction(row.code) }, openDetails]; break;
      case "override_off":
        items = [
          { kind: "modal", label: "Turn override on", icon: <ToggleRight size={14} />, open: () => setModal({ t: "turnon" }) },
          { kind: "modal", label: "Delete stored rule", icon: <Trash2 size={14} />, open: () => setModal({ t: "delete" }), danger: true },
          openDetails,
        ]; break;
      case "ambiguous":
        items = [openDetails]; break;
      default: // tenant_governed
        items = [
          { kind: "modal", label: "Edit", icon: <Pencil size={14} />, open: () => openStepper("edit") },
          { kind: "act", label: "Switch override off", icon: <ToggleLeft size={14} />, run: () => setOverrideOffAction(row.code) },
          { kind: "modal", label: "Restore earlier version", icon: <RotateCcw size={14} />, open: openRestore },
          { kind: "modal", label: "Duplicate", icon: <Copy size={14} />, open: () => openStepper("duplicate") },
          ...(row.canMove ? [{ kind: "modal", label: "Move to template", icon: <FolderInput size={14} />, open: openMove } as Item] : []),
          { kind: "modal", label: "Delete", icon: <Trash2 size={14} />, open: () => setModal({ t: "delete" }), danger: true },
          openDetails,
        ];
    }
  }

  return (
    <div className="row-menu" ref={ref} style={{ position: "relative" }}>
      <button ref={btnRef} className="icon-btn" aria-label={`Actions for ${row.code}`} aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={toggleMenu}>
        <MoreHorizontal size={16} />
      </button>
      {open && pos && (
        <div className="row-menu-pop" role="menu" style={{ position: "fixed", top: pos.top, left: pos.left, right: "auto" }}>
          {items.map((it, i) => {
            if (it.kind === "note") return <div key={i} className="row-menu-note">{it.icon} {it.label}</div>;
            if (it.kind === "nav") return <button key={i} role="menuitem" className="row-menu-item" onClick={() => { router.push(row.href); setOpen(false); }}>{it.icon} {it.label}</button>;
            if (it.kind === "modal") return <button key={i} role="menuitem" className={`row-menu-item${it.danger ? " danger" : ""}`} onClick={it.open}>{it.icon} {it.label}</button>;
            return <button key={i} role="menuitem" className="row-menu-item" disabled={pending} onClick={() => act(it.run)}>{it.icon} {it.label}</button>;
          })}
          {err && <div className="row-menu-err">{err}</div>}
        </div>
      )}

      {/* --- Modals (all portaled to body, never the drawer) --- */}
      {modal?.t === "stepper" && (
        <CreateRuleModal
          catalog={modal.mode === "duplicate" ? modal.catalog.filter((f) => f.code !== row.code) : [modal.field]}
          initialSelected={modal.mode === "duplicate" ? [] : [row.code]}
          lockedField={modal.mode === "duplicate" ? undefined : row.code}
          startStep={modal.mode === "edit" || modal.mode === "override" ? 1 : 0}
          initialRule={modal.rule ?? undefined}
          heading={modal.mode === "create" ? "Create rule" : modal.mode === "override" ? "Override rule" : modal.mode === "duplicate" ? `Duplicate ${row.code}’s rule` : "Edit rule"}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.t === "restore" && (
        <ActionModal title={`Restore an earlier version of ${row.code}`} onClose={() => setModal(null)}>
          <p className="cell-sub" style={{ marginTop: 0 }}>Re-enter a previous value from this rule’s history. It opens the editor and goes to the DPO for approval.</p>
          {modal.versions.length === 0 ? <p className="cell-sub">No earlier versions recorded.</p> : (
            <div className="stack" style={{ gap: 6 }}>
              {modal.versions.map((v, i) => (
                <div key={i} className="row" style={{ gap: 8, justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border-soft)" }}>
                  <span className="cell-sub"><span className="mono">{v.label}</span> · {v.by} · {v.at}</span>
                  <button className="btn sm" onClick={() => { ruleContextAction(row.code).then((ctx) => setModal({ t: "stepper", mode: "edit", rule: { family: v.family, params: v.params }, field: ctx.field ?? { code: row.code, name: row.name, sensitivity: row.sensitivity, source: row.governedBadge ?? "", systemRegulated: row.systemRegulated, sampleValue: "" }, catalog: ctx.catalog })); }}>Restore</button>
                </div>
              ))}
            </div>
          )}
        </ActionModal>
      )}
      {modal?.t === "move" && <MoveModal code={row.code} templates={modal.templates} busy={pending} err={err} onMove={(key) => act(() => moveRuleToTemplateAction(row.code, key))} onClose={() => setModal(null)} />}
      {modal?.t === "turnon" && <TurnOnModal code={row.code} busy={pending} err={err} onConfirm={(reason) => act(() => proposeOverrideOnAction(row.code, reason))} onClose={() => setModal(null)} />}
      {modal?.t === "delete" && (
        <ActionModal title={`Delete the rule on ${row.code}?`} onClose={() => setModal(null)}>
          <p className="cell-sub" style={{ marginTop: 0 }}>This removes the rule and its channel/role views. This cannot be undone.</p>
          {err && <div className="notice danger" style={{ margin: "6px 0" }}><div>{err}</div></div>}
          <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button className="btn" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn danger" disabled={pending} onClick={() => act(() => deleteRuleAction(row.code))}>{pending ? "Deleting…" : "Delete rule"}</button>
          </div>
        </ActionModal>
      )}
      {modal?.t === "template" && (
        <ActionModal title={`${row.governedBadge} — fields`} onClose={() => setModal(null)}>
          <div className="table-wrap"><table className="dtable compact"><thead><tr><th>Field</th><th>Rule</th><th>Preview</th></tr></thead>
            <tbody>
              {modal.rows.map((t) => <tr key={t.code}><td className="mono">{t.code}</td><td className="cell-sub">{t.label}</td><td className="mono cell-sub">{t.preview.split(" → ")[1] ?? t.preview}</td></tr>)}
              {modal.rows.length === 0 && <tr><td colSpan={3}><span className="cell-sub">No fields in this template.</span></td></tr>}
            </tbody>
          </table></div>
        </ActionModal>
      )}
    </div>
  );
}

/** Small portaled modal shell for the row actions. */
function ActionModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal std-modal sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="std-modal-head"><h3 style={{ margin: 0 }}>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <div className="std-modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function MoveModal({ code, templates, busy, err, onMove, onClose }: { code: string; templates: { key: string; name: string }[]; busy: boolean; err: string | null; onMove: (key: string) => void; onClose: () => void }) {
  const [key, setKey] = useState("");
  return (
    <ActionModal title={`Move ${code} to a custom template`} onClose={onClose}>
      <p className="cell-sub" style={{ marginTop: 0 }}>A true re-association — the same rule, the same audit history, only its template changes.</p>
      {err && <div className="notice danger" style={{ margin: "6px 0" }}><div>{err}</div></div>}
      <label className="fld"><span>Custom template</span>
        <select className="input" value={key} onChange={(e) => setKey(e.target.value)}>
          <option value="">Choose a template…</option>
          {templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
        </select>
      </label>
      <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!key || busy} onClick={() => onMove(key)}>{busy ? "Moving…" : "Move"}</button>
      </div>
    </ActionModal>
  );
}

function TurnOnModal({ code, busy, err, onConfirm, onClose }: { code: string; busy: boolean; err: string | null; onConfirm: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <ActionModal title={`Turn the override back on for ${code}`} onClose={onClose}>
      <p className="cell-sub" style={{ marginTop: 0 }}>Restoring the stored rule is a change, so it goes to the DPO for approval.</p>
      {err && <div className="notice danger" style={{ margin: "6px 0" }}><div>{err}</div></div>}
      <label className="fld"><span>Reason</span>
        <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why the stored rule should apply again." />
      </label>
      <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => onConfirm(reason)}>{busy ? "Submitting…" : "Submit for approval"}</button>
      </div>
    </ActionModal>
  );
}
