"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, ChevronDown, ChevronRight, ShieldAlert, AlertTriangle } from "lucide-react";
import { Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import {
  CAPABILITY_CATALOG, MACRO_NAV_ORDER, sodConflicts, highSensitivityCount, summarise,
  type MacroNav,
} from "@/lib/rbac";
import { composeRoleAction } from "@/app/actions/rbac";
import type { ActionResult } from "@/app/actions/requests";
import type { RoleView } from "@/components/access/roleDetailDrawer";

/**
 * SCREEN 2 — Custom Role Composer. Split-pane: catalogue left (grouped by
 * macro-nav, opt-in only, nothing pre-checked), live plain-English summary right.
 * SoD conflicts are caught the moment the second conflicting capability is
 * checked — a blocking modal citing the specific rule, not a generic error — and
 * a high-sensitivity selection must be acknowledged before the role can be saved.
 */
export function RoleComposer({
  editing, templates, combined = false, onClose,
}: {
  editing?: RoleView | null;
  templates: RoleView[];
  combined?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(editing?.capabilityIds ?? []));
  const [ackHigh, setAckHigh] = useState(false);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<MacroNav>>(new Set());
  const [sodOpen, setSodOpen] = useState(false);

  const ids = useMemo(() => [...selected], [selected]);
  const conflicts = useMemo(() => sodConflicts(ids), [ids]);
  const highCount = highSensitivityCount(ids);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Catch a conflict the instant it's created.
      if (!prev.has(id) && sodConflicts([...next]).length > 0) setSodOpen(true);
      return next;
    });
  };

  const startFromTemplate = (t: RoleView) => {
    setSelected(new Set(t.capabilityIds));
    setAckHigh(false);
    if (!name.trim()) setName(`${t.name} (copy)`);
  };

  const catalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return MACRO_NAV_ORDER.map((g) => ({
      group: g,
      caps: CAPABILITY_CATALOG.filter((c) => c.group === g && (!q || c.action.toLowerCase().includes(q) || c.module.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))),
    })).filter((x) => x.caps.length > 0);
  }, [search]);

  const blocked = conflicts.length > 0 || (highCount > 0 && !ackHigh) || !name.trim() || selected.size === 0;

  const submit = (doSubmit: boolean) => {
    start(async () => {
      const r = await composeRoleAction({ roleId: editing?.id ?? null, name, description, capabilityIds: ids, submit: doSubmit });
      setResult(r);
      if (r.ok) { onClose(); router.refresh(); }
    });
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal composer" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h3 style={{ margin: 0 }}>{editing ? "Edit role" : "Compose a custom role"}</h3>
            <p className="cell-sub" style={{ margin: "2px 0 0" }}>Opt-in only — nothing is granted until you add it. Submitted roles go to the DPO for approval.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        {combined && (
          <div className="notice warn" style={{ marginTop: 12 }}>
            <div className="notice-title">No dedicated DPO</div>
            <div>Your organization has no dedicated DPO — automated checks are your primary safeguard against over-provisioning. Review this composition carefully; SoD conflicts are still hard-blocked.</div>
          </div>
        )}
        <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <input className="input" placeholder="Role name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: "1 1 220px" }} />
          <input className="input" placeholder="One-line description" value={description} onChange={(e) => setDescription(e.target.value)} style={{ flex: "2 1 280px" }} />
        </div>

        {templates.length > 0 && (
          <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span className="cell-sub">Start from template:</span>
            {templates.slice(0, 4).map((t) => (
              <button key={t.id} className="btn ghost xs" onClick={() => startFromTemplate(t)}>{t.name}</button>
            ))}
            <span className="cell-sub">— pre-fills, fully editable after.</span>
          </div>
        )}

        <div className="composer-grid">
          {/* Catalogue */}
          <div className="composer-catalog">
            <input className="input sm" placeholder="Search capabilities…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 8 }} />
            {catalog.map(({ group, caps }) => {
              const open = !collapsed.has(group);
              return (
                <div key={group} className="cap-group">
                  <button className="cap-group-head" onClick={() => setCollapsed((p) => { const n = new Set(p); if (n.has(group)) n.delete(group); else n.add(group); return n; })}>
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {group}
                    <span className="cell-sub" style={{ marginLeft: "auto" }}>{caps.filter((c) => selected.has(c.id)).length}/{caps.length}</span>
                  </button>
                  {open && caps.map((c) => {
                    const on = selected.has(c.id);
                    return (
                      <label key={c.id} className={`cap-row${on ? " on" : ""}${on && c.sensitivity === "high" ? " high" : ""}`}>
                        <input type="checkbox" checked={on} onChange={() => toggle(c.id)} />
                        <div className="stack" style={{ gap: 1 }}>
                          <span className="row" style={{ gap: 6 }}>
                            <span className="cell-primary">{c.action}</span>
                            {c.sensitivity === "high" && <Pill tone="red">High</Pill>}
                          </span>
                          <span className="cell-sub">{c.module} · {c.description}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Live summary */}
          <aside className="composer-summary">
            <div className="section-label">Live role summary</div>
            <p className="summary-text">{summarise(ids)}</p>

            <div className="row" style={{ gap: 12, marginTop: 8 }}>
              <span className="cell-sub">{selected.size} capabilit{selected.size === 1 ? "y" : "ies"}</span>
              <span className="cell-sub" style={{ color: highCount ? "var(--red)" : undefined }}><ShieldAlert size={12} style={{ verticalAlign: "-2px" }} /> {highCount} high-sensitivity</span>
            </div>

            {conflicts.length > 0 && (
              <div className="notice danger" style={{ marginTop: 12 }}>
                <div className="notice-title"><AlertTriangle size={12} /> Separation-of-duties conflict</div>
                <div>{conflicts[0].rule.rule}</div>
                <button className="btn danger sm" style={{ marginTop: 8 }} onClick={() => setSodOpen(true)}>Resolve conflict</button>
              </div>
            )}

            {highCount > 0 && conflicts.length === 0 && (
              <label className="ack-row" style={{ marginTop: 12 }}>
                <input type="checkbox" checked={ackHigh} onChange={(e) => setAckHigh(e.target.checked)} />
                <span>I acknowledge this role carries {highCount} high-sensitivity capabilit{highCount === 1 ? "y" : "ies"} and is least-privilege for its purpose.</span>
              </label>
            )}

            <div className="stack" style={{ gap: 8, marginTop: 16 }}>
              <button className="btn primary" disabled={pending || blocked} onClick={() => submit(true)}>
                {pending ? "Submitting…" : "Submit for DPO approval"}
              </button>
              <button className="btn" disabled={pending || !name.trim() || selected.size === 0} onClick={() => submit(false)}>Save as draft</button>
            </div>
            <ActionError result={result} />
          </aside>
        </div>

        {sodOpen && conflicts.length > 0 && (
          <SodModal
            a={conflicts[0].a.action} aDesc={conflicts[0].a.module}
            b={conflicts[0].b.action} bDesc={conflicts[0].b.module}
            rule={conflicts[0].rule.rule}
            onRemoveA={() => { setSelected((p) => { const n = new Set(p); n.delete(conflicts[0].a.id); return n; }); setSodOpen(false); }}
            onRemoveB={() => { setSelected((p) => { const n = new Set(p); n.delete(conflicts[0].b.id); return n; }); setSodOpen(false); }}
            onClose={() => setSodOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

function SodModal({
  a, aDesc, b, bDesc, rule, onRemoveA, onRemoveB, onClose,
}: {
  a: string; aDesc: string; b: string; bDesc: string; rule: string;
  onRemoveA: () => void; onRemoveB: () => void; onClose: () => void;
}) {
  return (
    <div className="modal-scrim" style={{ zIndex: 60 }} onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <h3 style={{ marginTop: 0, color: "var(--red)" }}><AlertTriangle size={16} style={{ verticalAlign: "-2px" }} /> Separation-of-duties conflict</h3>
        <p className="cell-sub" style={{ marginTop: 0 }}>These two capabilities cannot sit in one role. Remove one to continue.</p>
        <div className="sod-pair">
          <div className="sod-cap">
            <span className="cell-primary">{a}</span>
            <span className="cell-sub">{aDesc}</span>
            <button className="btn danger sm" onClick={onRemoveA} style={{ marginTop: 8 }}>Remove this</button>
          </div>
          <div className="sod-vs">conflicts with</div>
          <div className="sod-cap">
            <span className="cell-primary">{b}</span>
            <span className="cell-sub">{bDesc}</span>
            <button className="btn danger sm" onClick={onRemoveB} style={{ marginTop: 8 }}>Remove this</button>
          </div>
        </div>
        <div className="notice policy" style={{ marginTop: 12 }}>
          <div className="notice-title">The rule</div>
          <div>{rule}</div>
        </div>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn ghost" onClick={onClose}>Back to composer</button>
        </div>
      </div>
    </div>
  );
}
