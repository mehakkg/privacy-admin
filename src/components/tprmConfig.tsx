"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, Trash2, Plus, Lock } from "lucide-react";
import { Pill, Notice, type PillTone } from "@/components/ui";
import { ActionError } from "@/components/actions";
import {
  createRuleAction, updateRuleAction, deleteRuleAction, moveRuleAction,
  createTemplateAction, toggleTemplateActiveAction, deleteTemplateAction, addQuestionAction, removeQuestionAction,
} from "@/app/actions/tprmConfig";
import type { ActionResult } from "@/app/actions/requests";

const RISKS = ["low", "medium", "high", "critical"];
const RISK_TONE: Record<string, PillTone> = { low: "gray", medium: "yellow", high: "red", critical: "red" };

export interface RuleRow { id: string; categoryPattern: string; baselineRating: string }
export interface QuestionRow { id: string; section: string; label: string }
export interface TemplateRow { id: string; name: string; forTiers: string[]; description: string; active: boolean; questions: QuestionRow[] }

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });
  return { pending, result, run };
}

export function TprmConfig({ rules, templates, canEdit }: { rules: RuleRow[]; templates: TemplateRow[]; canEdit: boolean }) {
  return (
    <div className="stack" style={{ gap: 20 }}>
      {!canEdit && (
        <Notice tone="policy" title="Set by DPO / Legal">
          <span className="row" style={{ gap: 6 }}><Lock size={13} /> These templates and risk-appetite rules are governance-owned. You can view them; only the DPO or Legal can change them.</span>
        </Notice>
      )}
      <RulesSection rules={rules} canEdit={canEdit} />
      <TemplatesSection templates={templates} canEdit={canEdit} />
    </div>
  );
}

