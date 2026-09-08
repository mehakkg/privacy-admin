"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil } from "lucide-react";
import { Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { assignQuestionnaireAction } from "@/app/actions/assessments";
import { ASSESSMENT_TEMPLATES, baselineForCategory, RISKS, type Risk } from "@/lib/tprm";
import type { ActionResult } from "@/app/actions/requests";

interface VendorOpt { id: string; name: string; category: string; baseline: string }
const RISK_TONE: Record<string, "gray" | "yellow" | "orange" | "red"> = { low: "gray", medium: "yellow", high: "orange", critical: "red" };
const STEP_NAMES = ["Vendor", "Baseline", "Template", "Review"];

/**
 * SCREEN 2.2 — Assign Questionnaire. Full-page, two-column: the active step's
 * form on the left, a persistent Assignment Summary on the right that fills in
 * as you go, so context from earlier steps is never lost. Baseline is a pre-
 * filled, editable suggestion by category — never the final rating.
 */
export function AssignWizard({ vendors }: { vendors: VendorOpt[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [step, setStep] = useState(1);

  const [mode, setMode] = useState<"existing" | "new">(vendors.length ? "existing" : "new");
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [category, setCategory] = useState("");
  const [baseline, setBaseline] = useState<Risk>("medium");
  const [templateName, setTemplateName] = useState("");

  const chosenVendor = vendors.find((v) => v.id === vendorId);
  const vendorLabel = mode === "existing" ? (chosenVendor?.name ?? "") : newName.trim();
  const effectiveCategory = mode === "existing" ? (chosenVendor?.category ?? "") : category.trim();
  const suggested = useMemo<Risk>(
    () => (mode === "existing" && chosenVendor ? (chosenVendor.baseline as Risk) : baselineForCategory(category || "")),
    [mode, chosenVendor, category],
  );

  const canStep1 = mode === "existing" ? Boolean(vendorId) : Boolean(newName.trim() && category.trim());
  const recommendedTemplates = ASSESSMENT_TEMPLATES.filter((t) => t.forTiers.includes(baseline));

  const submit = () =>
    start(async () => {
      const r = await assignQuestionnaireAction({
        vendorId: mode === "existing" ? vendorId : null,
        newVendorName: mode === "new" ? newName : null,
        category: mode === "new" ? category : null,
        baselineRating: baseline,
        templateName,
      });
      setResult(r);
      if (r.ok) router.push("/vendor-risk/assessments");
    });

  // A summary row: shown once its step is behind us; Edit jumps back without losing later progress.
  const summaryRow = (label: string, value: ReactNode, filled: boolean, jumpTo: number) => (
    <div className="asum-row">
      <span className="asum-label">{label}</span>
      {filled ? (
        <span className="asum-value">
          <Check size={13} className="asum-check" /> <span>{value}</span>
          <button className="asum-edit" onClick={() => setStep(jumpTo)}><Pencil size={11} /> Edit</button>
        </span>
      ) : (
        <span className="asum-value muted">—</span>
      )}
    </div>
  );

  return (
    <div className="wiz-grid">
      <div className="wiz-main">
        {/* Circular numbered stepper */}
        <ol className="wiz-steps">
          {STEP_NAMES.map((name, i) => {
            const n = i + 1;
            const status = n < step ? "done" : n === step ? "current" : "future";
            return (
              <li key={name} className={`wiz-step ${status}`}>
                <span className="wiz-dot">{status === "done" ? <Check size={14} /> : n}</span>
                <span className="wiz-step-name">{name}</span>
              </li>
            );
          })}
        </ol>

        <div className="card"><div className="card-body">
          {step === 1 && (
            <>
              <div className="section-label" style={{ marginTop: 0 }}>Which vendor?</div>
              <div className="row" style={{ gap: 6, marginBottom: 10 }}>
                <button className={`btn sm ${mode === "existing" ? "primary" : "ghost"}`} disabled={vendors.length === 0} onClick={() => setMode("existing")}>Existing vendor</button>
                <button className={`btn sm ${mode === "new" ? "primary" : "ghost"}`} onClick={() => setMode("new")}>New vendor</button>
              </div>
              {mode === "existing" ? (
                <select className="input" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name} — {v.category}</option>)}
                </select>
              ) : (
                <div className="stack" style={{ gap: 8 }}>
                  <input className="input" placeholder="Vendor name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <input className="input" placeholder="Category (e.g. Payment Processor)" value={category} onChange={(e) => setCategory(e.target.value)} />
                </div>
              )}
              <div className="wiz-actions">
                <button className="btn primary" disabled={!canStep1} onClick={() => { setBaseline(suggested); setStep(2); }}>Next</button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="section-label" style={{ marginTop: 0 }}>Baseline risk rating</div>
              <p className="cell-sub" style={{ marginTop: 0 }}>
                <strong>{effectiveCategory || "Uncategorized"}</strong> — suggested baseline <Pill tone={RISK_TONE[suggested]}>{suggested}</Pill>. Sets the questionnaire&rsquo;s rigor; not the final rating.
              </p>
              <div className="row" style={{ gap: 6 }}>
                {RISKS.map((r) => <button key={r} className={`btn sm ${baseline === r ? "primary" : "ghost"}`} onClick={() => setBaseline(r)}>{r}</button>)}
              </div>
              <div className="wiz-actions">
                <button className="btn ghost" onClick={() => setStep(1)}>Back</button>
                <button className="btn primary" onClick={() => { if (!templateName) setTemplateName(recommendedTemplates[0]?.name ?? ""); setStep(3); }}>Next</button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="section-label" style={{ marginTop: 0 }}>Questionnaire template</div>
              <p className="cell-sub" style={{ marginTop: 0 }}>Scoped to a <Pill tone={RISK_TONE[baseline]}>{baseline}</Pill> baseline.</p>
              <div className="stack" style={{ gap: 8 }}>
                {ASSESSMENT_TEMPLATES.map((t) => {
                  const inTier = t.forTiers.includes(baseline);
                  return (
                    <button key={t.id} className={`tpl-card${templateName === t.name ? " on" : ""}${inTier ? "" : " off-tier"}`} onClick={() => setTemplateName(t.name)}>
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                        <span className="cell-primary">{t.name}</span>
                        {inTier ? <span className="tpl-badge">Recommended</span> : null}
                      </div>
                      <span className="cell-sub">{t.description}</span>
                      {!inTier && <span className="tpl-warn">⚠ Out of tier for a {baseline} baseline — heavier or lighter than needed.</span>}
                    </button>
                  );
                })}
              </div>
              <div className="wiz-actions">
                <button className="btn ghost" onClick={() => setStep(2)}>Back</button>
                <button className="btn primary" disabled={!templateName} onClick={() => setStep(4)}>Next</button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="section-label" style={{ marginTop: 0 }}>Review &amp; send</div>
              <p className="cell-sub" style={{ marginTop: 0 }}>Everything below is captured in the summary. Sending assigns the questionnaire and notifies the vendor.</p>
              <div className="wiz-actions">
                <button className="btn ghost" onClick={() => setStep(3)}>Back</button>
                <div className="stack" style={{ gap: 4 }}>
                  <button className="btn primary" disabled={pending} onClick={submit}>{pending ? "Assigning…" : "Assign & send"}</button>
                  <span className="cell-sub" style={{ fontSize: 11 }}>The vendor will be notified immediately.</span>
                </div>
              </div>
              <ActionError result={result} />
            </>
          )}
        </div></div>
      </div>

      {/* Persistent Assignment Summary */}
      <aside className="assign-summary">
        <div className="asum-head">Assignment summary</div>
        {summaryRow("Vendor", vendorLabel + (mode === "new" && vendorLabel ? " (new)" : ""), step > 1 && Boolean(vendorLabel), 1)}
        {summaryRow("Category", effectiveCategory || "Uncategorized", step > 1 && Boolean(vendorLabel), 1)}
        {summaryRow("Baseline", <Pill tone={RISK_TONE[baseline]} dot={false}>{baseline}</Pill>, step > 2, 2)}
        {summaryRow("Template", templateName, step > 3 && Boolean(templateName), 3)}
      </aside>
    </div>
  );
}
