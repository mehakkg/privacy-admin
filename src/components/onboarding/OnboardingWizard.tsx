"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Rocket, Building2, Building, Check, Plus, Trash2, Upload, AlertTriangle, ShieldCheck, UserCog, Users } from "lucide-react";
import { ActionError } from "@/components/actions";
import { summarise } from "@/lib/rbac";
import type { RoleView } from "@/components/access/roleDetailDrawer";
import {
  setOrgSizeAction, completeLeanAction, createEntitiesAction, setEntitiesGovernanceAction, sendBulkInvitesAction,
} from "@/app/actions/orgOnboarding";
import type { ActionResult } from "@/app/actions/requests";

const DEDICATED = "dedicated_dpo";
const COMBINED = "combined_admin_dpo";

const GOV_EXPLAINER = "A DPO reviews sensitive decisions like data purposes and access roles. No dedicated DPO? You'll act in both capacities — approvals still get logged separately for audit purposes.";

export interface OnbEntity { id: string; name: string; governanceStructure: string | null }
type Step = "size" | "lean" | "entities" | "governance" | "invite";

interface InviteDraft { email: string; roleId: string | null; source: string }

export function OnboardingWizard({
  roles, entities, initialSize = null,
}: {
  roles: RoleView[];
  entities: OnbEntity[];
  initialSize?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [step, setStep] = useState<Step>("size");
  const [size, setSize] = useState<string | null>(initialSize);

  const runThen = (op: () => Promise<ActionResult>, after: () => void) =>
    start(async () => { const r = await op(); setResult(r); if (r.ok) after(); });

  return (
    <div className="onb-wrap">
      <div className="onb-steps">
        {(size === "enterprise" ? ["size", "entities", "governance", "invite"] : ["size", "lean"]).map((s, i) => (
          <span key={s} className={`onb-step-dot${step === s ? " active" : ""}`}>{i + 1}</span>
        ))}
      </div>

      {step === "size" && (
        <SizeStep
          size={size} setSize={setSize} pending={pending}
          onContinue={(t) => runThen(() => setOrgSizeAction(t), () => setStep(t === "enterprise" ? "entities" : "lean"))}
        />
      )}
      {step === "lean" && (
        <LeanStep pending={pending} onBack={() => setStep("size")}
          onDone={(name, gov) => runThen(() => completeLeanAction(name, gov), () => router.push("/dashboard?welcome=1"))} />
      )}
      {step === "entities" && (
        <EntitiesStep pending={pending} existing={entities}
          onContinue={(names) => runThen(() => createEntitiesAction(names), () => { router.refresh(); setStep("governance"); })} />
      )}
      {step === "governance" && (
        <GovernanceStep pending={pending} entities={entities}
          onBack={() => setStep("entities")}
          onContinue={(answers) => runThen(() => setEntitiesGovernanceAction(answers), () => { router.refresh(); setStep("invite"); })} />
      )}
      {step === "invite" && (
        <InviteStep pending={pending} roles={roles}
          onBack={() => setStep("governance")}
          onSend={(invites) => runThen(() => sendBulkInvitesAction(invites.map((i) => ({ email: i.email, roleId: i.roleId!, entityId: entities[0]?.id ?? null }))), () => router.push("/dashboard?welcome=1"))} />
      )}
      <ActionError result={result} />
    </div>
  );
}

// ---- Screen 1 --------------------------------------------------------------
function SizeStep({ size, setSize, pending, onContinue }: { size: string | null; setSize: (s: string) => void; pending: boolean; onContinue: (t: string) => void }) {
  const cards = [
    { id: "startup", icon: <Rocket size={20} />, title: "Startup", line: "A few people, one legal entity. The lean path — set up in two questions." },
    { id: "mid_market", icon: <Building2 size={20} />, title: "Mid-market", line: "One entity, a growing team. Lean setup, invite teammates after." },
    { id: "enterprise", icon: <Building size={20} />, title: "Enterprise", line: "Multiple legal entities. The structured path — entities, governance, bulk invites." },
  ];
  return (
    <div className="onb-card">
      <h2 className="onb-title">How big is your organization?</h2>
      <p className="cell-sub" style={{ marginTop: 0 }}>This sets your setup path. You can change any of it later.</p>
      <div className="onb-size-grid">
        {cards.map((c) => (
          <button key={c.id} className={`gov-choice${size === c.id ? " on" : ""}`} onClick={() => setSize(c.id)}>
            <span className="gov-choice-head">{c.icon} {c.title} {size === c.id && <Check size={15} className="gov-check" />}</span>
            <span className="cell-sub">{c.line}</span>
          </button>
        ))}
      </div>
      <div className="onb-actions">
        <button className="btn primary" disabled={!size || pending} onClick={() => size && onContinue(size)}>{pending ? "…" : "Continue"}</button>
      </div>
    </div>
  );
}

// ---- Governance toggle (shared by Lean + single-entity Structured) ---------
function GovToggle({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="gov-choices">
        <button className={`gov-choice${value === DEDICATED ? " on" : ""}`} onClick={() => onChange(DEDICATED)}>
          <span className="gov-choice-head"><ShieldCheck size={16} /> Yes — dedicated DPO {value === DEDICATED && <Check size={15} className="gov-check" />}</span>
          <span className="cell-sub">Approvals route to your DPO&rsquo;s queue for a separate review.</span>
        </button>
        <button className={`gov-choice${value === COMBINED ? " on" : ""}`} onClick={() => onChange(COMBINED)}>
          <span className="gov-choice-head"><UserCog size={16} /> No — combined Admin + DPO {value === COMBINED && <Check size={15} className="gov-check" />}</span>
          <span className="cell-sub">You review in a DPO capacity; approvals are logged as self-approved.</span>
        </button>
      </div>
      <p className="onb-explainer">{GOV_EXPLAINER}</p>
      {value && (
        <p className="cell-sub" style={{ marginTop: 6 }}>
          {value === COMBINED ? "→ Requests will route back to you and be marked self-approved in the audit trail." : "→ Requests will route to a dedicated DPO for review."}
        </p>
      )}
    </div>
  );
}

// ---- Screen 2 (Lean) -------------------------------------------------------
function LeanStep({ pending, onBack, onDone }: { pending: boolean; onBack: () => void; onDone: (name: string, gov: string) => void }) {
  const [name, setName] = useState("");
  const [gov, setGov] = useState<string | null>(null);
  const ready = name.trim() && gov;
  return (
    <div className="onb-card">
      <h2 className="onb-title">Organization basics</h2>
      <div className="stack" style={{ gap: 14 }}>
        <div>
          <div className="section-label">Organization name <span className="cell-sub">(required)</span></div>
          <input className="input" placeholder="e.g. Meridian Financial" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <div className="section-label">Does your organization have a dedicated Data Protection Officer?</div>
          <GovToggle value={gov} onChange={setGov} />
        </div>
      </div>
      <div className="onb-actions">
        <button className="btn ghost" onClick={onBack}>Back</button>
        <button className="btn primary" disabled={!ready || pending} onClick={() => ready && onDone(name.trim(), gov!)}>{pending ? "Setting up…" : "Continue to Dashboard"}</button>
      </div>
    </div>
  );
}

// ---- Screen 4 (Structured) — entities table with inline add ----------------
function EntitiesStep({ pending, existing, onContinue }: { pending: boolean; existing: OnbEntity[]; onContinue: (names: string[]) => void }) {
  const [rows, setRows] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [paste, setPaste] = useState("");

  const existingNames = useMemo(() => new Set(existing.map((e) => e.name.toLowerCase())), [existing]);
  const dupOf = (name: string, idx: number) => {
    const n = name.trim().toLowerCase();
    if (!n) return false;
    if (existingNames.has(n)) return true;
    return rows.findIndex((r, j) => j !== idx && r.trim().toLowerCase() === n) !== -1;
  };
  const addDraft = () => { const n = draft.trim(); if (!n) return; setRows([...rows, n]); setDraft(""); };
  const addPaste = () => {
    const names = paste.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (names.length) setRows([...rows, ...names]);
    setPaste("");
  };
  const onCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((t) => {
      const names = t.split(/\r?\n/).map((l) => l.split(",")[0].trim()).filter((s) => s && s.toLowerCase() !== "name");
      if (names.length) setRows((r) => [...r, ...names]);
    });
    e.target.value = "";
  };
  const anyDup = rows.some((r, i) => dupOf(r, i));
  const valid = rows.filter((r) => r.trim()).length > 0 && !anyDup;

  return (
    <div className="onb-card">
      <h2 className="onb-title">Set up your legal entities</h2>
      <div className="notice info" style={{ marginBottom: 12 }}>
        <div>Each legal entity is treated as its own Data Fiduciary under Section 2(i) — set up acquired subsidiaries as separate entities, not merged into one.</div>
      </div>

      <div className="table-wrap">
        <table className="dtable">
          <thead><tr><th>Entity name</th><th style={{ width: 40 }} /></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const dup = dupOf(r, i);
              return (
                <tr key={i} className={dup ? "pa-unsaved" : ""}>
                  <td>
                    <input className="pa-input" value={r} onChange={(e) => setRows(rows.map((x, j) => j === i ? e.target.value : x))} />
                    {dup && <span className="field-error"><AlertTriangle size={11} style={{ verticalAlign: "-1px" }} /> Duplicate entity name</span>}
                  </td>
                  <td><button className="icon-btn" aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td>
                </tr>
              );
            })}
            <tr className="add-row">
              <td>
                <span className="row" style={{ gap: 6 }}>
                  <input className="pa-input" placeholder="Add an entity…" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDraft(); } }} />
                  <button className="btn primary xs" disabled={!draft.trim()} onClick={addDraft}><Plus size={12} /> Add</button>
                </span>
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="row" style={{ gap: 16, marginTop: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 260px" }}>
          <div className="section-label">Paste a list <span className="cell-sub">(one per line)</span></div>
          <textarea className="input" rows={3} placeholder={"Meridian Financial\nNorthgate Lending"} value={paste} onChange={(e) => setPaste(e.target.value)} />
          <button className="btn sm" style={{ marginTop: 6 }} disabled={!paste.trim()} onClick={addPaste}>Add pasted</button>
        </div>
        <div>
          <div className="section-label">CSV upload</div>
          <label className="btn sm"><Upload size={13} /> Upload CSV<input type="file" accept=".csv,text/csv" hidden onChange={onCsv} /></label>
        </div>
      </div>

      <div className="onb-actions">
        <span className="cell-sub">{rows.filter((r) => r.trim()).length} entit{rows.filter((r) => r.trim()).length === 1 ? "y" : "ies"} to add{existing.length ? ` · ${existing.length} already exist` : ""}</span>
        <button className="btn primary" disabled={!valid || pending} onClick={() => onContinue(rows)}>{pending ? "Saving…" : "Continue"}</button>
      </div>
    </div>
  );
}

