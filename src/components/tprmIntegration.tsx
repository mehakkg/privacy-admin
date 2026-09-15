"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Pill, type PillTone } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { setTprmIntegrationAction, importProcessorFromVendorAction } from "@/app/actions/integration";
import type { ActionResult } from "@/app/actions/requests";

const RISK_TONE: Record<string, PillTone> = { low: "gray", medium: "yellow", high: "red", critical: "red" };
interface VendorOpt { id: string; name: string; category: string; riskRating: string }

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });
  return { pending, result, run };
}

/** SCREEN 1 — the Settings → Integrations toggle row, with a confirmation modal
 *  on enable (it disables a creation path — a structural change, not cosmetic). */
export function TprmToggle({ enabled, linkedCount }: { enabled: boolean; linkedCount: number }) {
  const { pending, result, run } = useRun();
  const [confirming, setConfirming] = useState(false);

  const toggle = () => {
    if (!enabled) setConfirming(true);        // turning ON needs confirmation
    else run(() => setTprmIntegrationAction(false)); // turning OFF is lower-risk
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}><div className="card-body">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ maxWidth: 620 }}>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <strong>TPRM Integration</strong>
            {enabled ? <Pill tone="green">Enabled — Processor creation imports from TPRM</Pill> : <Pill tone="gray">Off</Pill>}
          </div>
          <p className="cell-sub" style={{ margin: "4px 0 0" }}>
            When enabled, Vendors are created and managed exclusively in Vendor Risk (TPRM). Privacy&rsquo;s Processor records import from TPRM Vendors instead of creating new ones.
          </p>
        </div>
        <button className={`switch${enabled ? " on" : ""}`} role="switch" aria-checked={enabled} disabled={pending} onClick={toggle}><span className="switch-knob" /></button>
      </div>

      {!enabled && linkedCount > 0 && (
        <p className="cell-sub" style={{ marginTop: 10, color: "var(--yellow)" }}>
          {linkedCount} Processor record{linkedCount === 1 ? "" : "s"} remain linked to TPRM Vendors. Turning integration off does not remove these links.
        </p>
      )}
      <ActionError result={result} />

      {confirming && (
        <div className="modal-scrim" onClick={() => setConfirming(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Enable TPRM Integration?</h3>
            <p className="cell-sub">Turning this on disables new Processor creation directly in Privacy. Existing Processor records are unaffected. Continue?</p>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn primary" disabled={pending} onClick={() => run(() => setTprmIntegrationAction(true), () => setConfirming(false))}>Confirm</button>
              <button className="btn ghost" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div></div>
  );
}

/** SCREEN 2 — "Import Processor from TPRM Vendor" (shown when the flag is on). */
export function ImportProcessorButton({ vendors }: { vendors: VendorOpt[] }) {
  const { pending, result, run } = useRun();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [vendorId, setVendorId] = useState("");
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [scope, setScope] = useState("");
  const [retention, setRetention] = useState("");

  const chosen = vendors.find((v) => v.id === vendorId);
  const filtered = useMemo(() => vendors.filter((v) => v.name.toLowerCase().includes(q.toLowerCase())), [vendors, q]);

  const reset = () => { setStep(1); setVendorId(""); setQ(""); setName(""); setScope(""); setRetention(""); };
  const close = () => { setOpen(false); reset(); };

  return (
    <>
      <button className="btn primary sm" onClick={() => setOpen(true)}>Import Processor from TPRM Vendor</button>
      {open && (
        <div className="slideover-scrim" onClick={close}>
          <aside className="slideover" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <header className="slideover-head"><h2 style={{ margin: 0, fontSize: 15 }}>Import processor from TPRM</h2><button className="icon-btn" onClick={close} aria-label="Close"><X size={16} /></button></header>
            <div className="slideover-body">
              {step === 1 && (
                <>
                  <div className="section-label" style={{ marginTop: 0 }}>Select vendor</div>
                  {vendors.length === 0 ? (
                    <p className="cell-sub">No vendors found in TPRM. <Link href="/vendor-risk/register" className="row-link">Create a vendor in Vendor Risk →</Link></p>
                  ) : (
                    <>
                      <input className="input" placeholder="Search TPRM vendors…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
                      <div className="stack" style={{ gap: 4, maxHeight: 320, overflowY: "auto" }}>
                        {filtered.map((v) => (
                          <button key={v.id} className={`pick-item${vendorId === v.id ? " on" : ""}`} onClick={() => setVendorId(v.id)}>
                            <span className="row" style={{ justifyContent: "space-between" }}>
                              <span className="cell-primary">{v.name}</span>
                              <Pill tone={RISK_TONE[v.riskRating]}>{v.riskRating}</Pill>
                            </span>
                            <span className="cell-sub">{v.category}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <div className="wiz-actions"><span /><button className="btn primary" disabled={!vendorId} onClick={() => { setName(chosen?.name ?? ""); setStep(2); }}>Next</button></div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="section-label" style={{ marginTop: 0 }}>Processor-specific details</div>
                  <p className="cell-sub" style={{ marginTop: 0 }}>Vendor name, category, risk and DPA are pulled from TPRM — only what&rsquo;s specific to this processing relationship is captured here.</p>
                  <label className="field"><span className="field-label">Processor record label</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
                  <label className="field" style={{ marginTop: 10 }}><span className="field-label">Contract scope (this processing activity)</span><textarea className="input" style={{ minHeight: 60 }} value={scope} onChange={(e) => setScope(e.target.value)} /></label>
                  <label className="field" style={{ marginTop: 10 }}><span className="field-label">Retention terms (tied to this purpose)</span><input className="input" value={retention} onChange={(e) => setRetention(e.target.value)} /></label>
                  <div className="wiz-actions"><button className="btn ghost" onClick={() => setStep(1)}>Back</button><button className="btn primary" onClick={() => setStep(3)}>Next</button></div>
                </>
              )}

              {step === 3 && chosen && (
                <>
                  <div className="section-label" style={{ marginTop: 0 }}>Confirm</div>
                  <dl className="kv">
                    <div style={{ display: "contents" }}><dt>Vendor (from TPRM)</dt><dd><span className="row" style={{ gap: 6 }}>{chosen.name} <Pill tone={RISK_TONE[chosen.riskRating]}>{chosen.riskRating}</Pill></span></dd></div>
                    <div style={{ display: "contents" }}><dt>Category</dt><dd>{chosen.category}</dd></div>
                    <div style={{ display: "contents" }}><dt>Record label</dt><dd>{name || chosen.name}</dd></div>
                    <div style={{ display: "contents" }}><dt>Contract scope</dt><dd>{scope || "—"}</dd></div>
                    <div style={{ display: "contents" }}><dt>Retention</dt><dd>{retention || "—"}</dd></div>
                  </dl>
                  <p className="cell-sub">The Vendor ID is stored on the Processor record; vendor detail stays a live pull.</p>
                  <div className="wiz-actions">
                    <button className="btn ghost" onClick={() => setStep(2)}>Back</button>
                    <button className="btn primary" disabled={pending} onClick={() => run(() => importProcessorFromVendorAction(vendorId, { name, processorScope: scope, retentionTerms: retention }), close)}>{pending ? "Importing…" : "Import processor"}</button>
                  </div>
                </>
              )}
              <ActionError result={result} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
