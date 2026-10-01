"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Search, Check, AlertTriangle, Clock, Plus, CheckCircle2, FolderInput } from "lucide-react";
import { Pill } from "@/components/ui";
import { RuleEditor, defaultParamsFor } from "@/components/masking/RuleEditor";
import { INTENTS, runMaskCore, intentPreview, REVEAL, SENSITIVITIES, type Rule } from "@/lib/masking";
import { planRuleAction, submitRuleAction, checkCollisionAction, createBareFieldAction, getCustomTemplatesAction, createCustomTemplateAction } from "@/app/actions/masking";
import type { PlanRow, SubmitPlanResult } from "@/lib/engines/masking";

export interface CatalogField { code: string; name: string; sensitivity: string; source: string; systemRegulated: boolean; sampleValue: string }

const STEPS = ["Fields", "Behavior", "Tune & preview", "Review & catalog"] as const;

/** SCREEN 2 — Create rule stepper. Fields → Behavior → Tune & preview → Review,
 *  then a Result step. Submit is disabled while any field is blocked. */
export function CreateRuleModal({ catalog, initialSelected, onClose, lockedField, startStep = 0, initialRule, heading }: { catalog: CatalogField[]; initialSelected: string[]; onClose: () => void; lockedField?: string; startStep?: number; initialRule?: Rule; heading?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState(startStep);
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [q, setQ] = useState("");
  const [intent, setIntent] = useState<string | null>(initialRule?.family ?? null);
  const [rule, setRule] = useState<Rule | null>(initialRule ?? null);
  const [reason, setReason] = useState("");
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [result, setResult] = useState<SubmitPlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<CatalogField[]>(catalog);
  // Custom-template placement (optional): "" = standalone, a key, or create new.
  const [templates, setTemplates] = useState<{ key: string; name: string }[]>([]);
  const [placement, setPlacement] = useState<string>("");
  const [newTplName, setNewTplName] = useState("");
  const [tplBusy, setTplBusy] = useState(false);
  const [tplErr, setTplErr] = useState<string | null>(null);
  useEffect(() => { getCustomTemplatesAction().then(({ templates }) => setTemplates(templates.map((t) => ({ key: t.key, name: t.name })))); }, []);

  const selectedFields = cat.filter((f) => selected.includes(f.code));
  const anySensitive = selectedFields.some((f) => f.sensitivity === "Sensitive" || f.systemRegulated);
  const intents = INTENTS.filter((i) => !i.onlyChannel && !(i.sensitiveHidden && anySensitive));

  // Load the per-field plan when entering Review.
  useEffect(() => {
    if (step === 3 && rule) {
      start(async () => { const { plan } = await planRuleAction(rule.family, rule.params, selected); setPlan(plan); });
    }
  }, [step, rule, selected]);

  const blocked = plan.filter((p) => p.outcome === "blocked");
  const needApproval = plan.filter((p) => p.outcome === "approval");
  const canNext = step === 0 ? selected.length > 0 : step === 1 ? !!intent : step === 2 ? !!rule : true;
  const canSubmit = step === 3 && blocked.length === 0 && (needApproval.length === 0 || reason.trim().length > 0) && placement !== "__new__" && !pending;

  const pickIntent = (family: string) => { setIntent(family); setRule({ family, params: defaultParamsFor(family) }); };

  const submit = () => start(async () => {
    if (!rule) return;
    const templateKey = placement && placement !== "__new__" ? placement : null;
    const r = await submitRuleAction(rule.family, rule.params, selected, reason, templateKey);
    if (r.ok && r.result) { setResult(r.result); setError(null); router.refresh(); }
    else setError(r.error ?? "Failed.");
  });

  const createTemplate = () => {
    if (!newTplName.trim()) return;
    setTplBusy(true); setTplErr(null);
    createCustomTemplateAction(newTplName.trim(), false).then((r) => {
      setTplBusy(false);
      if (r.ok && r.key) { setTemplates((t) => [...t, { key: r.key!, name: newTplName.trim() }]); setPlacement(r.key); setNewTplName(""); }
      else setTplErr(r.error ?? "Failed to create template.");
    });
  };

  const matches = q.trim() ? cat.filter((f) => f.code.toLowerCase().includes(q.toLowerCase()) || f.name.toLowerCase().includes(q.toLowerCase())) : cat;
  const onFieldCreated = (f: CatalogField) => { setCat((c) => (c.some((x) => x.code === f.code) ? c : [f, ...c])); setSelected((s) => (s.includes(f.code) ? s : [...s, f.code])); };
  const toggle = (code: string) => setSelected((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]));

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal std-modal lg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="std-modal-head">
          <div className="stack" style={{ gap: 6 }}>
            <h3 style={{ margin: 0 }}>{result ? "Rule applied" : heading ?? "Create rule"}</h3>
            {!result && (
              <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                {STEPS.map((s, i) => <Pill key={s} tone={i === step ? "blue" : i < step ? "green" : "gray"} dot={false}>{i + 1}. {s}</Pill>)}
              </div>
            )}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="std-modal-body">
          {result ? (
            <ResultView result={result} onClose={onClose} />
          ) : (
            <>
              {step === 0 && (
                lockedField ? (
                  <div className="stack" style={{ gap: 10 }}>
                    <p className="cell-sub" style={{ margin: 0 }}>This rule applies to a single, pre-locked field.</p>
                    <div className="row" style={{ gap: 8, alignItems: "center", padding: "8px 10px", border: "1px solid var(--border-soft)", borderRadius: 8, background: "var(--bg-selected)" }}>
                      <span className="mono cell-primary" style={{ flex: 1 }}>{selectedFields[0]?.code ?? lockedField} <span className="cell-sub">{selectedFields[0]?.name}</span></span>
                      <Pill tone="gray" dot={false}>{selectedFields[0]?.source}</Pill>
                    </div>
                  </div>
                ) : (
                <div className="stack" style={{ gap: 12 }}>
                  <p className="cell-sub" style={{ margin: 0 }}>Fields this rule will apply to. Each shows its current source.</p>
                  <div className="row" style={{ gap: 6, alignItems: "center" }}>
                    <Search size={14} className="muted" />
                    <input className="input" style={{ flex: 1 }} placeholder="Search the field catalog" value={q} onChange={(e) => setQ(e.target.value)} />
                  </div>
                  <div className="stack" style={{ gap: 2, maxHeight: 260, overflowY: "auto", border: "1px solid var(--border-soft)", borderRadius: 8, padding: 8 }}>
                    {matches.map((f) => (
                      <label key={f.code} className="row" style={{ gap: 8, padding: "4px 2px", alignItems: "center" }}>
                        <input type="checkbox" checked={selected.includes(f.code)} onChange={() => toggle(f.code)} />
                        <span className="mono cell-primary" style={{ flex: 1 }}>{f.code} <span className="cell-sub">{f.name}</span></span>
                        <Pill tone="gray" dot={false}>{f.source}</Pill>
                      </label>
                    ))}
                  </div>
                  <InlineAddField onCreated={onFieldCreated} />
                </div>
                )
              )}

              {step === 1 && (
                <div className="stack" style={{ gap: 12 }}>
                  <p className="cell-sub" style={{ margin: 0 }}>How should these fields be protected?{anySensitive && " (Show in full is hidden — a selected field is sensitive or regulated.)"}</p>
                  <div className="card-grid">
                    {intents.map((i) => {
                      const ex = intentPreview(i.key);
                      return (
                      <button key={i.key} className={`role-card${intent === i.key ? " sel" : ""}`} onClick={() => pickIntent(i.key)} style={{ textAlign: "left" }}>
                        {ex && (
                          <span className="intent-preview" aria-hidden>
                            <span className="ip-before">{ex.before}</span>
                            <span className="ip-arrow">→</span>
                            <span className="ip-after">{ex.after}</span>
                          </span>
                        )}
                        <span className="cell-primary">{i.label}</span>
                        <p className="cell-sub role-card-desc">{i.description}</p>
                      </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 2 && rule && (
                <div className="stack" style={{ gap: 12 }}>
                  {rule.family === REVEAL ? (
                    <p className="cell-sub">Show in full has no parameters — the value is displayed as-is on eligible fields.</p>
                  ) : (
                    <RuleEditor value={rule} onChange={setRule} floor={null} floorName={null} channel={null} sampleValue={selectedFields[0]?.sampleValue ?? ""} />
                  )}
                  <div>
                    <div className="cell-sub" style={{ marginBottom: 4 }}>Live preview per field</div>
                    <div className="table-wrap"><table className="dtable compact"><tbody>
                      {selectedFields.map((f) => (
                        <tr key={f.code}><td className="mono">{f.code}</td><td className="mono cell-sub">{f.sampleValue}</td><td className="muted">→</td><td className="mono">{runMaskCore(rule, f.sampleValue) || "(removed)"}</td></tr>
                      ))}
                    </tbody></table></div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="stack" style={{ gap: 12 }}>
                  {pending && plan.length === 0 ? <p className="cell-sub">Computing outcomes…</p> : (
                    <>
                      <div className="table-wrap"><table className="dtable compact">
                        <thead><tr><th>Field</th><th>Current</th><th>Outcome</th></tr></thead>
                        <tbody>
                          {plan.map((p) => (
                            <tr key={p.code}>
                              <td className="mono">{p.code}</td>
                              <td className="cell-sub">{p.currentSource}</td>
                              <td>
                                {p.outcome === "apply" && <Pill tone="green" dot={false}>applies now</Pill>}
                                {p.outcome === "approval" && <span className="row" style={{ gap: 6 }}><Pill tone="yellow" dot={false}>needs approval</Pill><span className="cell-sub">{p.reason}</span></span>}
                                {p.outcome === "blocked" && <span className="row" style={{ gap: 6, flexWrap: "wrap" }}><Pill tone="red" dot={false}>blocked</Pill><span className="cell-sub">{p.reason}</span><Link href={`/data-flow/protection-rules?field=${p.code}`} className="row-link" onClick={onClose}>View item →</Link></span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table></div>
                      {blocked.length > 0 && <div className="notice warn"><div className="notice-title">{blocked.length} field(s) blocked</div><div>Remove them to continue — a blocked field is never forced through: {blocked.map((b) => b.code).join(", ")}.</div></div>}
                      {needApproval.length > 0 && (
                        <label className="fld"><span>Reason (required — {needApproval.length} field(s) need DPO approval)</span>
                          <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this change is needed." />
                        </label>
                      )}

                      {/* Move to a custom template (optional) — group the applied rules under a template. */}
                      <div className="stack" style={{ gap: 6, borderTop: "1px solid var(--border-soft)", paddingTop: 10 }}>
                        <label className="fld"><span className="row" style={{ gap: 6, alignItems: "center" }}><FolderInput size={13} /> Move to a custom template <span className="cell-sub">(optional)</span></span>
                          <select className="input" value={placement} onChange={(e) => { setPlacement(e.target.value); setTplErr(null); }}>
                            <option value="">No template — standalone rule</option>
                            {templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
                            <option value="__new__">+ Create a new template…</option>
                          </select>
                        </label>
                        {placement === "__new__" && (
                          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                            <input className="input sm" style={{ flex: "1 1 180px" }} placeholder="New template name" value={newTplName} onChange={(e) => setNewTplName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createTemplate(); } }} />
                            <button className="btn sm" disabled={!newTplName.trim() || tplBusy} onClick={createTemplate}>{tplBusy ? "Creating…" : "Create template"}</button>
                          </div>
                        )}
                        {tplErr && <span className="cell-sub" style={{ color: "var(--red)" }}>{tplErr}</span>}
                        {placement && placement !== "__new__" && <span className="cell-sub">Fields applied now are added to “{templates.find((t) => t.key === placement)?.name}”. Fields routed to approval stay as-is until approved.</span>}
                      </div>
                      {error && <div className="notice danger"><div className="notice-title">Refused</div><div>{error}</div></div>}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {!result && (
          <div className="std-modal-foot">
            {step > startStep ? <button className="btn" onClick={() => setStep((s) => s - 1)}>Back</button> : <button className="btn" onClick={onClose}>Cancel</button>}
            {step < 3 ? <button className="btn primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Next</button>
              : <button className="btn primary" disabled={!canSubmit} onClick={submit}>{pending ? "Applying…" : "Apply rule"}</button>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function ResultView({ result, onClose }: { result: SubmitPlanResult; onClose: () => void }) {
  return (
    <div className="stack" style={{ gap: 14 }}>
      {result.applied.length > 0 && (
        <div>
          <div className="row" style={{ gap: 6, marginBottom: 6 }}><Check size={15} style={{ color: "var(--green)" }} /><strong>Applied now ({result.applied.length})</strong></div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {result.applied.map((c) => <Link key={c} href={`/data-flow/protection-rules?field=${c}`} className="filter-chip" onClick={onClose}>{c}</Link>)}
          </div>
        </div>
      )}
      {result.proposed.length > 0 && (
        <div>
          <div className="row" style={{ gap: 6, marginBottom: 6 }}><Clock size={15} style={{ color: "var(--yellow)" }} /><strong>Sent for DPO approval ({result.proposed.length})</strong></div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            {result.proposed.map((c) => <span key={c} className="filter-chip">{c}</span>)}
          </div>
          <Link href="/data-flow/protection-rules?status=pending" className="row-link" onClick={onClose}>See Pending changes →</Link>
        </div>
      )}
      {result.applied.length === 0 && result.proposed.length === 0 && <p className="cell-sub">No changes were made.</p>}
      <p className="cell-sub">Both applied changes and proposals are written to the config audit log automatically.</p>
      <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn primary" onClick={onClose}>Done</button></div>
    </div>
  );
}

/** Inline "Add custom field" inside the picker — never opens the hidden right drawer. */
function InlineAddField({ onCreated }: { onCreated: (f: CatalogField) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [sensitivity, setSensitivity] = useState("Personal");
  const [sample, setSample] = useState("");
  const [collision, setCollision] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const normalized = code.trim().toUpperCase();
  const codeValid = /^[A-Z0-9_]+$/.test(normalized);

  useEffect(() => {
    if (!open || !normalized || !codeValid) { setCollision(null); setChecking(false); return; }
    setChecking(true);
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const { collision } = await checkCollisionAction(normalized);
      if (mine === seq.current) { setCollision(collision ? `${normalized} is already governed by the ${collision.templateName}. Edit that item instead.` : null); setChecking(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [open, normalized, codeValid]);

  const canCreate = open && !!normalized && codeValid && !!name.trim() && !collision && !checking && !pending;
  const create = () => start(async () => {
    const r = await createBareFieldAction({ code: normalized, name, sensitivity, sampleValue: sample });
    if (r.ok) {
      onCreated({ code: normalized, name: name.trim(), sensitivity, source: "No rule", systemRegulated: false, sampleValue: sample.trim() });
      setOpen(false); setCode(""); setName(""); setSample(""); setError(null);
    } else setError(r.error ?? "Failed.");
  });

  if (!open) return <button className="link-btn" onClick={() => setOpen(true)}><Plus size={12} /> Field not listed? Add custom field</button>;

  return (
    <div className="stack" style={{ gap: 8, border: "1px solid var(--border-soft)", borderRadius: 8, padding: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <strong className="cell-primary">New custom field</strong>
        <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close"><X size={14} /></button>
      </div>
      {error && <div className="notice danger" style={{ margin: 0 }}><div>{error}</div></div>}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <label className="fld" style={{ flex: "1 1 160px" }}><span>Field code</span><input className="input mono" value={normalized} onChange={(e) => setCode(e.target.value)} placeholder="WALLET_ID" /></label>
        <label className="fld" style={{ flex: "1 1 160px" }}><span>Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Wallet identifier" /></label>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <label className="fld" style={{ flex: "0 0 150px" }}><span>Sensitivity</span>
          <select className="input" value={sensitivity} onChange={(e) => setSensitivity(e.target.value)}>{SENSITIVITIES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        </label>
        <label className="fld" style={{ flex: "1 1 160px" }}><span>Sample value</span><input className="input" value={sample} onChange={(e) => setSample(e.target.value)} placeholder="e.g. W-771203" /></label>
      </div>
      {normalized && !codeValid && <span className="cell-sub" style={{ color: "var(--red)" }}>Only A–Z, 0–9 and underscores.</span>}
      {checking && <span className="cell-sub">Checking templates…</span>}
      {collision && <div className="notice danger" style={{ margin: 0 }}><div className="row" style={{ gap: 6 }}><AlertTriangle size={13} style={{ color: "var(--red)" }} /> {collision}</div></div>}
      {!collision && !checking && normalized && codeValid && <span className="row cell-sub" style={{ gap: 6, color: "var(--green)" }}><CheckCircle2 size={13} /> Code is free.</span>}
      <div className="row" style={{ gap: 6 }}>
        <button className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn primary sm" disabled={!canCreate} onClick={create}>{pending ? "Adding…" : "Add & select"}</button>
      </div>
    </div>
  );
}
