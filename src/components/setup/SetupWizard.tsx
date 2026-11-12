"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, X, Plus, ArrowRight, ShieldCheck, HelpCircle } from "lucide-react";

/**
 * Setup wizard (comp rebuild) — the three-step foundation flow: legal entities,
 * who answers for each entity, and the admin's role & review. Demo flow with
 * fixtures; Finish lands on the Overview dashboard.
 */
const STEPS = ["Legal entities", "Who answers", "Your role & review"] as const;

const ENTITIES = [
  { name: "Meridian Financial Services Ltd.", rel: "Parent", sector: "Financial services", sdf: "Yes", role: "Notified Significant Data Fiduciary", badge: true, owner: "Kavita Menon", email: "kavita.menon@meridian.in" },
  { name: "Meridian Home Finance Ltd.", rel: "Subsidiary", sector: "Housing finance", sdf: "No", role: "Data Fiduciary", badge: false, owner: "Sanjay Iyer", email: "sanjay.iyer@meridian.in" },
];

export function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  return (
    <div className="wz">
      <header className="wz-top">
        <div className="wz-top-left">
          <span className="lg-logo" style={{ width: 38, height: 38, fontSize: 15 }}>mO</span>
          <span className="wz-top-brand"><strong>miniOrange</strong><span>DATA PRIVACY</span></span>
          <span className="wz-top-sep" />
          <span className="wz-top-title">Set up Meridian Financial Services</span>
        </div>
        <div className="wz-top-right">
          <span className="cell-sub">Step {step} of 3</span>
          <Link href="/home" className="wz-exit">Save and exit</Link>
          <span className="ov-user-ic sm">RN</span>
        </div>
      </header>

      <div className="wz-stepper">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const active = n === step;
          return (
            <div key={label} className="wz-step-wrap">
              <span className={`wz-step${active ? " active" : ""}${done ? " done" : ""}`}>
                <span className="wz-step-num">{done ? <Check size={15} strokeWidth={3} /> : String(n).padStart(2, "0")}</span>
                <span className="wz-step-label">{label}</span>
              </span>
              {n < 3 && <span className="wz-step-line" />}
            </div>
          );
        })}
      </div>

      <div className="wz-card">
        {step === 1 && <StepEntities />}
        {step === 2 && <StepOwners />}
        {step === 3 && <StepReview />}

        <div className="wz-card-foot">
          <div className="wz-foot-left">
            {step > 1 && <button className="wz-back" onClick={() => setStep((s) => s - 1)}>Back</button>}
            <span className="cell-sub">{step === 2 ? "Saved just now · Invites send on Continue" : "Saved just now"}</span>
          </div>
          {step < 3 ? (
            <button className="ov-btn-primary" onClick={() => setStep((s) => s + 1)}>
              {step === 2 ? "Send invites and continue" : "Continue"} <ArrowRight size={16} />
            </button>
          ) : (
            <button className="ov-btn-primary" onClick={() => router.push("/home")}>Finish and go to dashboard <ArrowRight size={16} /></button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepEntities() {
  return (
    <div className="wz-body">
      <p className="ov-kicker">Foundation · 1 of 3</p>
      <h1 className="wz-title">Which legal entities will you manage here?</h1>
      <p className="wz-sub">Each Data Fiduciary is separately accountable. Add the entities whose privacy operations belong in this workspace.</p>

      <div className="wz-table">
        <div className="wz-tr wz-th"><span>Legal name</span><span>Relationship</span><span>Sector</span><span>Notified as SDF?</span><span /></div>
        {ENTITIES.map((e) => (
          <div key={e.name} className="wz-tr">
            <span className="wz-strong">{e.name}</span>
            <span className="wz-select">{e.rel} <ChevronDown size={15} /></span>
            <span>{e.sector}</span>
            <span className="wz-select">{e.sdf} <ChevronDown size={15} /></span>
            <span className="wz-del"><X size={15} /></span>
          </div>
        ))}
        <button className="wz-add"><Plus size={16} /> Add another legal entity</button>
      </div>

      <p className="wz-hint"><HelpCircle size={15} /> A parent must be listed before its subsidiaries so governance can be assigned correctly.</p>
    </div>
  );
}

function StepOwners() {
  return (
    <div className="wz-body">
      <p className="ov-kicker">Foundation · 2 of 3</p>
      <h1 className="wz-title">Who answers for each entity’s personal data?</h1>
      <p className="wz-sub">Choose the accountable privacy owner. Invitations are sent only after you continue.</p>

      <label className="wz-sameowner"><input type="checkbox" /> Use the same owner for all entities</label>

      <div className="stack" style={{ gap: 20 }}>
        {ENTITIES.map((e) => (
          <div key={e.name} className="wz-owner">
            <div className="wz-owner-head">
              <span className="wz-owner-ic">M</span>
              <span className="stack" style={{ gap: 1, flex: 1 }}><strong>{e.name}</strong><span className="cell-sub">{e.role}</span></span>
              {e.badge && <span className="wz-sdf">SDF</span>}
            </div>
            <div className="wz-radios">
              <label className="wz-radio on"><span className="wz-dot on" /><span className="stack" style={{ gap: 1 }}><strong>Designated DPO</strong><span className="cell-sub">Independent privacy oversight and statutory contact</span></span></label>
              <label className={`wz-radio${e.badge ? " disabled" : ""}`}><span className="wz-dot" /><span className="stack" style={{ gap: 1 }}><strong>Contact person</strong><span className="cell-sub">{e.badge ? "Unavailable because this entity is notified as an SDF" : "A named contact for non-SDF entities"}</span></span></label>
            </div>
            <div className="wz-fields">
              <label className="wz-field"><span className="wz-flabel">Full name</span><input defaultValue={e.owner} /></label>
              <label className="wz-field"><span className="wz-flabel">Work email</span><input defaultValue={e.email} /></label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepReview() {
  const can = ["Connect systems and validate health", "Invite users from approved role templates", "Execute rights requests across systems", "Implement DPO-approved policy", "Export immutable evidence"];
  const cant = ["Approve purposes, notices or retention", "Edit or delete audit entries", "Override completion or delivery status"];
  return (
    <div className="wz-body">
      <p className="ov-kicker">Foundation · 3 of 3</p>
      <h1 className="wz-title">Here’s what you can do, and who decides the rest</h1>
      <p className="wz-sub">Review your execution authority and the governance owners before entering the workspace.</p>

      <div className="wz-review">
        <div className="wz-auth">
          <div className="wz-auth-head"><span className="ov-user-ic sm">RN</span><span className="stack" style={{ gap: 1 }}><strong>Ritu Nair</strong><span className="cell-sub">Administrator · Technical execution</span></span></div>
          <p className="wz-auth-label">You can</p>
          <ul className="wz-can">{can.map((c) => <li key={c}><Check size={16} className="wz-can-ic" /> {c}</li>)}</ul>
          <p className="wz-auth-label">You can’t</p>
          <ul className="wz-cant">{cant.map((c) => <li key={c}><ShieldCheck size={15} className="wz-cant-ic" /> <span>{c}</span> <span className="wz-setby">Set by DPO</span></li>)}</ul>
        </div>

        <div className="stack" style={{ gap: 14 }}>
          <div className="wz-gov">
            <div className="wz-gov-head"><span className="ov-nav-label" style={{ padding: 0 }}>Governance summary</span><span className="cell-sub">2 entities</span></div>
            {ENTITIES.map((e) => (
              <div key={e.name} className="wz-gov-row">
                <span className="ov-user-ic sm">{e.owner.split(" ").map((w) => w[0]).join("")}</span>
                <span className="stack" style={{ gap: 1, flex: 1 }}><strong>{e.name}</strong><span className="cell-sub">{e.owner} (DPO) · Invite sent</span></span>
                <button className="ov-link sm">Edit</button>
              </div>
            ))}
          </div>
          <div className="wz-note"><ShieldCheck size={17} className="ov-entity-ic" /><span className="stack" style={{ gap: 2 }}><strong>Governance stays separate from execution</strong><span className="cell-sub">Legal decisions route to the accountable DPO with their context attached.</span></span></div>
        </div>
      </div>
    </div>
  );
}
