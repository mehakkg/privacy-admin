"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { assignQuestionnaireAction } from "@/app/actions/assessments";
import { ASSESSMENT_TEMPLATES, baselineForCategory, RISKS, type Risk } from "@/lib/tprm";
import type { ActionResult } from "@/app/actions/requests";

interface VendorOpt { id: string; name: string; category: string; baseline: string }
const RISK_TONE: Record<string, "gray" | "yellow" | "orange" | "red"> = { low: "gray", medium: "yellow", high: "orange", critical: "red" };

/**
 * SCREEN 2.2 — Assign Questionnaire. A full-page wizard (platform convention:
 * multi-step flows are full-page). Baseline is a pre-filled, editable suggestion
 * by category — Legal isn't assessing from zero — but it never becomes the final
 * rating; that is set on the review screen after the vendor responds.
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
  const effectiveCategory = mode === "existing" ? (chosenVendor?.category ?? "") : category;
  const suggested = useMemo<Risk>(
    () => (mode === "existing" && chosenVendor ? (chosenVendor.baseline as Risk) : baselineForCategory(category || "")),
    [mode, chosenVendor, category],
  );

  const goToBaseline = () => { setBaseline(suggested); setStep(2); };
  const recommendedTemplates = ASSESSMENT_TEMPLATES.filter((t) => t.forTiers.includes(baseline));

  const canStep1 = mode === "existing" ? Boolean(vendorId) : Boolean(newName.trim() && category.trim());

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

  return (
    <div style={{ maxWidth: 640 }}>
      <nav className="stepper" style={{ marginBottom: 16 }}>
        {["Vendor", "Baseline", "Template", "Review"].map((s, i) => (
          <span key={s} className={`step${step === i + 1 ? " active" : ""}${step > i + 1 ? " done" : ""}`}><span className="step-label">{i + 1}. {s}</span></span>
        ))}
      </nav>

      {step === 1 && (
        <div className="card"><div className="card-body">
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
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" disabled={!canStep1} onClick={goToBaseline}>Next</button>
          </div>
        </div></div>
      )}

      {step === 2 && (
        <div className="card"><div className="card-body">
          <div className="section-label" style={{ marginTop: 0 }}>Baseline risk rating</div>
          <p className="cell-sub" style={{ marginTop: 0 }}>
            <strong style={{ textTransform: "capitalize" }}>{effectiveCategory || "Uncategorized"}</strong> — suggested baseline:{" "}
            <Pill tone={RISK_TONE[suggested]}>{suggested}</Pill>. This sets the questionnaire&rsquo;s rigor; it is not the final rating.
          </p>
          <div className="row" style={{ gap: 6 }}>
            {RISKS.map((r) => <button key={r} className={`btn sm ${baseline === r ? "primary" : "ghost"}`} onClick={() => setBaseline(r)}>{r}</button>)}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button className="btn ghost" onClick={() => setStep(1)}>Back</button>
            <button className="btn primary" onClick={() => { setTemplateName(recommendedTemplates[0]?.name ?? ""); setStep(3); }}>Next</button>
          </div>
        </div></div>
      )}

      {step === 3 && (
        <div className="card"><div className="card-body">
          <div className="section-label" style={{ marginTop: 0 }}>Questionnaire template</div>
          <p className="cell-sub" style={{ marginTop: 0 }}>Scoped to a <Pill tone={RISK_TONE[baseline]}>{baseline}</Pill> baseline.</p>
          <div className="stack" style={{ gap: 6 }}>
            {ASSESSMENT_TEMPLATES.map((t) => (
              <button key={t.id} className={`pick-item${templateName === t.name ? " on" : ""}`} onClick={() => setTemplateName(t.name)}>
                <span className="cell-primary">{t.name}{t.forTiers.includes(baseline) ? "" : " (out of tier)"}</span>
                <span className="cell-sub">{t.description}</span>
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button className="btn ghost" onClick={() => setStep(2)}>Back</button>
            <button className="btn primary" disabled={!templateName} onClick={() => setStep(4)}>Next</button>
          </div>
        </div></div>
      )}

      {step === 4 && (
        <div className="card"><div className="card-body">
          <div className="section-label" style={{ marginTop: 0 }}>Review &amp; send</div>
          <dl className="kv">
            <div style={{ display: "contents" }}><dt>Vendor</dt><dd>{mode === "existing" ? chosenVendor?.name : `${newName} (new)`}</dd></div>
            <div style={{ display: "contents" }}><dt>Category</dt><dd>{effectiveCategory || "Uncategorized"}</dd></div>
            <div style={{ display: "contents" }}><dt>Baseline</dt><dd><Pill tone={RISK_TONE[baseline]}>{baseline}</Pill></dd></div>
            <div style={{ display: "contents" }}><dt>Template</dt><dd>{templateName}</dd></div>
          </dl>
          <p className="cell-sub">The assignment is tracked in the queue with an age indicator until the vendor responds.</p>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn ghost" onClick={() => setStep(3)}>Back</button>
            <button className="btn primary" disabled={pending} onClick={submit}>{pending ? "Assigning…" : "Assign & send"}</button>
          </div>
          <ActionError result={result} />
        </div></div>
      )}
    </div>
  );
}
