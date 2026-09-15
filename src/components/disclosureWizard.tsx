"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2 } from "lucide-react";
import { Notice, Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { submitDisclosureAction, type DocInput } from "@/app/actions/subProcessor";
import { DATA_CATEGORIES, DATA_CATEGORY_LABEL } from "@/lib/domain";
import type { ActionResult } from "@/app/actions/requests";

const STEP_NAMES = ["Identify", "Register", "Documents", "Review"];
const DOC_TYPES = [
  { value: "certification", label: "Certification" },
  { value: "dpa", label: "DPA" },
  { value: "security", label: "Security attestation" },
  { value: "other", label: "Other" },
];

/**
 * SCREEN 3.2 — Sub-Processor Disclosure Flow (Data Processor-side). Four steps,
 * reusing the wizard's circular stepper. Compliance documentation is required to
 * advance to Review, and submitting lands the engagement in "Held pending
 * approval" — a real block. There is no "activate anyway" affordance anywhere
 * on this side; only a Legal/DPO approval can move it forward.
 */
export function DisclosureWizard({ vendors }: { vendors: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [step, setStep] = useState(1);

  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? "");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState("");
  const [pii, setPii] = useState<string[]>([]);
  const [docs, setDocs] = useState<DocInput[]>([]);
  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState("certification");
  const [docExpiry, setDocExpiry] = useState("");

  const togglePii = (c: string) => setPii((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  const addDoc = () => { if (!docName.trim()) return; setDocs((d) => [...d, { name: docName.trim(), docType, expiresAt: docExpiry || null }]); setDocName(""); setDocExpiry(""); };

  const canStep1 = Boolean(vendorId && name.trim());
  const canStep2 = Boolean(scope.trim() && pii.length);
  const canStep3 = docs.length > 0;

  const submit = () =>
    start(async () => {
      const r = await submitDisclosureAction(vendorId, { subProcessorName: name, reason, scope, piiTypes: pii }, docs);
      setResult(r);
      if (r.ok) router.push("/vendor-risk/sub-processor-disclosures");
    });

  return (
    <div style={{ maxWidth: 680 }}>
      <ol className="wiz-steps">
        {STEP_NAMES.map((s, i) => {
          const n = i + 1; const status = n < step ? "done" : n === step ? "current" : "future";
          return <li key={s} className={`wiz-step ${status}`}><span className="wiz-dot">{status === "done" ? <Check size={14} /> : n}</span><span className="wiz-step-name">{s}</span></li>;
        })}
      </ol>

      <div className="card"><div className="card-body">
        {step === 1 && (
          <>
            <div className="section-label" style={{ marginTop: 0 }}>Identify the need</div>
            <p className="cell-sub" style={{ marginTop: 0 }}>Requesting a new sub-processor engagement starts the disclosure chain — it is not something to skip past.</p>
            <label className="field"><span className="field-label">Primary vendor (you)</span>
              <select className="input" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
            </label>
            <label className="field" style={{ marginTop: 10 }}><span className="field-label">Sub-processor name</span>
              <input className="input" placeholder="e.g. CreditCheck Analytics" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field" style={{ marginTop: 10 }}><span className="field-label">Reason (one line)</span>
              <input className="input" placeholder="Why is this engagement needed?" value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <div className="wiz-actions"><span /><button className="btn primary" disabled={!canStep1} onClick={() => setStep(2)}>Next</button></div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="section-label" style={{ marginTop: 0 }}>Register the disclosure</div>
            <label className="field"><span className="field-label">What will they do? (scope)</span>
              <textarea className="input" style={{ minHeight: 72 }} value={scope} onChange={(e) => setScope(e.target.value)} placeholder="e.g. Credit scoring against applicant financial data" />
            </label>
            <div className="field" style={{ marginTop: 10 }}><span className="field-label">What data / PII will they touch?</span>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {DATA_CATEGORIES.map((c) => <button key={c} className={`btn xs ${pii.includes(c) ? "primary" : "ghost"}`} onClick={() => togglePii(c)}>{DATA_CATEGORY_LABEL[c]}</button>)}
              </div>
            </div>
            <div className="wiz-actions"><button className="btn ghost" onClick={() => setStep(1)}>Back</button><button className="btn primary" disabled={!canStep2} onClick={() => setStep(3)}>Next</button></div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="section-label" style={{ marginTop: 0 }}>Attach compliance documentation</div>
            <p className="cell-sub" style={{ marginTop: 0 }}>At least one document is required — the Fiduciary needs something real to review before approving.</p>
            <div className="row" style={{ gap: 6, alignItems: "flex-end" }}>
              <input className="input sm" placeholder="Document name" value={docName} onChange={(e) => setDocName(e.target.value)} style={{ flex: 1 }} />
              <select className="input sm" value={docType} onChange={(e) => setDocType(e.target.value)}>{DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
              <input className="input sm" type="date" value={docExpiry} onChange={(e) => setDocExpiry(e.target.value)} title="Expiry (optional)" />
              <button className="btn sm" onClick={addDoc}><Plus size={13} /> Add</button>
            </div>
            <div className="stack" style={{ gap: 6, marginTop: 10 }}>
              {docs.map((doc, i) => (
                <div key={i} className="row" style={{ justifyContent: "space-between", padding: "6px 8px", border: "1px solid var(--border-soft)", borderRadius: "var(--radius)" }}>
                  <span>{doc.name} <span className="cell-sub">· {doc.docType}{doc.expiresAt ? ` · expires ${doc.expiresAt}` : ""}</span></span>
                  <button className="icon-btn" onClick={() => setDocs((d) => d.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={14} /></button>
                </div>
              ))}
              {docs.length === 0 && <span className="cell-sub">No documents yet.</span>}
            </div>
            <div className="wiz-actions"><button className="btn ghost" onClick={() => setStep(2)}>Back</button><button className="btn primary" disabled={!canStep3} title={!canStep3 ? "Attach at least one document" : undefined} onClick={() => setStep(4)}>Next</button></div>
          </>
        )}

        {step === 4 && (
          <>
            <div className="section-label" style={{ marginTop: 0 }}>Review &amp; submit</div>
            <dl className="kv">
              <div style={{ display: "contents" }}><dt>Primary vendor</dt><dd>{vendors.find((v) => v.id === vendorId)?.name}</dd></div>
              <div style={{ display: "contents" }}><dt>Sub-processor</dt><dd>{name}</dd></div>
              <div style={{ display: "contents" }}><dt>Scope</dt><dd>{scope}</dd></div>
              <div style={{ display: "contents" }}><dt>PII types</dt><dd style={{ textTransform: "capitalize" }}>{pii.map((c) => DATA_CATEGORY_LABEL[c as keyof typeof DATA_CATEGORY_LABEL]).join(", ")}</dd></div>
              <div style={{ display: "contents" }}><dt>Documents</dt><dd>{docs.length}</dd></div>
            </dl>
            <div style={{ margin: "10px 0" }}>
              <Notice tone="warn" title="Submitting places this engagement on hold">
                Status becomes <Pill tone="yellow">Held pending approval</Pill>. No data may flow to the sub-processor until Legal or the DPO approves — there is no way to activate it from your side.
              </Notice>
            </div>
            <div className="wiz-actions">
              <button className="btn ghost" onClick={() => setStep(3)}>Back</button>
              <button className="btn primary" disabled={pending} onClick={submit}>{pending ? "Submitting…" : "Submit for approval"}</button>
            </div>
            <ActionError result={result} />
          </>
        )}
      </div></div>
    </div>
  );
}
