"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers, Plus, RefreshCw, Unlink, ChevronDown, ChevronRight, Check, AlertTriangle } from "lucide-react";
import { Pill } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { RuleEditor } from "@/components/masking/RuleEditor";
import { ruleLabel, type Rule, type RuleGroupView } from "@/lib/masking";
import { createGroupAction, reapplyGroupAction, detachFieldAction, validateGroupAction, type MaskingActionResult } from "@/app/actions/masking";
import type { GroupMemberValidation } from "@/lib/engines/masking";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<MaskingActionResult | null>(null);
  const run = (op: () => Promise<MaskingActionResult>, after?: () => void) =>
    start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });
  return { pending, result, run, setResult };
}

/**
 * SCREEN — Protection rules › By rule. RuleGroups apply one rule to many fields
 * via the existing atomic bulk (all-or-nothing) — NOT a resolution tier, and not
 * live propagation. A group is diverged when a member's effective tenant rule no
 * longer matches the group definition.
 */
export function ByRuleGroups({ groups, fields }: { groups: RuleGroupView[]; fields: { code: string; name: string }[] }) {
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <p className="cell-sub" style={{ margin: 0 }}>
          A rule group applies one masking rule to many fields in a single atomic write. It is console metadata, not a resolution tier.
        </p>
        <button className="btn primary sm" onClick={() => setCreating(true)}><Plus size={14} /> New rule group</button>
      </div>

      {groups.length === 0 ? (
        <div className="empty">No rule groups yet. Create one to apply a rule across several fields at once.</div>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {groups.map((g) => (
            <GroupRow key={g.id} g={g} open={!!open[g.id]} onToggle={() => setOpen((o) => ({ ...o, [g.id]: !o[g.id] }))} />
          ))}
        </div>
      )}

      {creating && <CreateGroupModal fields={fields} onClose={() => setCreating(false)} />}
    </div>
  );
}

function GroupRow({ g, open, onToggle }: { g: RuleGroupView; open: boolean; onToggle: () => void }) {
  const { pending, result, run } = useRun();
  return (
    <div className="card">
      <button className="card-head" onClick={onToggle} style={{ width: "100%", background: "none", border: 0, cursor: "pointer", textAlign: "left" }}>
        <span className="row" style={{ gap: 8, alignItems: "center" }}>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <Layers size={15} className="muted" />
          <span className="card-title">{g.name}</span>
        </span>
        <span className="row" style={{ marginLeft: "auto", gap: 8 }}>
          <Pill tone="gray" dot={false}>{g.label}</Pill>
          <Pill tone="gray" dot={false}>{g.memberCount} fields</Pill>
          <Pill tone={g.state === "in_sync" ? "green" : "yellow"} dot={false}>{g.state === "in_sync" ? "in sync" : `${g.divergedCodes.length} diverged`}</Pill>
        </span>
      </button>
      {open && (
        <div className="card-body">
          {result && !result.ok && <div className="notice danger" style={{ marginBottom: 10 }}><div className="notice-title">Refused — {result.errorKind}</div><div>{result.error}</div></div>}
          <div className="table-wrap">
            <table className="dtable compact">
              <thead><tr><th>Field</th><th>State</th><th style={{ width: 100 }} /></tr></thead>
              <tbody>
                {g.memberCodes.map((c) => {
                  const diverged = g.divergedCodes.includes(c);
                  return (
                    <tr key={c}>
                      <td className="mono">{c}</td>
                      <td>{diverged ? <Pill tone="yellow" dot={false}>diverged</Pill> : <Pill tone="green" dot={false}>in sync</Pill>}</td>
                      <td><button className="link-btn" disabled={pending} onClick={() => run(() => detachFieldAction(g.id, c))}><Unlink size={12} /> Detach</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {g.state === "diverged" && (
            <button className="btn sm" style={{ marginTop: 10 }} disabled={pending} onClick={() => run(() => reapplyGroupAction(g.id))}>
              <RefreshCw size={13} /> {pending ? "Re-applying…" : "Re-apply group rule"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CreateGroupModal({ fields, onClose }: { fields: { code: string; name: string }[]; onClose: () => void }) {
  const { pending, result, run } = useRun();
  const [name, setName] = useState("");
  const [rule, setRule] = useState<Rule>({ family: "partial", params: { showLast: 4, maskChar: "*" } });
  const [selected, setSelected] = useState<string[]>([]);
  const [validation, setValidation] = useState<GroupMemberValidation[]>([]);
  const [checking, setChecking] = useState(false);
  const seq = useRef(0);

  // Pre-validate BEFORE submit — bulk is all-or-nothing, so name every offender.
  useEffect(() => {
    if (selected.length === 0) { setValidation([]); return; }
    setChecking(true);
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const { members } = await validateGroupAction(rule.family, rule.params, selected);
      if (mine === seq.current) { setValidation(members); setChecking(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [selected, rule]);

  const offenders = validation.filter((v) => !v.eligible);
  const canCreate = !!name.trim() && selected.length > 0 && offenders.length === 0 && !checking;

  const toggle = (code: string) => setSelected((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]));

  const submit = () => run(() => createGroupAction({ name, family: rule.family, params: rule.params, memberCodes: selected }), onClose);

  return (
    <Modal
      title="New rule group"
      subtitle="Applies one rule to every member field in a single atomic write."
      size="lg"
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={pending || !canCreate} onClick={submit}>{pending ? "Applying…" : `Apply to ${selected.length} field${selected.length === 1 ? "" : "s"}`}</button></>}
    >
      {result && !result.ok && <div className="notice danger" style={{ marginBottom: 10 }}><div className="notice-title">Refused — {result.errorKind}</div><div>{result.error}</div></div>}
      <label className="fld"><span>Group name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Contact PII — last-4 masking" /></label>
      <div className="fld"><span>Rule</span><RuleEditor value={rule} onChange={setRule} floor={null} floorName={null} channel={null} sampleValue="9876543210" /></div>
      <div className="fld">
        <span>Member fields {checking && <span className="cell-sub">· checking…</span>}</span>
        <div className="stack" style={{ gap: 2, maxHeight: 220, overflowY: "auto", border: "1px solid var(--border-soft)", borderRadius: 8, padding: 8 }}>
          {fields.map((f) => {
            const v = validation.find((x) => x.code === f.code);
            const bad = v && !v.eligible;
            return (
              <label key={f.code} className="row" style={{ gap: 8, alignItems: "flex-start", padding: "4px 2px" }}>
                <input type="checkbox" checked={selected.includes(f.code)} onChange={() => toggle(f.code)} style={{ marginTop: 3 }} />
                <span className="cell-stack" style={{ flex: 1 }}>
                  <span className="mono cell-primary">{f.code} <span className="cell-sub">{f.name}</span></span>
                  {selected.includes(f.code) && v && (bad
                    ? <span className="cell-sub" style={{ color: "var(--red)" }}><AlertTriangle size={11} style={{ verticalAlign: -1 }} /> {v.reason}</span>
                    : <span className="cell-sub" style={{ color: "var(--green)" }}><Check size={11} style={{ verticalAlign: -1 }} /> eligible · {v.source}</span>)}
                </span>
              </label>
            );
          })}
        </div>
      </div>
      {offenders.length > 0 && (
        <div className="notice warn"><div className="notice-title">{offenders.length} selected field(s) can&rsquo;t take this rule</div>
          <div>Bulk apply is all-or-nothing. Remove them or change the rule: {offenders.map((o) => o.code).join(", ")}.</div>
        </div>
      )}
    </Modal>
  );
}
