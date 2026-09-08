"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { X, Plus, MoreHorizontal, Maximize2, Minimize2, Trash2, GripVertical } from "lucide-react";
import { Card } from "@/components/ui";
import { saveDashboardLayoutAction, type SavedWidget } from "@/app/actions/dashboard";
import {
  WIDGET_BY_ID, LIBRARY, RECOMMENDED_IDS, WIDGET_CATEGORIES, type WidgetDef, type WidgetSize,
} from "@/lib/dashboard/widgets";
import type { DashboardMetrics } from "@/lib/dashboard/metrics";
import { ROLE_LABEL, type ActorRole } from "@/lib/domain";

/**
 * MY DASHBOARD — the fourth, fully customizable tab. A drag-to-reorder grid the
 * current role builds from the widget library. State persists per-role (see
 * saveDashboardLayoutAction), so switching "Acting as" shows a different saved
 * layout. Tier-1 widgets never appear here — they are pinned on Operations.
 */
export function MyDashboard({
  metrics,
  initial,
  role,
}: {
  metrics: DashboardMetrics;
  initial: SavedWidget[];
  role: string;
}) {
  const [widgets, setWidgets] = useState<SavedWidget[]>(initial);
  const [, startSave] = useTransition();
  const [libOpen, setLibOpen] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const dragIndex = useRef<number | null>(null);

  const commit = (next: SavedWidget[]) => {
    setWidgets(next);
    startSave(() => { void saveDashboardLayoutAction(next); });
  };

  const addWidget = (id: string) => {
    if (widgets.some((w) => w.id === id)) return;
    const def = WIDGET_BY_ID[id];
    commit([...widgets, { id, size: def.sizes.includes("compact") ? "compact" : "full" }]);
  };
  const removeWidget = (id: string) => commit(widgets.filter((w) => w.id !== id));
  const resizeWidget = (id: string, size: WidgetSize) => commit(widgets.map((w) => (w.id === id ? { ...w, size } : w)));
  const startRecommended = () => commit(RECOMMENDED_IDS.map((id) => ({ id, size: WIDGET_BY_ID[id].sizes.includes("full") ? "full" : "compact" })));

  const onDrop = (to: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === to) return;
    const next = [...widgets];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commit(next);
  };

  const addedIds = new Set(widgets.map((w) => w.id));

  if (widgets.length === 0) {
    return (
      <>
        <div className="empty" style={{ padding: "40px 20px" }}>
          <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600 }}>Build your own view.</p>
          <p className="cell-sub" style={{ margin: "0 0 16px" }}>Add widgets from any part of the product. This view is yours as {ROLE_LABEL[role as ActorRole] ?? role} — it never changes the fixed tabs.</p>
          <div className="row" style={{ gap: 8, justifyContent: "center" }}>
            <button className="btn primary" onClick={() => setLibOpen(true)}><Plus size={15} /> Add widget</button>
            <button className="btn" onClick={startRecommended}>Start from recommended</button>
          </div>
        </div>
        {libOpen && <Library metrics={metrics} addedIds={addedIds} onAdd={addWidget} onRemove={removeWidget} onClose={() => setLibOpen(false)} />}
      </>
    );
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <span className="cell-sub">Your view as <strong>{ROLE_LABEL[role as ActorRole] ?? role}</strong> · saved automatically · {widgets.length} widget{widgets.length === 1 ? "" : "s"}</span>
        <button className="btn primary sm" onClick={() => setLibOpen(true)}><Plus size={14} /> Add widget</button>
      </div>

      <div className="myd-grid">
        {widgets.map((w, i) => {
          const def = WIDGET_BY_ID[w.id];
          if (!def) return null;
          return (
            <div
              key={w.id}
              className={`myd-cell${w.size === "full" ? " full" : ""}`}
              draggable
              onDragStart={() => (dragIndex.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(i)}
            >
              <Card
                title={<span className="row" style={{ gap: 6 }}><GripVertical size={14} className="myd-grip" />{def.name}</span>}
                actions={<CardMenu def={def} size={w.size} onRemove={() => removeWidget(w.id)} onResize={(s) => resizeWidget(w.id, s)} onView={() => setViewing(w.id)} />}
              >
                {def.render(metrics, w.size)}
              </Card>
            </div>
          );
        })}
      </div>

      {libOpen && <Library metrics={metrics} addedIds={addedIds} onAdd={addWidget} onRemove={removeWidget} onClose={() => setLibOpen(false)} />}

      {viewing && WIDGET_BY_ID[viewing] && (
        <div className="modal-scrim" onClick={() => setViewing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>{WIDGET_BY_ID[viewing].name}</h3>
              <button className="icon-btn" onClick={() => setViewing(null)} aria-label="Close"><X size={16} /></button>
            </div>
            {WIDGET_BY_ID[viewing].render(metrics, WIDGET_BY_ID[viewing].sizes.includes("full") ? "full" : "compact")}
          </div>
        </div>
      )}
    </>
  );
}

