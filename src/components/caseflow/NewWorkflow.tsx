"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FilePlus, LayoutTemplate, Copy, Check, Lock, ArrowRight } from "lucide-react";

type Start = "blank" | "template" | "clone";

interface Template {
  id: string; name: string; domain: string; prefix: string;
  trigger: string; legalBasis: string; deadline: number; roles: string[];
}
const TEMPLATES: Template[] = [
  { id: "t-erasure", name: "Erasure request — end to end", domain: "Rights Requests", prefix: "DR", trigger: "Data principal asks to erase their personal data", legalBasis: "DPDP Rule 13 — rights request fulfilment", deadline: 30, roles: ["Data Principal", "Admin", "Data Processor"] },
  { id: "t-access", name: "Access / copy of data", domain: "Rights Requests", prefix: "DR", trigger: "Data principal requests a copy of their data", legalBasis: "DPDP §11 — right to access", deadline: 30, roles: ["Data Principal", "Admin"] },
  { id: "t-correction", name: "Correction request", domain: "Rights Requests", prefix: "DR", trigger: "Data principal asks to correct inaccurate data", legalBasis: "DPDP §12 — right to correction", deadline: 30, roles: ["Data Principal", "Admin"] },
  { id: "t-grievance", name: "Grievance intake → resolution", domain: "Grievance", prefix: "GR", trigger: "Data principal raises a grievance", legalBasis: "DPDP §13 — grievance redressal", deadline: 90, roles: ["Data Principal", "Admin", "DPO"] },
  { id: "t-breach", name: "Breach notification", domain: "Breaches", prefix: "BR", trigger: "A personal-data breach is detected", legalBasis: "DPDP §8(6) — breach intimation", deadline: 3, roles: ["Admin", "DPO", "CISO"] },
  { id: "t-consent", name: "Consent withdrawal", domain: "Consent", prefix: "CN", trigger: "Data principal withdraws consent for a purpose", legalBasis: "DPDP §6(4) — withdrawal of consent", deadline: 7, roles: ["Data Principal", "Admin"] },
];

const CLONABLE = [
  { id: "WF-DR-01", name: "Erasure request — end to end", domain: "Rights Requests", prefix: "DR" },
  { id: "WF-DR-07", name: "Correction request", domain: "Rights Requests", prefix: "DR" },
  { id: "WF-GR-01", name: "Grievance intake → resolution", domain: "Grievance", prefix: "GR" },
];

const DOMAINS = [
  { label: "Rights Requests", prefix: "DR" },
  { label: "Grievance", prefix: "GR" },
  { label: "Breaches", prefix: "BR" },
  { label: "Consent", prefix: "CN" },
  { label: "Access changes", prefix: "AC" },
];
const LEGAL_BASES = [
  "DPDP Rule 13 — rights request fulfilment",
  "DPDP §11 — right to access",
  "DPDP §12 — right to correction",
  "DPDP §13 — grievance redressal",
  "DPDP §8(6) — breach intimation",
  "DPDP §6(4) — withdrawal of consent",
  "Other / internal policy",
];
const ALL_ROLES = ["Data Principal", "Admin", "DPO", "CISO", "Legal", "Data Processor"];