// ---- Screen 5 (Structured) — governance per entity -------------------------
function GovernanceStep({ pending, entities, onBack, onContinue }: { pending: boolean; entities: OnbEntity[]; onBack: () => void; onContinue: (answers: { entityId: string; governance: string }[]) => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries(entities.filter((e) => e.governanceStructure).map((e) => [e.id, e.governanceStructure!])));
  const single = entities.length === 1;
  const allAnswered = entities.every((e) => answers[e.id]);
  const firstAnswered = entities.find((e) => answers[e.id]);

  const applyToAll = () => {
    const v = firstAnswered ? answers[firstAnswered.id] : null;
    if (!v) return;
    setAnswers(Object.fromEntries(entities.map((e) => [e.id, answers[e.id] ?? v])));
  };

  return (
    <div className="onb-card">
      <h2 className="onb-title">Governance structure {single ? "" : "per entity"}</h2>
      {single ? (
        <>
          <p className="cell-sub" style={{ marginTop: 0 }}>Does <strong>{entities[0]?.name}</strong> have a dedicated Data Protection Officer?</p>
          <GovToggle value={answers[entities[0]?.id] ?? null} onChange={(v) => setAnswers({ [entities[0].id]: v })} />
        </>
      ) : (
        <>
          <p className="onb-explainer" style={{ marginTop: 0 }}>{GOV_EXPLAINER} Each legal entity answers for itself.</p>
          <div className="row" style={{ justifyContent: "flex-end", marginBottom: 8 }}>
            <button className="btn sm" disabled={!firstAnswered} onClick={applyToAll} title="Set every unanswered entity to the first answer">Apply to all</button>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {entities.map((e) => (
              <div key={e.id} className="onb-gov-row">
                <span className="row" style={{ gap: 8 }}>
                  {answers[e.id] ? <Check size={14} color="var(--green)" /> : <span className="onb-unanswered" title="Unanswered" />}
                  <span className="cell-primary">{e.name}</span>
                </span>
                <div className="seg-toggle">
                  <button className={`seg-btn${answers[e.id] === DEDICATED ? " active" : ""}`} onClick={() => setAnswers({ ...answers, [e.id]: DEDICATED })}>Dedicated DPO</button>
                  <button className={`seg-btn${answers[e.id] === COMBINED ? " active" : ""}`} onClick={() => setAnswers({ ...answers, [e.id]: COMBINED })}>Combined</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="onb-actions">
        <button className="btn ghost" onClick={onBack}>Back</button>
        <button className="btn primary" disabled={!allAnswered || pending} onClick={() => onContinue(entities.map((e) => ({ entityId: e.id, governance: answers[e.id] })))}>{pending ? "Saving…" : "Continue"}</button>
      </div>
    </div>
  );
}

// ---- Screen 6 (Structured) — bulk role invite ------------------------------
function guessRole(email: string, roles: RoleView[]): string | null {
  const e = email.toLowerCase();
  const find = (kw: string) => roles.find((r) => r.name.toLowerCase().includes(kw))?.id ?? null;
  if (/support|help|care/.test(e)) return find("support");
  if (/audit|legal|compliance/.test(e)) return find("audit") ?? find("auditor");
  if (/eng|data|dev|ops/.test(e)) return find("engineer");
  return null;
}

function InviteStep({ pending, roles, onBack, onSend }: { pending: boolean; roles: RoleView[]; onBack: () => void; onSend: (invites: InviteDraft[]) => void }) {
  const [invites, setInvites] = useState<InviteDraft[]>([]);
  const [synced, setSynced] = useState(false);
  const [email, setEmail] = useState("");

  const connectSync = (provider: string) => {
    // Mock directory sync: import a few users, pre-map by heuristic (one stays unmapped).
    const imported = ["arjun.rao@example.in", "neha.gupta@example.in", "sam.taylor@example.in"];
    setInvites(imported.map((em) => ({ email: em, roleId: guessRole(em, roles), source: provider })));
    setSynced(true);
  };
  const addManual = () => { const em = email.trim(); if (!em) return; setInvites([...invites, { email: em, roleId: guessRole(em, roles), source: "manual" }]); setEmail(""); };
  const onCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    f.text().then((t) => {
      const ems = t.split(/\r?\n/).map((l) => l.split(",")[0].trim()).filter((s) => s.includes("@"));
      setInvites((prev) => [...prev, ...ems.map((em) => ({ email: em, roleId: guessRole(em, roles), source: "csv" }))]);
    });
    e.target.value = "";
  };

  const unmapped = invites.filter((i) => !i.roleId).length;
  const canSend = invites.length > 0 && unmapped === 0;

  return (
    <div className="onb-card">
      <h2 className="onb-title">Invite your team</h2>
      <p className="cell-sub" style={{ marginTop: 0 }}>Each invite becomes a role assignment with a baseline snapshot and provisioning — the same as a single assignment. No one is auto-given a broad role.</p>

      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button className="btn" disabled={pending} onClick={() => connectSync("directory_sync")}><Users size={14} /> Connect Azure AD / Okta</button>
        <label className="btn sm"><Upload size={13} /> Import CSV<input type="file" accept=".csv,text/csv" hidden onChange={onCsv} /></label>
        {synced && <span className="cell-sub" style={{ alignSelf: "center" }}>Directory synced — roles pre-mapped by title where confident.</span>}
      </div>

      <div className="row" style={{ gap: 6, marginBottom: 12 }}>
        <input className="input" placeholder="teammate@example.in" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addManual(); } }} />
        <button className="btn sm" disabled={!email.trim()} onClick={addManual}><Plus size={13} /> Add</button>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        {invites.map((inv, i) => {
          const role = roles.find((r) => r.id === inv.roleId) ?? null;
          return (
            <div key={i} className={`onb-invite-row${!inv.roleId ? " unmapped" : ""}`}>
              <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                <span className="cell-primary">{inv.email}</span>
                {role ? <span className="cell-sub">{summarise(role.capabilityIds)}</span>
                  : <span className="warn-chip"><AlertTriangle size={11} /> No role mapped — select one</span>}
              </div>
              <div className="row" style={{ gap: 6, alignItems: "center" }}>
                <select className="input sm" value={inv.roleId ?? ""} onChange={(e) => setInvites(invites.map((x, j) => j === i ? { ...x, roleId: e.target.value || null } : x))} style={{ width: 190 }}>
                  <option value="">— select a role —</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <button className="icon-btn xs" aria-label="Remove" onClick={() => setInvites(invites.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
              </div>
            </div>
          );
        })}
        {invites.length === 0 && <div className="empty" style={{ padding: 20 }}>No invitees yet. Connect your directory, import a CSV, or add emails above.</div>}
      </div>

      <div className="onb-actions">
        <button className="btn ghost" onClick={onBack}>Back</button>
        <span className="row" style={{ gap: 10, alignItems: "center" }}>
          {unmapped > 0 && <span className="cell-sub" style={{ color: "var(--red)" }}>{unmapped} invitee{unmapped === 1 ? "" : "s"} need a role</span>}
          <button className="btn primary" disabled={!canSend || pending} onClick={() => onSend(invites)}>{pending ? "Sending…" : `Send ${invites.length || ""} invite${invites.length === 1 ? "" : "s"}`}</button>
        </span>
      </div>
    </div>
  );
}