/** ⋯ menu per widget card — resize (where supported), view full screen, remove. */
function CardMenu({ def, size, onRemove, onResize, onView }: { def: WidgetDef; size: WidgetSize; onRemove: () => void; onResize: (s: WidgetSize) => void; onView: () => void }) {
  const [open, setOpen] = useState(false);
  const canResize = def.sizes.length > 1;
  return (
    <span className="rowmenu">
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Widget actions"><MoreHorizontal size={16} /></button>
      {open && (
        <>
          <div className="rowmenu-scrim" onClick={() => setOpen(false)} />
          <div className="rowmenu-pop" onClick={(e) => e.stopPropagation()} style={{ minWidth: 180 }}>
            {canResize && (
              size === "compact"
                ? <button className="menu-item" onClick={() => { onResize("full"); setOpen(false); }}><Maximize2 size={14} /> Expand to full</button>
                : <button className="menu-item" onClick={() => { onResize("compact"); setOpen(false); }}><Minimize2 size={14} /> Shrink to compact</button>
            )}
            <button className="menu-item" onClick={() => { onView(); setOpen(false); }}><Maximize2 size={14} /> View full screen</button>
            <button className="menu-item danger" onClick={() => { onRemove(); setOpen(false); }}><Trash2 size={14} /> Remove</button>
          </div>
        </>
      )}
    </span>
  );
}

/** The widget library, opened as a slide-in panel. Search + category, each row a
 *  live preview thumbnail (never a bare label), with Add / Added✓+Remove. */
function Library({ metrics, addedIds, onAdd, onRemove, onClose }: { metrics: DashboardMetrics; addedIds: Set<string>; onAdd: (id: string) => void; onRemove: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);

  const filtered = useMemo(() => LIBRARY.filter((w) =>
    (!cat || w.category === cat) &&
    (!q.trim() || (w.name + " " + w.description).toLowerCase().includes(q.toLowerCase()))
  ), [q, cat]);

  return (
    <div className="slideover-scrim" onClick={onClose}>
      <aside className="slideover" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <header className="slideover-head">
          <h2 style={{ margin: 0, fontSize: 15 }}>Widget library</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="slideover-body">
          <input className="input" placeholder="Search widgets…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
          <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            <button className={`chip${cat === null ? " on" : ""}`} onClick={() => setCat(null)}>All</button>
            {WIDGET_CATEGORIES.map((c) => <button key={c} className={`chip${cat === c ? " on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}
          </div>

          {WIDGET_CATEGORIES.filter((c) => !cat || c === cat).map((c) => {
            const rows = filtered.filter((w) => w.category === c);
            if (rows.length === 0) return null;
            return (
              <div key={c} style={{ marginBottom: 16 }}>
                <div className="section-label" style={{ marginTop: 0 }}>{c}</div>
                <div className="stack" style={{ gap: 8 }}>
                  {rows.map((w) => {
                    const added = addedIds.has(w.id);
                    return (
                      <div key={w.id} className="lib-row">
                        <div className="lib-thumb">{w.render(metrics, "compact")}</div>
                        <div className="cell-stack" style={{ flex: 1, minWidth: 0 }}>
                          <span className="cell-primary">{w.name}</span>
                          <span className="cell-sub">{w.description}</span>
                        </div>
                        {added ? (
                          <div className="stack" style={{ gap: 4, alignItems: "flex-end" }}>
                            <span className="pill green" style={{ whiteSpace: "nowrap" }}><span className="dot" />Added</span>
                            <button className="btn ghost xs" onClick={() => onRemove(w.id)}>Remove</button>
                          </div>
                        ) : (
                          <button className="btn sm" onClick={() => onAdd(w.id)}><Plus size={13} /> Add</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <p className="cell-sub">No widgets match.</p>}
        </div>
      </aside>
    </div>
  );
}