export function NewWorkflow() {
  const router = useRouter();
  const seed = TEMPLATES[0]; // start on "Use a template" with the first template applied
  const [start, setStart] = useState<Start>("template");
  const [templateId, setTemplateId] = useState<string>(seed.id);
  const [cloneId, setCloneId] = useState<string>(CLONABLE[0].id);

  const [name, setName] = useState(seed.name);
  const [domain, setDomain] = useState(seed.domain);
  const [entity, setEntity] = useState("Meridian Financial Services");
  const [trigger, setTrigger] = useState(seed.trigger);
  const [legalBasis, setLegalBasis] = useState(seed.legalBasis);
  const [deadline, setDeadline] = useState<number | "">(seed.deadline);
  const [roles, setRoles] = useState<string[]>(seed.roles);

  // apply a template / clone's defaults into the form
  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setName(t.name); setDomain(t.domain); setTrigger(t.trigger);
    setLegalBasis(t.legalBasis); setDeadline(t.deadline); setRoles(t.roles);
  }
  function applyClone(id: string) {
    setCloneId(id);
    const c = CLONABLE.find((x) => x.id === id);
    if (!c) return;
    setName(`${c.name} (copy)`); setDomain(c.domain);
  }
  function pickStart(s: Start) {
    setStart(s);
    if (s === "blank") { setName(""); setTrigger(""); setRoles(["Data Principal", "Admin"]); setDeadline(30); setLegalBasis(LEGAL_BASES[0]); }
    if (s === "template") applyTemplate(templateId);
    if (s === "clone") applyClone(cloneId);
  }

  const prefix = useMemo(() => DOMAINS.find((d) => d.label === domain)?.prefix ?? "WF", [domain]);
  const idPreview = `WF-${prefix}-09`; // next free number in this domain (demo)

  const canCreate = name.trim().length > 2 && roles.length > 0 && deadline !== "" && Number(deadline) > 0;

  const toggleRole = (r: string) => setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));

  return (
    <div className="stack" style={{ gap: 18, maxWidth: 920 }}>
      <Link href="/workflows" className="row-link" style={{ display: "inline-flex", width: "fit-content" }}><ArrowLeft size={14} /> Workflow Library</Link>

      <div className="stack" style={{ gap: 4 }}>
        <p className="dh-kicker">Configure</p>
        <h1 className="inv-title">New workflow</h1>
        <p className="cell-sub" style={{ margin: 0 }}>Define the journey’s governance frame here. You’ll add steps, owners and deadlines in the Journey Editor — this creates it as a <strong>draft</strong> that needs DPO approval before it goes live.</p>
      </div>

      {/* 1 — Start from */}
      <section className="stack" style={{ gap: 10 }}>
        <h3 className="cm-sec-h"><span className="cm-sec-n">1</span> Start from</h3>
        <div className="cm-start-grid">
          <button className={`cm-start${start === "blank" ? " on" : ""}`} onClick={() => pickStart("blank")}>
            <span className="cm-start-ic"><FilePlus size={18} /></span>
            <strong>Blank journey</strong>
            <span className="cell-sub">Build every step yourself from scratch.</span>
          </button>
          <button className={`cm-start${start === "template" ? " on" : ""}`} onClick={() => pickStart("template")}>
            <span className="cm-start-ic"><LayoutTemplate size={18} /></span>
            <strong>Use a DPDP template</strong>
            <span className="cell-sub">Pre-built steps, roles and legal clock.</span>
          </button>
          <button className={`cm-start${start === "clone" ? " on" : ""}`} onClick={() => pickStart("clone")}>
            <span className="cm-start-ic"><Copy size={18} /></span>
            <strong>Clone an existing one</strong>
            <span className="cell-sub">Copy a live journey and adjust it.</span>
          </button>
        </div>

        {start === "template" && (
          <div className="cm-pick stack" style={{ gap: 6 }}>
            <span className="cell-sub">Choose a template</span>
            <div className="cm-pick-grid">
              {TEMPLATES.map((t) => (
                <button key={t.id} className={`cm-pick-item${templateId === t.id ? " on" : ""}`} onClick={() => applyTemplate(t.id)}>
                  <span className="cm-pick-main">
                    <strong>{t.name}</strong>
                    <span className="cell-sub">{t.domain} · {t.deadline}-day ceiling</span>
                  </span>
                  {templateId === t.id && <Check size={15} className="cm-ok" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {start === "clone" && (
          <div className="cm-pick stack" style={{ gap: 6 }}>
            <span className="cell-sub">Choose a journey to clone</span>
            <div className="cm-pick-grid">
              {CLONABLE.map((c) => (
                <button key={c.id} className={`cm-pick-item${cloneId === c.id ? " on" : ""}`} onClick={() => applyClone(c.id)}>
                  <span className="cm-pick-main">
                    <strong>{c.name}</strong>
                    <span className="cell-sub"><span className="cm-id">{c.id}</span> · {c.domain}</span>
                  </span>
                  {cloneId === c.id && <Check size={15} className="cm-ok" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 2 — Details */}
      <section className="stack" style={{ gap: 10 }}>
        <h3 className="cm-sec-h"><span className="cm-sec-n">2</span> Governance details</h3>
        <div className="inv-card cm-field-grid">
          <label className="cm-field cm-col-2">
            <span className="cm-lab">Workflow name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Erasure request — end to end" />
          </label>

          <div className="cm-field">
            <span className="cm-lab">Workflow ID</span>
            <div className="cm-id-preview"><Lock size={12} /> {idPreview} <span className="cell-sub">auto — next free in {domain}</span></div>
          </div>
          <label className="cm-field">
            <span className="cm-lab">Domain</span>
            <select className="input" value={domain} onChange={(e) => setDomain(e.target.value)}>
              {DOMAINS.map((d) => <option key={d.label} value={d.label}>{d.label}</option>)}
            </select>
          </label>

          <label className="cm-field">
            <span className="cm-lab">Fiduciary / entity</span>
            <select className="input" value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option>Meridian Financial Services</option>
              <option>Meridian Insurance</option>
              <option>All group entities</option>
            </select>
          </label>
          <label className="cm-field">
            <span className="cm-lab">Legal deadline ceiling</span>
            <span className="cm-deadline-in">
              <input className="input" type="number" min={1} value={deadline} onChange={(e) => setDeadline(e.target.value === "" ? "" : Number(e.target.value))} />
              <span className="cell-sub">days — the hard legal clock; internal targets must stay under it</span>
            </span>
          </label>

          <label className="cm-field cm-col-2">
            <span className="cm-lab">What triggers this journey</span>
            <input className="input" value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="e.g. Data principal asks to erase their personal data" />
          </label>

          <label className="cm-field cm-col-2">
            <span className="cm-lab">Legal basis</span>
            <select className="input" value={legalBasis} onChange={(e) => setLegalBasis(e.target.value)}>
              {LEGAL_BASES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
        </div>
      </section>

      {/* 3 — Roles */}
      <section className="stack" style={{ gap: 10 }}>
        <h3 className="cm-sec-h"><span className="cm-sec-n">3</span> Roles involved</h3>
        <div className="inv-card stack" style={{ gap: 10 }}>
          <span className="cell-sub">Who takes part in this journey? This seeds the swimlanes and owner pickers in the editor.</span>
          <div className="cm-role-toggles">
            {ALL_ROLES.map((r) => {
              const on = roles.includes(r);
              return (
                <button key={r} className={`cm-role-toggle${on ? " on" : ""}`} onClick={() => toggleRole(r)} aria-pressed={on}>
                  <span className="cm-role-check">{on && <Check size={12} />}</span>{r}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="cm-new-foot">
        <Link href="/workflows" className="btn sec">Cancel</Link>
        <div className="row" style={{ gap: 12, alignItems: "center" }}>
          {!canCreate && <span className="cell-sub">Name the workflow, set a deadline and pick at least one role.</span>}
          <button className="btn primary" disabled={!canCreate} onClick={() => router.push("/workflows/editor")}>
            Create draft &amp; open editor <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