/** Ordered — first match wins, so the order is editable, not just the rows. */
function RulesSection({ rules, canEdit }: { rules: RuleRow[]; canEdit: boolean }) {
  const { pending, result, run } = useRun();
  const [editId, setEditId] = useState<string | null>(null);
  const [pat, setPat] = useState(""); const [base, setBase] = useState("medium");
  const [adding, setAdding] = useState(false);
  const [newPat, setNewPat] = useState(""); const [newBase, setNewBase] = useState("medium");

  return (
    <div className="card"><div className="card-body">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <h2 className="card-title" style={{ margin: 0 }}>Risk appetite rules</h2>
        {canEdit && !adding && <button className="btn ghost sm" onClick={() => setAdding(true)}><Plus size={13} /> Add rule</button>}
      </div>
      <p className="cell-sub" style={{ marginTop: 0 }}>New vendors are pre-scored by category. First match wins, top to bottom — order matters. Legal reviews and can override every rating individually; this only sets the starting point.</p>
      <div className="table-wrap">
        <table className="dtable">
          <thead><tr><th style={{ width: 60 }}>Priority</th><th>Category pattern</th><th>Baseline</th>{canEdit && <th style={{ width: 120 }}></th>}</tr></thead>
          <tbody>
            {rules.map((r, i) => (
              <tr key={r.id}>
                <td className="cell-sub">{i + 1}</td>
                <td>{editId === r.id ? <input className="input sm" value={pat} onChange={(e) => setPat(e.target.value)} /> : <code className="field-chip">{r.categoryPattern}</code>}</td>
                <td>{editId === r.id ? (
                  <select className="input sm" value={base} onChange={(e) => setBase(e.target.value)} style={{ width: 110 }}>{RISKS.map((x) => <option key={x} value={x}>{x}</option>)}</select>
                ) : <Pill tone={RISK_TONE[r.baselineRating]}>{r.baselineRating}</Pill>}</td>
                {canEdit && (
                  <td>
                    {editId === r.id ? (
                      <span className="row" style={{ gap: 4 }}>
                        <button className="btn primary xs" disabled={pending} onClick={() => run(() => updateRuleAction(r.id, pat, base), () => setEditId(null))}>Save</button>
                        <button className="btn ghost xs" onClick={() => setEditId(null)}>Cancel</button>
                      </span>
                    ) : (
                      <span className="row" style={{ gap: 2 }}>
                        <button className="icon-btn" disabled={pending || i === 0} title="Move up" onClick={() => run(() => moveRuleAction(r.id, "up"))}><ChevronUp size={14} /></button>
                        <button className="icon-btn" disabled={pending || i === rules.length - 1} title="Move down" onClick={() => run(() => moveRuleAction(r.id, "down"))}><ChevronDown size={14} /></button>
                        <button className="btn ghost xs" onClick={() => { setEditId(r.id); setPat(r.categoryPattern); setBase(r.baselineRating); }}>Edit</button>
                        <button className="icon-btn" disabled={pending} title="Delete" onClick={() => run(() => deleteRuleAction(r.id))}><Trash2 size={14} /></button>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {adding && canEdit && (
              <tr>
                <td className="cell-sub">{rules.length + 1}</td>
                <td><input className="input sm" placeholder="e.g. payment|lending" value={newPat} onChange={(e) => setNewPat(e.target.value)} autoFocus /></td>
                <td><select className="input sm" value={newBase} onChange={(e) => setNewBase(e.target.value)} style={{ width: 110 }}>{RISKS.map((x) => <option key={x} value={x}>{x}</option>)}</select></td>
                <td><span className="row" style={{ gap: 4 }}>
                  <button className="btn primary xs" disabled={pending || !newPat.trim()} onClick={() => run(() => createRuleAction(newPat, newBase), () => { setAdding(false); setNewPat(""); })}>Add</button>
                  <button className="btn ghost xs" onClick={() => setAdding(false)}>Cancel</button>
                </span></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ActionError result={result} />
    </div></div>
  );
}

function TemplatesSection({ templates, canEdit }: { templates: TemplateRow[]; canEdit: boolean }) {
  const { pending, result, run } = useRun();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(""); const [tiers, setTiers] = useState<string[]>([]); const [desc, setDesc] = useState("");

  return (
    <div className="card"><div className="card-body">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <h2 className="card-title" style={{ margin: 0 }}>Questionnaire templates</h2>
        {canEdit && !adding && <button className="btn ghost sm" onClick={() => setAdding(true)}><Plus size={13} /> Add template</button>}
      </div>
      <div className="table-wrap">
        <table className="dtable">
          <thead><tr><th>Name</th><th>Applies to tiers</th><th>Questions</th><th>Active</th>{canEdit && <th style={{ width: 150 }}></th>}</tr></thead>
          <tbody>
            {adding && canEdit && (
              <tr>
                <td><input className="input sm" placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></td>
                <td><span className="row" style={{ gap: 4, flexWrap: "wrap" }}>{RISKS.map((x) => <button key={x} className={`btn xs ${tiers.includes(x) ? "primary" : "ghost"}`} onClick={() => setTiers((s) => s.includes(x) ? s.filter((y) => y !== x) : [...s, x])}>{x}</button>)}</span></td>
                <td className="cell-sub">—</td><td className="cell-sub">—</td>
                <td><span className="row" style={{ gap: 4 }}>
                  <button className="btn primary xs" disabled={pending || !name.trim()} onClick={() => run(() => createTemplateAction(name, tiers, desc), () => { setAdding(false); setName(""); setTiers([]); setDesc(""); })}>Add</button>
                  <button className="btn ghost xs" onClick={() => setAdding(false)}>Cancel</button>
                </span></td>
              </tr>
            )}
            {templates.map((t) => (
              <TemplateRowView key={t.id} t={t} canEdit={canEdit} open={openId === t.id} onToggleOpen={() => setOpenId(openId === t.id ? null : t.id)} run={run} pending={pending} />
            ))}
            {templates.length === 0 && !adding && <tr><td colSpan={canEdit ? 5 : 4}><div className="empty">No templates yet.</div></td></tr>}
          </tbody>
        </table>
      </div>
      <ActionError result={result} />
    </div></div>
  );
}

function TemplateRowView({ t, canEdit, open, onToggleOpen, run, pending }: { t: TemplateRow; canEdit: boolean; open: boolean; onToggleOpen: () => void; run: (op: () => Promise<ActionResult>, after?: () => void) => void; pending: boolean }) {
  const [qSection, setQSection] = useState("Data handling"); const [qLabel, setQLabel] = useState("");
  const sections = [...new Set(t.questions.map((q) => q.section))];
  return (
    <>
      <tr className="clickable" onClick={onToggleOpen}>
        <td className="cell-primary">{t.name}</td>
        <td className="cell-sub">{t.forTiers.map((x) => <Pill key={x} tone={RISK_TONE[x]} dot={false}>{x}</Pill>)}</td>
        <td className="cell-sub">{t.questions.length}</td>
        <td>{t.active ? <Pill tone="green">Active</Pill> : <Pill tone="gray">Inactive</Pill>}</td>
        {canEdit && (
          <td onClick={(e) => e.stopPropagation()}>
            <span className="row" style={{ gap: 4 }}>
              <button className="btn ghost xs" disabled={pending} onClick={() => run(() => toggleTemplateActiveAction(t.id, !t.active))}>{t.active ? "Disable" : "Enable"}</button>
              <button className="icon-btn" disabled={pending} title="Delete" onClick={() => run(() => deleteTemplateAction(t.id))}><Trash2 size={14} /></button>
            </span>
          </td>
        )}
      </tr>
      {open && (
        <tr>
          <td colSpan={canEdit ? 5 : 4} style={{ background: "var(--bg-page)" }}>
            <div className="stack" style={{ gap: 8, padding: "4px 2px" }}>
              {t.description && <span className="cell-sub">{t.description}</span>}
              {sections.map((s) => (
                <div key={s}>
                  <div className="section-label" style={{ marginTop: 0 }}>{s}</div>
                  <div className="stack" style={{ gap: 4 }}>
                    {t.questions.filter((q) => q.section === s).map((q) => (
                      <div key={q.id} className="row" style={{ justifyContent: "space-between" }}>
                        <span>{q.label}</span>
                        {canEdit && <button className="icon-btn" disabled={pending} title="Remove" onClick={() => run(() => removeQuestionAction(q.id))}><Trash2 size={13} /></button>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {canEdit && (
                <div className="row" style={{ gap: 6, alignItems: "flex-end", marginTop: 4 }}>
                  <input className="input sm" placeholder="Section" value={qSection} onChange={(e) => setQSection(e.target.value)} style={{ width: 140 }} />
                  <input className="input sm" placeholder="New question…" value={qLabel} onChange={(e) => setQLabel(e.target.value)} style={{ flex: 1 }} />
                  <button className="btn sm" disabled={pending || !qLabel.trim()} onClick={() => run(() => addQuestionAction(t.id, qSection, qLabel), () => setQLabel(""))}><Plus size={13} /> Add question</button>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
